"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import { withAuthenticatedRls } from "@/lib/prisma";
import { entityIdSchema, firstValidationError, resourceSchema } from "@/lib/validations/operations";

const MANAGERS = ["OWNER", "ADMIN"] as const;

function resourceInput(formData: FormData) {
  return resourceSchema.safeParse({ name: formData.get("name"), type: formData.get("type") });
}

export async function createResourceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resourceInput(formData);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const resource = await transaction.resource.create({ data: { ...parsed.data, organizationId: context.organizationId } });
      await transaction.auditLog.create({
        data: { organizationId: context.organizationId, userId: context.userId, action: "resource.created", entityType: "Resource", entityId: resource.id, metadata: toAuditMetadata({ new: parsed.data }) },
      });
    });
    revalidatePath("/dashboard/resources");
    return { message: "Recurso creado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateResourceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = resourceInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const previous = await transaction.resource.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Resource not found in active organization");
      const updated = await transaction.resource.update({ where: { id: previous.id }, data: parsed.data });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "resource.updated", entityType: "Resource", entityId: updated.id,
          metadata: toAuditMetadata({
            previous: { ...previous, createdAt: previous.createdAt.toISOString(), updatedAt: previous.updatedAt.toISOString() },
            new: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
          }),
        },
      });
    });
    revalidatePath("/dashboard/resources");
    return { message: "Recurso actualizado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function toggleResourceAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const previous = await transaction.resource.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous || previous.isDefault) return;
      const updated = await transaction.resource.update({ where: { id: previous.id }, data: { isActive: !previous.isActive } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId,
          action: updated.isActive ? "resource.updated" : "resource.deactivated", entityType: "Resource", entityId: updated.id,
          metadata: toAuditMetadata({ previous: { isActive: previous.isActive }, new: { isActive: updated.isActive } }),
        },
      });
    });
    revalidatePath("/dashboard/resources");
  } catch (error) {
    console.error(actionError(error));
  }
}

export async function deleteResourceAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const resource = await transaction.resource.findFirst({ where: { id: id.data, organizationId: context.organizationId }, select: { id: true, isDefault: true } });
      if (resource && !resource.isDefault) await transaction.resource.delete({ where: { id: resource.id } });
    });
    revalidatePath("/dashboard/resources");
  } catch (error) {
    console.error(actionError(error));
  }
}
