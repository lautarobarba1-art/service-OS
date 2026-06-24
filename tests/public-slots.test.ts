import { describe, expect, it } from "vitest";

import {
  generateAggregatedSlotCandidates,
  selectDeterministicResourceId,
  toPublicSlots,
  type SlotResource,
} from "@/lib/public-slots";

const date = "2035-06-21";
const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
const defaultResource: SlotResource = {
  id: "00000000-0000-0000-0000-000000000001",
  isDefault: true,
  availabilityRules: [{ dayOfWeek, startTime: "09:00", endTime: "11:00" }],
};
const secondResource: SlotResource = {
  id: "00000000-0000-0000-0000-000000000002",
  isDefault: false,
  availabilityRules: [{ dayOfWeek, startTime: "09:00", endTime: "11:00" }],
};

function input(overrides: Partial<Parameters<typeof generateAggregatedSlotCandidates>[0]> = {}) {
  return {
    timeZone: "UTC",
    slotIntervalMinutes: 30,
    minimumBookingNoticeMinutes: 0,
    bookingWindowDays: 60,
    durationMinutes: 60,
    capacity: 1,
    attendeesCount: 1,
    now: new Date("2035-06-20T00:00:00.000Z"),
    rangeStart: new Date(`${date}T00:00:00.000Z`),
    rangeEnd: new Date("2035-06-22T00:00:00.000Z"),
    resources: [secondResource, defaultResource],
    blockedDates: [],
    bookings: [],
    ...overrides,
  };
}

describe("public slot engine", () => {
  it("aggregates equal starts without exposing duplicate resource slots", () => {
    const candidates = generateAggregatedSlotCandidates(input());
    expect(toPublicSlots(candidates).map((slot) => slot.startDateTime.toISOString())).toEqual([
      `${date}T09:00:00.000Z`, `${date}T09:30:00.000Z`, `${date}T10:00:00.000Z`,
    ]);
    expect(candidates[0].eligibleResourceIds).toEqual([defaultResource.id, secondResource.id]);
    expect(selectDeterministicResourceId(candidates[0])).toBe(defaultResource.id);
  });

  it("keeps the slot when one resource is blocked or full", () => {
    const candidates = generateAggregatedSlotCandidates(input({
      blockedDates: [{ date, resourceId: defaultResource.id }],
      bookings: [{
        resourceId: defaultResource.id,
        startDateTime: new Date(`${date}T09:00:00.000Z`),
        endDateTime: new Date(`${date}T10:00:00.000Z`),
        attendeesCount: 1,
      }],
    }));
    expect(candidates).toHaveLength(3);
    expect(candidates.every((slot) => slot.eligibleResourceIds.length === 1 && slot.eligibleResourceIds[0] === secondResource.id)).toBe(true);
  });

  it("removes globally blocked dates and slots without capacity", () => {
    expect(generateAggregatedSlotCandidates(input({ blockedDates: [{ date, resourceId: null }] }))).toEqual([]);
    expect(generateAggregatedSlotCandidates(input({ attendeesCount: 2 }))).toEqual([]);
  });

  it("respects minimum notice and booking window", () => {
    const candidates = generateAggregatedSlotCandidates(input({
      now: new Date(`${date}T09:10:00.000Z`),
      minimumBookingNoticeMinutes: 50,
      bookingWindowDays: 1,
    }));
    expect(candidates.map((slot) => slot.startDateTime.toISOString())).toEqual([`${date}T10:00:00.000Z`]);
  });
});
