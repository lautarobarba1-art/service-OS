"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_MEMBERSHIP_COOKIE, getAuthenticatedUser } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

export async function switchOrganizationAction(formData: FormData) {
  const membershipId = formData.get("membershipId");
  if (typeof membershipId !== "string") return;

  const user = await getAuthenticatedUser();
  // membershipId is only a selector token. The organization is always resolved
  // server-side from a membership owned by the authenticated user.
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, userId: user.id },
    select: { id: true },
  });
  if (!membership) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MEMBERSHIP_COOKIE, membership.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboard");
}
