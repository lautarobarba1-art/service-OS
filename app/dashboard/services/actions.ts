"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { entityIdSchema, firstValidationError, serviceSchema } from "@/lib/validations/operations";

const MANAGERS = ["OWNER", "ADMIN"] as const;

function serviceInput(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    price: formData.get("price"),
    capacity: formData.get("capacity"),
  });
}

export async function createServiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = serviceInput(formData);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const service = await transaction.service.create({
        data: { ...parsed.data, organizationId: context.organizationId },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: "service.created",
          entityType: "Service",
          entityId: service.id,
          metadata: toAuditMetadata({ new: parsed.data }),
        },
      });
    });
    revalidatePath("/dashboard/services");
    return { message: "Servicio creado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateServiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = serviceInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.service.findFirst({
        where: { id: id.data, organizationId: context.organizationId },
      });
      if (!previous) throw new Error("Service not found in active organization");
      const updated = await transaction.service.update({ where: { id: previous.id }, data: parsed.data });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: "service.updated",
          entityType: "Service",
          entityId: updated.id,
          metadata: toAuditMetadata({
            previous: { ...previous, price: previous.price.toString(), createdAt: previous.createdAt.toISOString(), updatedAt: previous.updatedAt.toISOString() },
            new: { ...updated, price: updated.price.toString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
          }),
        },
      });
    });
    revalidatePath("/dashboard/services");
    return { message: "Servicio actualizado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function toggleServiceAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.service.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Service not found in active organization");
      const updated = await transaction.service.update({ where: { id: previous.id }, data: { isActive: !previous.isActive } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: updated.isActive ? "service.updated" : "service.deactivated",
          entityType: "Service",
          entityId: updated.id,
          metadata: toAuditMetadata({ previous: { isActive: previous.isActive }, new: { isActive: updated.isActive } }),
        },
      });
    });
    revalidatePath("/dashboard/services");
  } catch (error) {
    console.error(actionError(error));
  }
}
