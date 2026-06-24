import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { customerIdentityKeys, normalizeCustomerEmail, normalizeCustomerPhone } from "@/lib/customer-duplicates";
import { prisma } from "@/lib/prisma";
import { generateAggregatedSlotCandidates, sortEligibleResources } from "@/lib/public-slots";
import {
  databaseDateToLocalDateString,
  databaseTimeToString,
  localDateStringToDatabaseDate,
  utcToLocalDateKey,
} from "@/lib/timezone";
import { publicBookingRequestSchema } from "@/lib/validations/public-booking";

export class PublicBookingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PublicBookingError";
  }
}

class PublicIdentityConflictError extends PublicBookingError {
  constructor(public readonly organizationId: string, public readonly entityId: string) {
    super("IDENTITY_CONFLICT", "No pudimos validar los datos de contacto. Revisalos o comunicate con el negocio.");
  }
}

type CustomerMatch = { id: string; email: string | null; phone: string | null; fullName: string };

function isCustomerUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
    && error.meta?.modelName === "Customer";
}

function canonicalPayloadHash(input: {
  serviceId: string;
  startDateTime: string;
  attendeesCount: number;
  fullName: string;
  email: string;
  phone?: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    serviceId: input.serviceId,
    startDateTime: new Date(input.startDateTime).toISOString(),
    attendeesCount: input.attendeesCount,
    fullName: input.fullName.trim(),
    email: normalizeCustomerEmail(input.email),
    phone: normalizeCustomerPhone(input.phone),
  })).digest("hex");
}

