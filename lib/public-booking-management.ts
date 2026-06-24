import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateAggregatedSlotCandidates, sortEligibleResources } from "@/lib/public-slots";
import {
  databaseDateToLocalDateString,
  databaseTimeToString,
  localDateStringToDatabaseDate,
  utcToLocalDateKey,
} from "@/lib/timezone";
import { publicManageTokenSchema, publicRescheduleSchema } from "@/lib/validations/public-booking";

export class PublicManagementError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PublicManagementError";
  }
}

export function hashPublicManageToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function assertCanManage(booking: {
  status: string;
  startDateTime: Date;
  organization: { cancellationNoticeMinutes: number };
}, now: Date) {
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
    throw new PublicManagementError("STATUS", "Esta reserva ya no admite cambios.");
  }
  const deadline = new Date(booking.startDateTime.getTime() - booking.organization.cancellationNoticeMinutes * 60_000);
  if (now >= deadline) {
    throw new PublicManagementError("NOTICE", "El plazo para modificar esta reserva ya finalizó.");
  }
}

async function findManageableBooking(transaction: Prisma.TransactionClient, tokenHash: string, now: Date) {
  return transaction.booking.findFirst({
    where: { manageTokenHash: tokenHash, manageTokenExpiresAt: { gt: now }, source: "PUBLIC" },
    include: {
      customer: true,
      organization: true,
      service: {
        include: {
          serviceResources: {
            where: { resource: { isActive: true } },
            include: { resource: { include: { availabilityRules: true } } },
          },
        },
      },
    },
  });
}

export async function getPublicBookingAuthorization(token: string, now = new Date()) {
  const parsed = publicManageTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const manageTokenHash = hashPublicManageToken(parsed.data);
  return prisma.booking.findFirst({
    where: { manageTokenHash, manageTokenExpiresAt: { gt: now }, source: "PUBLIC" },
    select: {
      id: true,
      organizationId: true,
      serviceId: true,
      attendeesCount: true,
      startDateTime: true,
      status: true,
      organization: { select: { slug: true, timezone: true, cancellationNoticeMinutes: true } },
    },
  });
}

export async function getPublicBookingByManageToken(token: string, now = new Date()) {
  const authorization = await getPublicBookingAuthorization(token, now);
  if (!authorization) return null;
  const booking = await prisma.booking.findUnique({
    where: { id: authorization.id },
    select: {
      referenceCode: true,
      status: true,
      startDateTime: true,
      endDateTime: true,
      attendeesCount: true,
      service: { select: { name: true } },
      organization: { select: { name: true, timezone: true, cancellationNoticeMinutes: true } },
    },
  });
  if (!booking) return null;
  const deadline = new Date(booking.startDateTime.getTime() - booking.organization.cancellationNoticeMinutes * 60_000);
  return {
    referenceCode: booking.referenceCode,
    status: booking.status,
    startDateTime: booking.startDateTime,
    endDateTime: booking.endDateTime,
    attendeesCount: booking.attendeesCount,
    serviceName: booking.service.name,
    organizationName: booking.organization.name,
    timezone: booking.organization.timezone,
    canManage: (booking.status === "PENDING" || booking.status === "CONFIRMED") && now < deadline,
    cancellationDeadline: deadline,
  };
}

