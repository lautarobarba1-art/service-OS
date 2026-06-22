import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type RlsTransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * Runs tenant-facing queries as Supabase's `authenticated` database role.
 *
 * DATABASE_URL connects as a privileged migration-capable role, so ordinary
 * Prisma queries bypass RLS. Keeping the role and JWT claims transaction-local
 * makes RLS effective without leaking request identity through the pooler.
 */
export function withAuthenticatedRls<T>(
  userId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options?: RlsTransactionOptions,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await transaction.$executeRaw`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`;
    await transaction.$executeRawUnsafe("SET LOCAL ROLE authenticated");
    return operation(transaction);
  }, options);
}