async function findCustomerByEmail(transaction: Prisma.TransactionClient, organizationId: string, email: string) {
  const rows = await transaction.$queryRaw<CustomerMatch[]>`
    SELECT "id", "email", "phone", "fullName" FROM "Customer"
    WHERE "organizationId" = CAST(${organizationId} AS uuid)
      AND lower(btrim(COALESCE("email", ''))) = ${normalizeCustomerEmail(email)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function findCustomerByPhone(transaction: Prisma.TransactionClient, organizationId: string, phone?: string) {
  const normalizedPhone = normalizeCustomerPhone(phone);
  if (!normalizedPhone) return null;
  const rows = await transaction.$queryRaw<CustomerMatch[]>`
    SELECT "id", "email", "phone", "fullName" FROM "Customer"
    WHERE "organizationId" = CAST(${organizationId} AS uuid)
      AND regexp_replace(COALESCE("phone", ''), '\D', '', 'g') = ${normalizedPhone}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function resolvePublicCustomer(transaction: Prisma.TransactionClient, input: {
  organizationId: string;
  fullName: string;
  email: string;
  phone?: string;
}) {
  for (const key of customerIdentityKeys(input)) {
    const lockKey = `customer:${input.organizationId}:${key}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }
  const [emailCustomer, phoneCustomer] = await Promise.all([
    findCustomerByEmail(transaction, input.organizationId, input.email),
    findCustomerByPhone(transaction, input.organizationId, input.phone),
  ]);
  if (emailCustomer && phoneCustomer && emailCustomer.id !== phoneCustomer.id) {
    throw new PublicIdentityConflictError(input.organizationId, emailCustomer.id);
  }
  if (emailCustomer) return { customer: emailCustomer, created: false };
  if (phoneCustomer) {
    const existingEmail = normalizeCustomerEmail(phoneCustomer.email);
    if (existingEmail && existingEmail !== normalizeCustomerEmail(input.email)) {
      throw new PublicIdentityConflictError(input.organizationId, phoneCustomer.id);
    }
    return { customer: phoneCustomer, created: false };
  }
  const customer = await transaction.customer.create({
    data: {
      organizationId: input.organizationId,
      fullName: input.fullName.trim(),
      email: normalizeCustomerEmail(input.email),
      phone: normalizeCustomerPhone(input.phone) || null,
      notes: "",
    },
  });
  return { customer, created: true };
}

export async function createPublicBooking(rawInput: unknown, now = new Date()) {
  const parsed = publicBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) throw new PublicBookingError("INVALID_INPUT", "Revisá los datos de la reserva.");
  const input = parsed.data;
  const organization = await prisma.organization.findFirst({
    where: { slug: input.slug, publicBookingEnabled: true },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      bookingConfirmationMode: true,
      slotIntervalMinutes: true,
      minimumBookingNoticeMinutes: true,
      bookingWindowDays: true,
    },
  });
  if (!organization) throw new PublicBookingError("UNAVAILABLE", "La reserva pública no está disponible.");

  const payloadHash = canonicalPayloadHash(input);
  const startDateTime = new Date(input.startDateTime);
  const manageToken = randomBytes(32).toString("base64url");
  const manageTokenHash = createHash("sha256").update(manageToken).digest("hex");

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
      const idempotencyLock = `public-booking:${organization.id}:${input.idempotencyKey}`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))`;
      const existing = await transaction.booking.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: organization.id, idempotencyKey: input.idempotencyKey } },
        include: { customer: true, service: true },
      });
      if (existing) {
        if (existing.idempotencyPayloadHash !== payloadHash) {
          throw new PublicBookingError("IDEMPOTENCY_CONFLICT", "La solicitud cambió. Volvé a elegir el horario.");
        }
        return { booking: existing, customer: existing.customer, service: existing.service, organization, manageToken: null, replayed: true };
      }

      const service = await transaction.service.findFirst({
        where: { id: input.serviceId, organizationId: organization.id, isActive: true, isPublic: true },
        include: {
          serviceResources: {
            where: { resource: { isActive: true } },
            include: { resource: { include: { availabilityRules: true } } },
          },
        },
      });
      if (!service?.serviceResources.length) throw new PublicBookingError("UNAVAILABLE", "El horario ya no está disponible.");
      if (input.attendeesCount > service.capacity) throw new PublicBookingError("CAPACITY", "No hay capacidad para esa cantidad de asistentes.");

      const customerResult = await resolvePublicCustomer(transaction, { ...input, organizationId: organization.id });
      const localDate = utcToLocalDateKey(startDateTime, organization.timezone);
      const sortedResources = sortEligibleResources(service.serviceResources.map(({ resource }) => ({
        id: resource.id,
        isDefault: resource.isDefault,
        availabilityRules: resource.availabilityRules.map((rule) => ({
          dayOfWeek: rule.dayOfWeek,
          startTime: databaseTimeToString(rule.startTime),
          endTime: databaseTimeToString(rule.endTime),
        })),
      })));

      for (const resource of sortedResources) {
        const lockKey = `${organization.id}:${service.id}:${resource.id}:${localDate}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const [blockedDates, bookings] = await Promise.all([
          transaction.blockedDate.findMany({
            where: {
              organizationId: organization.id,
              date: localDateStringToDatabaseDate(localDate),
              OR: [{ resourceId: null }, { resourceId: resource.id }],
            },
            select: { date: true, resourceId: true },
          }),
          transaction.booking.findMany({
            where: {
              organizationId: organization.id,
              serviceId: service.id,
              resourceId: resource.id,
              status: { in: ["PENDING", "CONFIRMED"] },
              startDateTime: { lt: new Date(startDateTime.getTime() + service.durationMinutes * 60_000) },
              endDateTime: { gt: startDateTime },
            },
            select: { resourceId: true, startDateTime: true, endDateTime: true, attendeesCount: true },
          }),
        ]);
        const candidate = generateAggregatedSlotCandidates({
          timeZone: organization.timezone,
          slotIntervalMinutes: organization.slotIntervalMinutes,
          minimumBookingNoticeMinutes: organization.minimumBookingNoticeMinutes,
          bookingWindowDays: organization.bookingWindowDays,
          durationMinutes: service.durationMinutes,
          capacity: service.capacity,
          attendeesCount: input.attendeesCount,
          now,
          rangeStart: startDateTime,
          rangeEnd: new Date(startDateTime.getTime() + 1),
          resources: [resource],
          blockedDates: blockedDates.map((item) => ({ date: databaseDateToLocalDateString(item.date), resourceId: item.resourceId })),
          bookings,
        })[0];
        if (!candidate || candidate.startDateTime.getTime() !== startDateTime.getTime()) continue;

        const status = organization.bookingConfirmationMode === "AUTO_CONFIRM" ? "CONFIRMED" : "PENDING";
        const booking = await transaction.booking.create({
          data: {
            organizationId: organization.id,
            customerId: customerResult.customer.id,
            serviceId: service.id,
            resourceId: resource.id,
            startDateTime: candidate.startDateTime,
            endDateTime: candidate.endDateTime,
            attendeesCount: input.attendeesCount,
            status,
            source: "PUBLIC",
            idempotencyKey: input.idempotencyKey,
            idempotencyPayloadHash: payloadHash,
            manageTokenHash,
            manageTokenExpiresAt: new Date(candidate.endDateTime.getTime() + 30 * 86_400_000),
          },
        });
        if (customerResult.created) {
          await transaction.auditLog.create({
            data: {
              organizationId: organization.id,
              userId: null,
              action: "customer.created",
              entityType: "Customer",
              entityId: customerResult.customer.id,
              metadata: { source: "PUBLIC" },
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            userId: null,
            action: "booking.created",
            entityType: "Booking",
            entityId: booking.id,
            metadata: { source: "PUBLIC", serviceId: service.id, resourceId: resource.id, attendeesCount: input.attendeesCount },
          },
        });
        return { booking, customer: customerResult.customer, service, organization, manageToken, replayed: false };
      }
      throw new PublicBookingError("UNAVAILABLE", "El horario ya no está disponible. Elegí otro.");
        }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
      } catch (error) {
        // If another writer committed the same identity after our lookup, the
        // failed transaction is rolled back. Retry once and reuse that row.
        if (attempt === 0 && isCustomerUniqueConflict(error)) {
          console.warn("Reintentando reserva pública después de una colisión de identidad de cliente.");
          continue;
        }
        throw error;
      }
    }
    throw new PublicBookingError("IDENTITY_CONFLICT", "No pudimos validar los datos de contacto. Revisalos o comunicate con el negocio.");
  } catch (error) {
    if (error instanceof PublicIdentityConflictError) {
      try {
        await prisma.auditLog.create({
          data: {
            organizationId: error.organizationId,
            userId: null,
            action: "public_booking.identity_conflict",
            entityType: "Customer",
            entityId: error.entityId,
            metadata: { source: "PUBLIC" },
          },
        });
      } catch (auditError) {
        console.error("No se pudo auditar el conflicto de identidad pública:", auditError);
      }
    }
    if (isCustomerUniqueConflict(error)) {
      throw new PublicBookingError("IDENTITY_CONFLICT", "No pudimos validar los datos de contacto. Revisalos o comunicate con el negocio.");
    }
    throw error;
  }
}
