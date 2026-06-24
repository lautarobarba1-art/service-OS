import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

export async function getPublicBookingByManageToken(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const manageTokenHash = createHash("sha256").update(token).digest("hex");
  const booking = await prisma.booking.findFirst({
    where: { manageTokenHash, manageTokenExpiresAt: { gt: now }, source: "PUBLIC" },
    select: {
      referenceCode: true,
      status: true,
      startDateTime: true,
      endDateTime: true,
      attendeesCount: true,
      service: { select: { name: true } },
      organization: { select: { name: true, timezone: true } },
    },
  });
  if (!booking) return null;
  return {
    referenceCode: booking.referenceCode,
    status: booking.status,
    startDateTime: booking.startDateTime,
    endDateTime: booking.endDateTime,
    attendeesCount: booking.attendeesCount,
    serviceName: booking.service.name,
    organizationName: booking.organization.name,
    timezone: booking.organization.timezone,
  };
}
