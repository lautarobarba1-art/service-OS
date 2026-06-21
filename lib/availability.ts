import { prisma } from "@/lib/prisma";
import {
  databaseDateToLocalDateString,
  databaseTimeToString,
  localDateStringToDatabaseDate,
  utcToLocalDateKey,
  validateSlotAvailability,
} from "@/lib/timezone";

export async function validateResourceSlotAvailability(input: {
  organizationId: string;
  resourceId: string;
  startDateTime: Date;
  endDateTime: Date;
}) {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { timezone: true },
  });
  if (!organization) return { valid: false as const, reason: "OUTSIDE_AVAILABILITY" as const };

  const localDate = utcToLocalDateKey(input.startDateTime, organization.timezone);
  const databaseDate = localDateStringToDatabaseDate(localDate);
  const [resource, rules, blockedDates] = await Promise.all([
    prisma.resource.findFirst({ where: { id: input.resourceId, organizationId: input.organizationId }, select: { id: true } }),
    prisma.availabilityRule.findMany({ where: { organizationId: input.organizationId, resourceId: input.resourceId } }),
    prisma.blockedDate.findMany({
      where: {
        organizationId: input.organizationId,
        date: databaseDate,
        OR: [{ resourceId: null }, { resourceId: input.resourceId }],
      },
    }),
  ]);
  if (!resource) return { valid: false as const, reason: "OUTSIDE_AVAILABILITY" as const };

  return validateSlotAvailability({
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    timeZone: organization.timezone,
    resourceId: input.resourceId,
    availabilityRules: rules.map((rule) => ({
      dayOfWeek: rule.dayOfWeek,
      startTime: databaseTimeToString(rule.startTime),
      endTime: databaseTimeToString(rule.endTime),
    })),
    blockedDates: blockedDates.map((item) => ({
      date: databaseDateToLocalDateString(item.date),
      resourceId: item.resourceId,
    })),
  });
}
