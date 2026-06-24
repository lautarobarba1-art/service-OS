import {
  localDateKey,
  timeStringToSeconds,
  utcToZonedParts,
  validateSlotAvailability,
  zonedDateTimeToUtc,
  type AvailabilityWindow,
  type BlockedDateWindow,
} from "@/lib/timezone";

export type SlotResource = {
  id: string;
  isDefault: boolean;
  availabilityRules: AvailabilityWindow[];
};

export type SlotBooking = {
  resourceId: string;
  startDateTime: Date;
  endDateTime: Date;
  attendeesCount: number;
};

export type InternalSlotCandidate = {
  startDateTime: Date;
  endDateTime: Date;
  eligibleResourceIds: string[];
};

export type PublicSlot = {
  startDateTime: Date;
  endDateTime: Date;
};

function shiftLocalDate(date: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function compareLocalDate(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}

export function sortEligibleResources(resources: SlotResource[]) {
  return [...resources].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function generateAggregatedSlotCandidates(input: {
  timeZone: string;
  slotIntervalMinutes: number;
  minimumBookingNoticeMinutes: number;
  bookingWindowDays: number;
  durationMinutes: number;
  capacity: number;
  attendeesCount: number;
  now: Date;
  rangeStart: Date;
  rangeEnd: Date;
  resources: SlotResource[];
  blockedDates: BlockedDateWindow[];
  bookings: SlotBooking[];
}): InternalSlotCandidate[] {
  if (
    input.slotIntervalMinutes < 5 || input.durationMinutes < 1 || input.capacity < 1 || input.attendeesCount < 1 ||
    input.rangeEnd <= input.rangeStart || input.attendeesCount > input.capacity
  ) return [];

  const minimumStart = new Date(input.now.getTime() + input.minimumBookingNoticeMinutes * 60_000);
  const maximumStart = new Date(input.now.getTime() + input.bookingWindowDays * 86_400_000);
  const effectiveStart = new Date(Math.max(input.rangeStart.getTime(), minimumStart.getTime()));
  const effectiveEnd = new Date(Math.min(input.rangeEnd.getTime(), maximumStart.getTime()));
  if (effectiveEnd <= effectiveStart) return [];

  const firstParts = utcToZonedParts(effectiveStart, input.timeZone);
  const lastParts = utcToZonedParts(effectiveEnd, input.timeZone);
  const lastLocalDate = { year: lastParts.year, month: lastParts.month, day: lastParts.day };
  const candidates = new Map<string, InternalSlotCandidate>();
  const resources = sortEligibleResources(input.resources);

  for (
    let localDate = { year: firstParts.year, month: firstParts.month, day: firstParts.day };
    compareLocalDate(localDate, lastLocalDate) <= 0;
    localDate = shiftLocalDate(localDate, 1)
  ) {
    const dayOfWeek = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
    for (const resource of resources) {
      for (const rule of resource.availabilityRules.filter((item) => item.dayOfWeek === dayOfWeek)) {
        const ruleStart = timeStringToSeconds(rule.startTime);
        const ruleEnd = timeStringToSeconds(rule.endTime);
        const lastStart = ruleEnd - input.durationMinutes * 60;
        for (let startSecond = ruleStart; startSecond <= lastStart; startSecond += input.slotIntervalMinutes * 60) {
          let startDateTime: Date;
          try {
            startDateTime = zonedDateTimeToUtc({
              ...localDate,
              hour: Math.floor(startSecond / 3600),
              minute: Math.floor((startSecond % 3600) / 60),
              second: startSecond % 60,
            }, input.timeZone);
          } catch {
            continue;
          }
          if (startDateTime < effectiveStart || startDateTime >= effectiveEnd) continue;
          const endDateTime = new Date(startDateTime.getTime() + input.durationMinutes * 60_000);
          const availability = validateSlotAvailability({
            startDateTime,
            endDateTime,
            timeZone: input.timeZone,
            resourceId: resource.id,
            availabilityRules: resource.availabilityRules,
            blockedDates: input.blockedDates,
          });
          if (!availability.valid) continue;

          const usedCapacity = input.bookings
            .filter((booking) =>
              booking.resourceId === resource.id &&
              booking.startDateTime < endDateTime && booking.endDateTime > startDateTime,
            )
            .reduce((total, booking) => total + booking.attendeesCount, 0);
          if (usedCapacity + input.attendeesCount > input.capacity) continue;

          const key = startDateTime.toISOString();
          const existing = candidates.get(key);
          if (existing) existing.eligibleResourceIds.push(resource.id);
          else candidates.set(key, { startDateTime, endDateTime, eligibleResourceIds: [resource.id] });
        }
      }
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      eligibleResourceIds: resources.filter((resource) => candidate.eligibleResourceIds.includes(resource.id)).map((resource) => resource.id),
    }))
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
}

export function toPublicSlots(candidates: InternalSlotCandidate[]): PublicSlot[] {
  return candidates.map(({ startDateTime, endDateTime }) => ({ startDateTime, endDateTime }));
}

export function selectDeterministicResourceId(candidate: InternalSlotCandidate) {
  return candidate.eligibleResourceIds[0] ?? null;
}

export function localDateRangeForQuery(start: Date, end: Date, timeZone: string) {
  return {
    start: localDateKey(utcToZonedParts(start, timeZone)),
    end: localDateKey(utcToZonedParts(end, timeZone)),
  };
}
