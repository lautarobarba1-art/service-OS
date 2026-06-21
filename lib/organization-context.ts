import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_MEMBERSHIP_COOKIE = "serviceos-active-membership";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return user;
}

export const getOrganizationContext = cache(async function getOrganizationContext() {
  const user = await getAuthenticatedUser();
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  const cookieStore = await cookies();
  const selectedMembershipId = cookieStore.get(ACTIVE_MEMBERSHIP_COOKIE)?.value;
  const activeMembership =
    memberships.find((membership: { id: string | undefined; }) => membership.id === selectedMembershipId) ?? memberships[0] ?? null;

  return { user, memberships, activeMembership };
});
