"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { ACTIVE_MEMBERSHIP_COOKIE, getAuthenticatedUser } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre de la organización.").max(100),
  timezone: z.string().refine(isIanaTimezone, "Elegí una zona horaria IANA válida."),
});

function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  return `${base || "organizacion"}-${randomUUID().slice(0, 8)}`;
}

export async function createOrganizationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const authUser = await getAuthenticatedUser();
  if (!authUser.email) return { error: "La cuenta autenticada no tiene un email válido." };

  const existingMembership = await prisma.membership.findFirst({ where: { userId: authUser.id } });
  if (existingMembership) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_MEMBERSHIP_COOKIE, existingMembership.id, activeCookieOptions());
    redirect("/dashboard");
  }

  const profileName =
    typeof authUser.user_metadata.name === "string" && authUser.user_metadata.name.trim()
      ? authUser.user_metadata.name.trim()
      : authUser.email.split("@")[0];

  let membershipId: string;
  try {
    membershipId = await prisma.$transaction(async (transaction) => {
      await transaction.user.upsert({
        where: { id: authUser.id },
        create: { id: authUser.id, email: authUser.email!, name: profileName },
        update: { email: authUser.email!, name: profileName },
      });

      const organization = await transaction.organization.create({
        data: {
          name: parsed.data.name,
          slug: slugify(parsed.data.name),
          email: authUser.email!,
          timezone: parsed.data.timezone,
        },
      });
      const membership = await transaction.membership.create({
        data: { userId: authUser.id, organizationId: organization.id, role: "OWNER" },
      });
      await transaction.resource.create({
        data: {
          organizationId: organization.id,
          name: "Recurso principal",
          type: "PERSON",
          isDefault: true,
        },
      });
      return membership.id;
    });
  } catch (error) {
    console.error("Error al crear la organización:", error);
    return { error: "No pudimos crear la organización. Intentá nuevamente." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MEMBERSHIP_COOKIE, membershipId, activeCookieOptions());
  redirect("/dashboard");
}

function activeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
