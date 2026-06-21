"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { customerSchema, entityIdSchema, firstValidationError } from "@/lib/validations/operations";

const OPERATORS = ["OWNER", "ADMIN", "STAFF"] as const;

function customerInput(formData: FormData) {
  return customerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    notes: formData.get("notes") ?? "",
  });
}

export async function createCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customerInput(formData);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({ data: { ...parsed.data, organizationId: context.organizationId } });
      await transaction.auditLog.create({
        data: { organizationId: context.organizationId, userId: context.userId, action: "customer.created", entityType: "Customer", entityId: customer.id, metadata: toAuditMetadata({ new: parsed.data }) },
      });
    });
    revalidatePath("/dashboard/customers");
    return { message: "Cliente creado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = customerInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.customer.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Customer not found in active organization");
      const updated = await transaction.customer.update({ where: { id: previous.id }, data: parsed.data });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: "customer.updated",
          entityType: "Customer",
          entityId: updated.id,
          metadata: toAuditMetadata({
            previous: { ...previous, createdAt: previous.createdAt.toISOString(), updatedAt: previous.updatedAt.toISOString() },
            new: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
          }),
        },
      });
    });
    revalidatePath("/dashboard/customers");
    return { message: "Cliente actualizado." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function deleteCustomerAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole(["OWNER", "ADMIN"]);
    const customer = await prisma.customer.findFirst({ where: { id: id.data, organizationId: context.organizationId }, select: { id: true } });
    if (customer) await prisma.customer.delete({ where: { id: customer.id } });
    revalidatePath("/dashboard/customers");
  } catch (error) {
    console.error(actionError(error));
  }
}
