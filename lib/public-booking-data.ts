import "server-only";

import { z } from "zod";

import { databaseDateToLocalDateString, databaseTimeToString, localDateStringToDatabaseDate } from "@/lib/timezone";
import { prisma } from "@/lib/prisma";
import {
  generateAggregatedSlotCandidates,
  localDateRangeForQuery,
  toPublicSlots,
} from "@/lib/public-slots";

const publicSlotRequestSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  serviceId: z.uuid(),
  rangeStart: z.date(),
  rangeEnd: z.date(),
  attendeesCount: z.number().int().min(1).max(100),
  excludeBookingId: z.uuid().optional(),
});

export async function getPublicOrganizationForRequest(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return prisma.organization.findFirst({
    where: { slug, publicBookingEnabled: true },
    select: { id: true, name: true, slug: true, timezone: true },
  });
}

export async function getPublishedServicesBySlug(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const organization = await prisma.organization.findFirst({
    where: { slug, publicBookingEnabled: true },
    select: {
      name: true,
      timezone: true,
      services: {
        where: { isActive: true, isPublic: true, serviceResources: { some: { resource: { isActive: true } } } },
        select: { id: true, name: true, description: true, durationMinutes: true, price: true, capacity: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!organization) return null;
  return {
    organizationName: organization.name,
    timezone: organization.timezone,
    services: organization.services.map((service) => ({ ...service, price: service.price.toFixed(2) })),
  };
}

export async function getPublicServiceSlots(rawInput: z.input<typeof publicSlotRequestSchema>, now = new Date()) {
  const parsed = publicSlotRequestSchema.safeParse(rawInput);
  if (!parsed.success) return null;
  const input = parsed.data;
  const organization = await prisma.organization.findFirst({
    where: { slug: input.slug, publicBookingEnabled: true },
    select: {
      id: true,
      timezone: true,
      slotIntervalMinutes: true,
      minimumBookingNoticeMinutes: true,
      bookingWindowDays: true,
    },
  });
  if (!organization) return null;

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, organizationId: organization.id, isActive: true, isPublic: true },
    select: {
      id: true,
      durationMinutes: true,
      capacity: true,
      serviceResources: {
        where: { resource: { isActive: true } },
        select: {
          resource: {
            select: {
              id: true,
              isDefault: true,
              availabilityRules: { select: { dayOfWeek: true, startTime: true, endTime: true } },
            },
          },
        },
      },
    },
  });
  if (!service?.serviceResources.length) return [];

  const minimumStart = new Date(now.getTime() + organization.minimumBookingNoticeMinutes * 60_000);
  const maximumEnd = new Date(now.getTime() + organization.bookingWindowDays * 86_400_000);
  const queryStart = new Date(Math.max(input.rangeStart.getTime(), minimumStart.getTime()));
  const queryEnd = new Date(Math.min(input.rangeEnd.getTime(), maximumEnd.getTime()));
  if (queryEnd <= queryStart) return [];
  const localRange = localDateRangeForQuery(queryStart, queryEnd, organization.timezone);
  const resourceIds = service.serviceResources.map((item) => item.resource.id);
  const [blockedDates, bookings] = await Promise.all([
    prisma.blockedDate.findMany({
      where: {
        organizationId: organization.id,
        date: { gte: localDateStringToDatabaseDate(localRange.start), lte: localDateStringToDatabaseDate(localRange.end) },
        OR: [{ resourceId: null }, { resourceId: { in: resourceIds } }],
      },
      select: { date: true, resourceId: true },
    }),
    prisma.booking.findMany({
      where: {
        organizationId: organization.id,
        serviceId: service.id,
        resourceId: { in: resourceIds },
        status: { in: ["PENDING", "CONFIRMED"] },
        id: input.excludeBookingId ? { not: input.excludeBookingId } : undefined,
        startDateTime: { lt: queryEnd },
        endDateTime: { gt: queryStart },
      },
      select: { resourceId: true, startDateTime: true, endDateTime: true, attendeesCount: true },
    }),
  ]);

  return toPublicSlots(generateAggregatedSlotCandidates({
    timeZone: organization.timezone,
    slotIntervalMinutes: organization.slotIntervalMinutes,
    minimumBookingNoticeMinutes: organization.minimumBookingNoticeMinutes,
    bookingWindowDays: organization.bookingWindowDays,
    durationMinutes: service.durationMinutes,
    capacity: service.capacity,
    attendeesCount: input.attendeesCount,
    now,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    resources: service.serviceResources.map(({ resource }) => ({
      id: resource.id,
      isDefault: resource.isDefault,
      availabilityRules: resource.availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: databaseTimeToString(rule.startTime),
        endTime: databaseTimeToString(rule.endTime),
      })),
    })),
    blockedDates: blockedDates.map((item) => ({ date: databaseDateToLocalDateString(item.date), resourceId: item.resourceId })),
    bookings,
  }));
}