export async function cancelPublicBooking(token: string, now = new Date()) {
  const parsed = publicManageTokenSchema.safeParse(token);
  if (!parsed.success) throw new PublicManagementError("INVALID_TOKEN", "No pudimos validar el enlace de gestión.");
  const tokenHash = hashPublicManageToken(parsed.data);
  return prisma.$transaction(async (transaction) => {
    const lockKey = `public-manage:${tokenHash}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const previous = await findManageableBooking(transaction, tokenHash, now);
    if (!previous) throw new PublicManagementError("INVALID_TOKEN", "No pudimos validar el enlace de gestión.");
    assertCanManage(previous, now);
    const booking = await transaction.booking.update({
      where: { id: previous.id },
      data: { status: "CANCELLED", manageTokenHash: null, manageTokenExpiresAt: null },
    });
    await transaction.auditLog.create({
      data: {
        organizationId: previous.organizationId,
        userId: null,
        action: "booking.cancelled",
        entityType: "Booking",
        entityId: previous.id,
        metadata: { source: "PUBLIC", previous: { status: previous.status }, new: { status: "CANCELLED" } },
      },
    });
    return { booking, previous };
  }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
}

export async function reschedulePublicBooking(rawInput: unknown, now = new Date()) {
  const parsed = publicRescheduleSchema.safeParse(rawInput);
  if (!parsed.success) throw new PublicManagementError("INVALID_INPUT", "No pudimos validar la reprogramación.");
  const tokenHash = hashPublicManageToken(parsed.data.token);
  const startDateTime = new Date(parsed.data.startDateTime);
  const newToken = randomBytes(32).toString("base64url");
  const newTokenHash = hashPublicManageToken(newToken);

  return prisma.$transaction(async (transaction) => {
    const managementLock = `public-manage:${tokenHash}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${managementLock}, 0))`;
    const previous = await findManageableBooking(transaction, tokenHash, now);
    if (!previous) throw new PublicManagementError("INVALID_TOKEN", "No pudimos validar el enlace de gestión.");
    assertCanManage(previous, now);
    if (!previous.organization.publicBookingEnabled || !previous.service.isActive || !previous.service.isPublic) {
      throw new PublicManagementError("UNAVAILABLE", "La reprogramación no está disponible en este momento.");
    }
    if (!previous.service.serviceResources.length) {
      throw new PublicManagementError("UNAVAILABLE", "No hay recursos disponibles para reprogramar.");
    }

    const localDate = utcToLocalDateKey(startDateTime, previous.organization.timezone);
    const resources = sortEligibleResources(previous.service.serviceResources.map(({ resource }) => ({
      id: resource.id,
      isDefault: resource.isDefault,
      availabilityRules: resource.availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: databaseTimeToString(rule.startTime),
        endTime: databaseTimeToString(rule.endTime),
      })),
    })));

    for (const resource of resources) {
      const slotLock = `${previous.organizationId}:${previous.serviceId}:${resource.id}:${localDate}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${slotLock}, 0))`;
      const [blockedDates, bookings] = await Promise.all([
        transaction.blockedDate.findMany({
          where: {
            organizationId: previous.organizationId,
            date: localDateStringToDatabaseDate(localDate),
            OR: [{ resourceId: null }, { resourceId: resource.id }],
          },
          select: { date: true, resourceId: true },
        }),
        transaction.booking.findMany({
          where: {
            id: { not: previous.id },
            organizationId: previous.organizationId,
            serviceId: previous.serviceId,
            resourceId: resource.id,
            status: { in: ["PENDING", "CONFIRMED"] },
            startDateTime: { lt: new Date(startDateTime.getTime() + previous.service.durationMinutes * 60_000) },
            endDateTime: { gt: startDateTime },
          },
          select: { resourceId: true, startDateTime: true, endDateTime: true, attendeesCount: true },
        }),
      ]);
      const candidate = generateAggregatedSlotCandidates({
        timeZone: previous.organization.timezone,
        slotIntervalMinutes: previous.organization.slotIntervalMinutes,
        minimumBookingNoticeMinutes: previous.organization.minimumBookingNoticeMinutes,
        bookingWindowDays: previous.organization.bookingWindowDays,
        durationMinutes: previous.service.durationMinutes,
        capacity: previous.service.capacity,
        attendeesCount: previous.attendeesCount,
        now,
        rangeStart: startDateTime,
        rangeEnd: new Date(startDateTime.getTime() + 1),
        resources: [resource],
        blockedDates: blockedDates.map((item) => ({ date: databaseDateToLocalDateString(item.date), resourceId: item.resourceId })),
        bookings,
      })[0];
      if (!candidate || candidate.startDateTime.getTime() !== startDateTime.getTime()) continue;

      const booking = await transaction.booking.update({
        where: { id: previous.id },
        data: {
          resourceId: resource.id,
          startDateTime: candidate.startDateTime,
          endDateTime: candidate.endDateTime,
          manageTokenHash: newTokenHash,
          manageTokenExpiresAt: new Date(candidate.endDateTime.getTime() + 30 * 86_400_000),
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: previous.organizationId,
          userId: null,
          action: "booking.rescheduled",
          entityType: "Booking",
          entityId: previous.id,
          metadata: {
            source: "PUBLIC",
            previous: { resourceId: previous.resourceId, startDateTime: previous.startDateTime, endDateTime: previous.endDateTime },
            new: { resourceId: resource.id, startDateTime: candidate.startDateTime, endDateTime: candidate.endDateTime },
          },
        },
      });
      return { booking, previous, newToken };
    }
    throw new PublicManagementError("UNAVAILABLE", "El horario ya no está disponible. Elegí otro.");
  }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
}
