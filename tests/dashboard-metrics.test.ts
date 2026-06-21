import { describe, expect, it } from "vitest";

import { aggregateBookingStatuses, buildBookingSeries, getDashboardPeriodRange, percentage } from "@/lib/dashboard-metrics";

describe("dashboard period ranges", () => {
  it("uses organization midnight instead of server UTC", () => {
    const range = getDashboardPeriodRange("day", "America/Argentina/Buenos_Aires", new Date("2026-06-22T15:00:00Z"));
    expect(range.start.toISOString()).toBe("2026-06-22T03:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-23T03:00:00.000Z");
  });

  it("creates a Monday-to-Monday weekly range across DST", () => {
    const range = getDashboardPeriodRange("week", "America/New_York", new Date("2026-03-11T15:00:00Z"));
    expect(range.start.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-16T04:00:00.000Z");
  });
});

describe("dashboard aggregation", () => {
  const bookings = [
    { startDateTime: new Date("2026-06-22T12:00:00Z"), status: "CONFIRMED" as const },
    { startDateTime: new Date("2026-06-22T13:00:00Z"), status: "CANCELLED" as const },
    { startDateTime: new Date("2026-06-23T12:00:00Z"), status: "NO_SHOW" as const },
  ];

  it("groups bookings into local weekly buckets", () => {
    const range = getDashboardPeriodRange("week", "America/Argentina/Buenos_Aires", new Date("2026-06-24T12:00:00Z"));
    expect(buildBookingSeries(bookings, "week", "America/Argentina/Buenos_Aires", range).map((item) => item.value)).toEqual([2, 1, 0, 0, 0, 0, 0]);
  });

  it("counts every booking status and calculates safe rates", () => {
    expect(aggregateBookingStatuses(bookings)).toEqual({ PENDING: 0, CONFIRMED: 1, COMPLETED: 0, CANCELLED: 1, NO_SHOW: 1 });
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(0, 0)).toBe(0);
  });
});
