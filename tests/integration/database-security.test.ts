import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  const serviceId = randomUUID();
  const firstCustomerId = randomUUID();
  const secondCustomerId = randomUUID();
  const bookingIds = [randomUUID(), randomUUID()];
  const startDateTime = new Date("2035-06-21T12:00:00.000Z");
  const endDateTime = new Date("2035-06-21T13:00:00.000Z");

  beforeAll(async () => {
    assertDedicatedTestDatabase(testDatabaseUrl!);
    database = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
    secondConnection = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });

    await database.user.createMany({
      data: [
        { id: ownerId, name: "Integration Owner", email: `owner-${ownerId}@example.test` },
        { id: staffId, name: "Integration Staff", email: `staff-${staffId}@example.test` },
        { id: outsiderId, name: "Integration Outsider", email: `outsider-${outsiderId}@example.test` },
      ],
    });
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
    await database.service.create({
      data: { id: serviceId, organizationId, name: "Integration Service", durationMinutes: 60, price: 0, capacity: 1 },
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
    await database.user.deleteMany({ where: { id: { in: [ownerId, staffId, outsiderId] } } });
    await Promise.all([database.$disconnect(), secondConnection?.$disconnect()]);
  });

  it("applies tenant RLS to Prisma queries when the authenticated role is assumed", async () => {
    const visibleOrganizations = await withRls(database, ownerId, (transaction) =>
      transaction.organization.findMany({ select: { id: true } }),
    );

    expect(visibleOrganizations.map((organization) => organization.id)).toEqual([organizationId]);
  });

  it("enforces OWNER/ADMIN payment updates at the database boundary", async () => {
    const booking = await database.booking.create({
      data: {
        organizationId,
        customerId: firstCustomerId,
        serviceId,
        resourceId,
        startDateTime,
        endDateTime,
      },
    });

    await expect(withRls(database, staffId, (transaction) =>
      transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } }),
    )).rejects.toThrow();

    await expect(withRls(database, ownerId, (transaction) =>
      transaction.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } }),
    )).resolves.toMatchObject({ paymentStatus: "PAID" });

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
});
