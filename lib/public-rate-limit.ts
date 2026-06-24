import "server-only";

import { createHmac } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PublicRateLimitAction = "slots" | "create_booking" | "manage_booking";

const limits: Record<PublicRateLimitAction, { limit: number; windowMs: number }> = {
  slots: { limit: 60, windowMs: 60_000 },
  create_booking: { limit: 5, windowMs: 600_000 },
  manage_booking: { limit: 20, windowMs: 600_000 },
};

function rateLimitSecret() {
  const secret = process.env.PUBLIC_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("PUBLIC_RATE_LIMIT_SECRET debe tener al menos 32 caracteres.");
  return secret;
}

export function hashPublicNetworkIdentifier(identifier: string, secret = rateLimitSecret()) {
  return createHmac("sha256", secret).update(identifier).digest("hex");
}

export function getPublicRateLimitWindow(action: PublicRateLimitAction, now = new Date()) {
  const config = limits[action];
  const startMs = Math.floor(now.getTime() / config.windowMs) * config.windowMs;
  return {
    ...config,
    windowStart: new Date(startMs),
    expiresAt: new Date(startMs + config.windowMs * 2),
  };
}

export async function consumePublicRateLimit(input: {
  organizationId: string;
  networkIdentifier: string;
  action: PublicRateLimitAction;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const bucket = getPublicRateLimitWindow(input.action, now);
  const keyHash = hashPublicNetworkIdentifier(input.networkIdentifier);
  const rows = await prisma.$queryRaw<Array<{ requestCount: number }>>(Prisma.sql`
    INSERT INTO "PublicRateLimit" (
      "organizationId", "keyHash", "action", "windowStart", "requestCount", "expiresAt"
    ) VALUES (
      CAST(${input.organizationId} AS uuid), ${keyHash}, ${input.action}, ${bucket.windowStart}, 1, ${bucket.expiresAt}
    )
    ON CONFLICT ("organizationId", "keyHash", "action", "windowStart")
    DO UPDATE SET
      "requestCount" = "PublicRateLimit"."requestCount" + 1,
      "expiresAt" = GREATEST("PublicRateLimit"."expiresAt", EXCLUDED."expiresAt")
    RETURNING "requestCount"
  `);
  const requestCount = rows[0]?.requestCount ?? bucket.limit + 1;
  return {
    allowed: requestCount <= bucket.limit,
    limit: bucket.limit,
    remaining: Math.max(0, bucket.limit - requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart.getTime() + bucket.windowMs - now.getTime()) / 1000)),
  };
}

export async function deleteExpiredPublicRateLimits(now = new Date()) {
  return prisma.publicRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
}
