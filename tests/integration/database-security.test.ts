import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPublishedServicesBySlug, getPublicServiceSlots } from "@/lib/public-booking-data";
import {
  cancelPublicBooking,
  getPublicBookingByManageToken,
  PublicManagementError,
  reschedulePublicBooking,
} from "@/lib/public-booking-management";
import { createPublicBooking, PublicBookingError } from "@/lib/public-booking-service";
import { consumePublicRateLimit } from "@/lib/public-rate-limit";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe.sequential : describe.skip;

function assertDedicatedTestDatabase(value: string) {
  const url = new URL(value);
  const isLocal = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!isLocal && process.env.ALLOW_REMOTE_TEST_DATABASE !== "true") {
    throw new Error("TEST_DATABASE_URL debe apuntar a localhost o habilitar explícitamente ALLOW_REMOTE_TEST_DATABASE=true.");
  }
  if (!isLocal && process.env.DATABASE_URL && value === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL no puede ser igual a DATABASE_URL.");
  }
}

async function withRls<T>(database: PrismaClient, userId: string, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await transaction.$executeRaw`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`;
    await transaction.$executeRawUnsafe("SET LOCAL ROLE authenticated");
    return operation(transaction);
  });
}

describeDatabase("Postgres security and concurrency", () => {
  let database: PrismaClient;
  let secondConnection: PrismaClient;
  const ownerId = randomUUID();
  const staffId = randomUUID();
  const outsiderId = randomUUID();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const resourceId = randomUUID();
  const otherResourceId = randomUUID();
  const serviceId = randomUUID();
  const otherServiceId = randomUUID();
  const firstCustomerId = randomUUID();
  const secondCustomerId = randomUUID();
  const bookingIds = [randomUUID(), randomUUID()];
  let publicBookingId = "";
  let publicManageToken = "";
  const startDateTime = new Date("2035-06-21T12:00:00.000Z");
  const endDateTime = new Date("2035-06-21T13:00:00.000Z");

  beforeAll(async () => {
    assertDedicatedTestDatabase(testDatabaseUrl!);
    database = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
    secondConnection = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });

    await database.$executeRaw`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES
        (${ownerId}::uuid, ${`owner-${ownerId}@example.test`}, '{"name":"Integration Owner"}'::jsonb),
        (${staffId}::uuid, ${`staff-${staffId}@example.test`}, '{"name":"Integration Staff"}'::jsonb),
        (${outsiderId}::uuid, ${`outsider-${outsiderId}@example.test`}, '{"name":"Integration Outsider"}'::jsonb)
    `;
    await database.organization.createMany({
      data: [
        { id: organizationId, name: "Integration Org", slug: `integration-${organizationId}`, email: "org@example.test", timezone: "UTC" },
        { id: otherOrganizationId, name: "Other Org", slug: `other-${otherOrganizationId}`, email: "other@example.test", timezone: "UTC" },
      ],
    });
    await database.membership.createMany({
      data: [
        { userId: ownerId, organizationId, role: "OWNER" },
        { userId: staffId, organizationId, role: "STAFF" },
        { userId: outsiderId, organizationId: otherOrganizationId, role: "OWNER" },
      ],
    });
    await database.resource.create({
      data: { id: resourceId, organizationId, name: "Integration Resource", type: "PERSON", isDefault: true },
    });
    await database.resource.create({
      data: { id: otherResourceId, organizationId: otherOrganizationId, name: "Other Resource", type: "PERSON", isDefault: true },
    });
    await database.service.create({
      data: { id: serviceId, organizationId, name: "Integration Service", durationMinutes: 60, price: 0, capacity: 1 },
    });
    await database.service.create({
      data: { id: otherServiceId, organizationId: otherOrganizationId, name: "Other Service", durationMinutes: 60, price: 0, capacity: 1 },
    });
    await database.customer.createMany({
      data: [
        { id: firstCustomerId, organizationId, fullName: "First Customer", email: `first-${firstCustomerId}@example.test` },
        { id: secondCustomerId, organizationId, fullName: "Second Customer", email: `second-${secondCustomerId}@example.test` },
      ],
    });
  });

  afterAll(async () => {
    if (!database) return;
    await database.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await database.$executeRaw`
      DELETE FROM auth.users WHERE id IN (${ownerId}::uuid, ${staffId}::uuid, ${outsiderId}::uuid)
    `;
    await Promise.all([database.$disconnect(), secondConnection?.$disconnect()]);
  });

  it("applies tenant RLS to Prisma queries when the authenticated role is assumed", async () => {
    const visibleOrganizations = await withRls(database, ownerId, (transaction) =>
      transaction.organization.findMany({ select: { id: true } }),
    );

    expect(visibleOrganizations.map((organization) => organization.id)).toEqual([organizationId]);
  });

  it("enforces OWNER/ADMIN payment updates at the database boundary", async () => {
    const booking = await withRls(database, ownerId, (transaction) => transaction.booking.create({
      data: {
        organizationId,
        customerId: firstCustomerId,
        serviceId,
        resourceId,
        startDateTime,
        endDateTime,
      },
    }));

    await expect(withRls(database, staffId, (transaction) =>
      transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } }),
    )).rejects.toThrow();

    await expect(withRls(database, ownerId, (transaction) =>
      transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } }),
    )).resolves.toMatchObject({ paymentStatus: "PAID" });
    expect(booking.referenceCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(booking.source).toBe("INTERNAL");

    await database.booking.delete({ where: { id: booking.id } });
  });

  it("allows only one concurrent insert for the last capacity unit", async () => {
    const createBooking = (client: PrismaClient, id: string, customerId: string) => client.booking.create({
      data: { id, organizationId, customerId, serviceId, resourceId, startDateTime, endDateTime },
    });

    const results = await Promise.allSettled([
      createBooking(database, bookingIds[0], firstCustomerId),
      createBooking(secondConnection, bookingIds[1], secondCustomerId),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("enforces ServiceResource tenant and manager policies", async () => {
    await expect(withRls(database, staffId, (transaction) => transaction.serviceResource.create({
      data: { organizationId, serviceId, resourceId },
    }))).rejects.toThrow();

    await expect(withRls(database, ownerId, (transaction) => transaction.serviceResource.createMany({
      data: [{ organizationId, serviceId, resourceId }],
    }))).resolves.toMatchObject({ count: 1 });
    await expect(withRls(database, ownerId, (transaction) => transaction.serviceResource.findFirstOrThrow({
      where: { organizationId, serviceId, resourceId },
    }))).resolves.toMatchObject({ organizationId });

    await expect(withRls(database, outsiderId, (transaction) => transaction.serviceResource.create({
      data: { organizationId, serviceId: otherServiceId, resourceId: otherResourceId },
    }))).rejects.toThrow();
    await expect(withRls(database, ownerId, (transaction) => transaction.serviceResource.create({
      data: { organizationId, serviceId, resourceId: otherResourceId },
    }))).rejects.toThrow();
  });

  it("keeps PublicRateLimit inaccessible to authenticated users", async () => {
    await expect(withRls(database, ownerId, (transaction) => transaction.publicRateLimit.findMany())).rejects.toThrow();
  });

  it("publishes aggregated slots without resource identifiers", async () => {
    expect(await getPublishedServicesBySlug(`integration-${organizationId}`)).toBeNull();
    await withRls(database, ownerId, async (transaction) => {
      await transaction.organization.update({ where: { id: organizationId }, data: { publicBookingEnabled: true, slotIntervalMinutes: 30 } });
      await transaction.service.update({ where: { id: serviceId }, data: { isPublic: true } });
    });
    const slotDate = new Date("2035-06-23T00:00:00.000Z");
    await database.availabilityRule.create({
      data: {
        organizationId,
        resourceId,
        dayOfWeek: slotDate.getUTCDay(),
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T11:00:00.000Z"),
      },
    });

    const published = await getPublishedServicesBySlug(`integration-${organizationId}`);
    expect(published?.services.map((service) => service.id)).toContain(serviceId);
    const slots = await getPublicServiceSlots({
      slug: `integration-${organizationId}`,
      serviceId,
      attendeesCount: 1,
      rangeStart: slotDate,
      rangeEnd: new Date("2035-06-24T00:00:00.000Z"),
    }, new Date("2035-06-22T00:00:00.000Z"));
    expect(slots?.map((slot) => slot.startDateTime.toISOString())).toEqual([
      "2035-06-23T09:00:00.000Z", "2035-06-23T09:30:00.000Z", "2035-06-23T10:00:00.000Z",
    ]);
    expect(slots?.every((slot) => !("resourceId" in slot))).toBe(true);
    expect(await getPublicServiceSlots({
      slug: `integration-${organizationId}`,
      serviceId: otherServiceId,
      attendeesCount: 1,
      rangeStart: slotDate,
      rangeEnd: new Date("2035-06-24T00:00:00.000Z"),
    }, new Date("2035-06-22T00:00:00.000Z"))).toEqual([]);
  });

  it("creates an idempotent public booking and reuses the customer without overwriting it", async () => {
    const idempotencyKey = randomUUID();
    const email = `public-${randomUUID()}@example.test`;
    const phone = `54911${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const input = {
      slug: `integration-${organizationId}`,
      serviceId,
      startDateTime: "2035-06-23T09:00:00.000Z",
      attendeesCount: 1,
      fullName: "Public Guest",
      email,
      phone,
      idempotencyKey,
    };
    const now = new Date("2035-06-22T00:00:00.000Z");

    const created = await createPublicBooking(input, now);
    publicBookingId = created.booking.id;
    publicManageToken = created.manageToken!;
    expect(created.replayed).toBe(false);
    expect(created.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.booking).toMatchObject({ source: "PUBLIC", status: "CONFIRMED", resourceId });
    expect(await getPublicBookingByManageToken(created.manageToken!, now)).toMatchObject({
      referenceCode: created.booking.referenceCode,
      serviceName: "Integration Service",
    });

    const replay = await createPublicBooking(input, now);
    expect(replay.replayed).toBe(true);
    expect(replay.booking.id).toBe(created.booking.id);
    expect(replay.manageToken).toBeNull();
    expect(await database.booking.count({ where: { organizationId, idempotencyKey } })).toBe(1);

    await expect(createPublicBooking({ ...input, attendeesCount: 2 }, now)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    const second = await createPublicBooking({
      ...input,
      idempotencyKey: randomUUID(),
      startDateTime: "2035-06-23T10:00:00.000Z",
      fullName: "Attempted Replacement Name",
      phone: undefined,
    }, now);
    expect(second.customer.id).toBe(created.customer.id);
    expect(second.customer.fullName).toBe("Public Guest");
    expect(await database.customer.count({ where: { organizationId, email } })).toBe(1);
    expect(await database.auditLog.count({ where: { organizationId, action: "booking.created", userId: null } })).toBe(2);
  });

  it("rejects public requests that would merge two customer identities", async () => {
    const conflictingPhone = `54911${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    await database.customer.update({ where: { id: secondCustomerId }, data: { phone: conflictingPhone } });
    await expect(createPublicBooking({
      slug: `integration-${organizationId}`,
      serviceId,
      startDateTime: "2035-06-23T10:00:00.000Z",
      attendeesCount: 1,
      fullName: "Identity Conflict",
      email: `first-${firstCustomerId}@example.test`,
      phone: conflictingPhone,
      idempotencyKey: randomUUID(),
    }, new Date("2035-06-22T00:00:00.000Z"))).rejects.toBeInstanceOf(PublicBookingError);
    expect(await database.auditLog.count({ where: { organizationId, action: "public_booking.identity_conflict" } })).toBe(1);
  });

  it("preserves invalid reschedules, rotates tokens and revokes them on cancellation", async () => {
    const now = new Date("2035-06-22T00:00:00.000Z");
    const original = await database.booking.findUniqueOrThrow({ where: { id: publicBookingId } });
    await expect(reschedulePublicBooking({
      token: publicManageToken,
      startDateTime: "2035-06-23T08:00:00.000Z",
    }, now)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await database.booking.findUniqueOrThrow({ where: { id: publicBookingId } })).toMatchObject({
      resourceId: original.resourceId,
      startDateTime: original.startDateTime,
      endDateTime: original.endDateTime,
    });

    await expect(cancelPublicBooking(publicManageToken, new Date("2035-06-23T08:30:00.000Z")))
      .rejects.toBeInstanceOf(PublicManagementError);
    expect((await database.booking.findUniqueOrThrow({ where: { id: publicBookingId } })).status).toBe("CONFIRMED");

    const newSlotDate = new Date("2035-06-25T00:00:00.000Z");
    await database.availabilityRule.create({
      data: {
        organizationId,
        resourceId,
        dayOfWeek: newSlotDate.getUTCDay(),
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T10:00:00.000Z"),
      },
    });
    const rescheduled = await reschedulePublicBooking({
      token: publicManageToken,
      startDateTime: "2035-06-25T09:00:00.000Z",
    }, now);
    expect(rescheduled.booking).toMatchObject({ id: publicBookingId, status: "CONFIRMED", resourceId });
    expect(rescheduled.newToken).not.toBe(publicManageToken);
    expect(await getPublicBookingByManageToken(publicManageToken, now)).toBeNull();
    publicManageToken = rescheduled.newToken;

    await database.booking.update({ where: { id: publicBookingId }, data: { manageTokenExpiresAt: new Date("2035-06-21T00:00:00.000Z") } });
    expect(await getPublicBookingByManageToken(publicManageToken, now)).toBeNull();
    await database.booking.update({ where: { id: publicBookingId }, data: { manageTokenExpiresAt: new Date("2035-07-30T00:00:00.000Z") } });

    const cancelled = await cancelPublicBooking(publicManageToken, now);
    expect(cancelled.booking.status).toBe("CANCELLED");
    expect(cancelled.booking.manageTokenHash).toBeNull();
    expect(await getPublicBookingByManageToken(publicManageToken, now)).toBeNull();
    expect(await database.auditLog.count({ where: { organizationId, entityId: publicBookingId, action: "booking.rescheduled" } })).toBe(1);
    expect(await database.auditLog.count({ where: { organizationId, entityId: publicBookingId, action: "booking.cancelled" } })).toBe(1);
  });

  it("allows only one public request to take the last place", async () => {
    const slotDate = new Date("2035-06-24T00:00:00.000Z");
    await database.availabilityRule.create({
      data: {
        organizationId,
        resourceId,
        dayOfWeek: slotDate.getUTCDay(),
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T10:00:00.000Z"),
      },
    });
    const request = (suffix: string) => createPublicBooking({
      slug: `integration-${organizationId}`,
      serviceId,
      startDateTime: "2035-06-24T09:00:00.000Z",
      attendeesCount: 1,
      fullName: `Concurrent Guest ${suffix}`,
      email: `concurrent-${suffix}-${randomUUID()}@example.test`,
      idempotencyKey: randomUUID(),
    }, new Date("2035-06-22T00:00:00.000Z"));

    const results = await Promise.allSettled([request("A"), request("B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await database.booking.count({
      where: { organizationId, serviceId, resourceId, startDateTime: new Date("2035-06-24T09:00:00.000Z") },
    })).toBe(1);
  });

  it("does not expose invalid public management tokens", async () => {
    expect(await getPublicBookingByManageToken("invalid-token")).toBeNull();
  });

  it("increments persistent public rate-limit buckets atomically", async () => {
    const networkIdentifier = `integration-${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      consumePublicRateLimit({
        organizationId,
        networkIdentifier,
        action: "create_booking",
        now: new Date("2035-06-22T12:00:00.000Z"),
      }),
    ));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
    expect(results.every((result) => result.limit === 5)).toBe(true);
    const stored = await database.publicRateLimit.findFirstOrThrow({ where: { organizationId, action: "create_booking" } });
    expect(stored.requestCount).toBe(6);
    expect(stored.keyHash).not.toContain(networkIdentifier);
  });
});
