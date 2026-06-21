import { describe, expect, it } from "vitest";

import {
  utcToLocalDateKey,
  utcToZonedParts,
  validateSlotAvailability,
  zonedDateTimeToUtc,
} from "@/lib/timezone";

const mondayRules = [{ dayOfWeek: 1, startTime: "09:00", endTime: "13:00" }];
const baseSlot = {
  startDateTime: "2026-06-22T12:00:00.000Z", // 09:00 in Buenos Aires
  endDateTime: "2026-06-22T13:00:00.000Z",
  timeZone: "America/Argentina/Buenos_Aires",
  resourceId: "resource-a",
  availabilityRules: mondayRules,
  blockedDates: [],
};

describe("timezone helpers", () => {
  it("converts UTC into local time in different IANA timezones", () => {
    const instant = "2026-06-22T15:00:00.000Z";
    expect(utcToZonedParts(instant, "America/Argentina/Buenos_Aires")).toMatchObject({ hour: 12, day: 22, month: 6 });
    expect(utcToZonedParts(instant, "Europe/Madrid")).toMatchObject({ hour: 17, day: 22, month: 6 });
    expect(utcToLocalDateKey(instant, "Asia/Tokyo")).toBe("2026-06-23");
  });

  it("accepts the Buenos Aires alias stored by existing organizations", () => {
    expect(utcToZonedParts("2026-06-22T13:00:00.000Z", "America/Buenos_Aires")).toMatchObject({ dayOfWeek: 1, hour: 10 });
    expect(validateSlotAvailability({
      startDateTime: "2026-06-22T13:00:00.000Z",
      endDateTime: "2026-06-22T14:00:00.000Z",
      timeZone: "America/Buenos_Aires",
      resourceId: "resource-a",
      availabilityRules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }],
      blockedDates: [],
    })).toEqual({ valid: true });
  });

  it("converts local business time back to UTC", () => {
    const utc = zonedDateTimeToUtc(
      { year: 2026, month: 6, day: 22, hour: 12, minute: 30, second: 0 },
      "America/Argentina/Buenos_Aires",
    );
    expect(utc.toISOString()).toBe("2026-06-22T15:30:00.000Z");
  });

  it("uses the correct DST offset in winter and summer", () => {
    expect(utcToZonedParts("2026-01-15T14:00:00.000Z", "America/New_York").hour).toBe(9);
    expect(utcToZonedParts("2026-07-15T13:00:00.000Z", "America/New_York").hour).toBe(9);
    expect(
      zonedDateTimeToUtc(
        { year: 2026, month: 7, day: 15, hour: 9, minute: 0, second: 0 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-07-15T13:00:00.000Z");
  });

  it("rejects a local time skipped by the DST transition", () => {
    expect(() =>
      zonedDateTimeToUtc(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
        "America/New_York",
      ),
    ).toThrow(/DST/);
  });
});

describe("availability validation", () => {
  it("accepts a slot fully contained in a weekly rule", () => {
    expect(validateSlotAvailability(baseSlot)).toEqual({ valid: true });
  });

  it("rejects a slot outside weekly availability", () => {
    expect(
      validateSlotAvailability({
        ...baseSlot,
        startDateTime: "2026-06-22T11:30:00.000Z", // 08:30 local
        endDateTime: "2026-06-22T12:30:00.000Z",
      }),
    ).toEqual({ valid: false, reason: "OUTSIDE_AVAILABILITY" });
  });

  it("rejects a slot on an organization-wide blocked date", () => {
    expect(
      validateSlotAvailability({ ...baseSlot, blockedDates: [{ date: "2026-06-22", resourceId: null }] }),
    ).toEqual({ valid: false, reason: "BLOCKED_DATE" });
  });

  it("applies resource blocks only to the selected resource", () => {
    expect(
      validateSlotAvailability({ ...baseSlot, blockedDates: [{ date: "2026-06-22", resourceId: "resource-b" }] }),
    ).toEqual({ valid: true });
    expect(
      validateSlotAvailability({ ...baseSlot, blockedDates: [{ date: "2026-06-22", resourceId: "resource-a" }] }),
    ).toEqual({ valid: false, reason: "BLOCKED_DATE" });
  });
});
