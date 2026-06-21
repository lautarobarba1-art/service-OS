import { describe, expect, it } from "vitest";

import {
  assertBookingTransition,
  assertSlotCapacity,
  assertTenantMatch,
  BookingRuleError,
  canChangePaymentStatus,
  reserveWithCapacity,
} from "@/lib/booking-rules";
import { validateSlotAvailability } from "@/lib/timezone";

class AsyncMutex {
  private tail = Promise.resolve();

  async run<T>(operation: () => Promise<T>) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}

describe("booking creation rules", () => {
  it("creates a valid booking when availability and capacity permit it", async () => {
    const availability = validateSlotAvailability({
      startDateTime: "2026-06-22T12:00:00.000Z",
      endDateTime: "2026-06-22T13:00:00.000Z",
      timeZone: "America/Argentina/Buenos_Aires",
      resourceId: "resource-a",
      availabilityRules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "13:00" }],
      blockedDates: [],
    });
    expect(availability).toEqual({ valid: true });
    const created = await reserveWithCapacity({
      withLock: async (operation) => operation(), getUsedCapacity: async () => 0,
      attendeesCount: 1, capacity: 1, create: async () => ({ status: "PENDING", paymentStatus: "UNPAID" }),
    });
    expect(created).toEqual({ status: "PENDING", paymentStatus: "UNPAID" });
  });

  it("rejects capacity overflow", () => {
    expect(() => assertSlotCapacity(2, 2, 3)).toThrowError(BookingRuleError);
    expect(() => assertSlotCapacity(2, 1, 3)).not.toThrow();
  });

  it("serializes concurrent capacity=1 attempts so only one succeeds", async () => {
    const mutex = new AsyncMutex();
    let usedCapacity = 0;
    const attempt = () => reserveWithCapacity({
      withLock: (operation) => mutex.run(operation),
      getUsedCapacity: async () => usedCapacity,
      attendeesCount: 1,
      capacity: 1,
      create: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); usedCapacity += 1; return { id: usedCapacity }; },
    });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(usedCapacity).toBe(1);
  });
});

describe("booking state machine and RBAC", () => {
  it("accepts documented state transitions", () => {
    expect(() => assertBookingTransition("PENDING", "CONFIRMED", "STAFF")).not.toThrow();
    expect(() => assertBookingTransition("CONFIRMED", "COMPLETED", "OWNER")).not.toThrow();
  });

  it("rejects invalid or terminal transitions", () => {
    expect(() => assertBookingTransition("PENDING", "COMPLETED", "ADMIN")).toThrow(/No se puede/);
    expect(() => assertBookingTransition("CANCELLED", "PENDING", "OWNER")).toThrow(/No se puede/);
  });

  it("rejects transitions by VIEWER and limits payment changes", () => {
    expect(() => assertBookingTransition("PENDING", "CONFIRMED", "VIEWER")).toThrow(/rol/);
    expect(canChangePaymentStatus("STAFF")).toBe(false);
    expect(canChangePaymentStatus("ADMIN")).toBe(true);
  });

  it("rejects cross-tenant entities", () => {
    expect(() => assertTenantMatch("organization-b", "organization-a")).toThrowError(BookingRuleError);
    expect(() => assertTenantMatch("organization-a", "organization-a")).not.toThrow();
  });
});
