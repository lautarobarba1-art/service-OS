"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import {
  customerIdentityKeys,
  CustomerDuplicateError,
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from "@/lib/customer-duplicates";
import { withAuthenticatedRls } from "@/lib/prisma";
import { customerSchema, entityIdSchema, firstValidationError } from "@/lib/validations/operations";

const OPERATORS = ["OWNER", "ADMIN", "STAFF"] as const;

function customerError(error: unknown) {
  return error instanceof CustomerDuplicateError ? error.message : actionError(error);
}

async function lockAndCheckDuplicate(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  input: { id?: string; fullName: string; email?: string; phone?: string },
) {
  for (const key of customerIdentityKeys(input)) {
    const lockKey = `customer:${organizationId}:${key}`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }
  const excludedId = input.id ?? null;
  const email = normalizeCustomerEmail(input.email);
  if (email) {
    const duplicate = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT c."id" FROM "Customer" c
      WHERE c."organizationId" = CAST(${organizationId} AS uuid)
        AND (${excludedId}::uuid IS NULL OR c."id" <> ${excludedId}::uuid)
        AND lower(btrim(COALESCE(c."email", ''))) = ${email}
      LIMIT 1
    `;
    if (duplicate.length) throw new CustomerDuplicateError("email", "Ya existe un cliente creado anteriormente con ese email.");
  }

  const phone = normalizeCustomerPhone(input.phone);
  if (phone) {
    const duplicate = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT c."id" FROM "Customer" c
      WHERE c."organizationId" = CAST(${organizationId} AS uuid)
        AND (${excludedId}::uuid IS NULL OR c."id" <> ${excludedId}::uuid)
        AND regexp_replace(COALESCE(c."phone", ''), '\D', '', 'g') = ${phone}
      LIMIT 1
    `;
    if (duplicate.length) throw new CustomerDuplicateError("phone", "Ya existe un cliente creado anteriormente con ese teléfono.");
  }

  if (!email && !phone) {
    const name = normalizeCustomerName(input.fullName);
    const duplicate = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT c."id" FROM "Customer" c
      WHERE c."organizationId" = CAST(${organizationId} AS uuid)
        AND (${excludedId}::uuid IS NULL OR c."id" <> ${excludedId}::uuid)
        AND btrim(COALESCE(c."email", '')) = ''
        AND regexp_replace(COALESCE(c."phone", ''), '\D', '', 'g') = ''
        AND public.normalize_customer_name(c."fullName") = ${name}
      LIMIT 1
    `;
    if (duplicate.length) throw new CustomerDuplicateError("fullName", "Ya existe un cliente sin datos de contacto con ese nombre.");
  }
}

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
    await withAuthenticatedRls(context.userId, async (transaction) => {
      await lockAndCheckDuplicate(transaction, context.organizationId, parsed.data);
      const customer = await transaction.customer.create({
        data: {
          ...parsed.data,
          email: parsed.data.email ? normalizeCustomerEmail(parsed.data.email) : null,
          phone: parsed.data.phone ?? null,
          organizationId: context.organizationId,
        },
      });
      await transaction.auditLog.create({
        data: { organizationId: context.organizationId, userId: context.userId, action: "customer.created", entityType: "Customer", entityId: customer.id, metadata: toAuditMetadata({ new: parsed.data }) },
      });
    });
    revalidatePath("/dashboard/customers");
    return { message: "Cliente creado." };
  } catch (error) {
    return { error: customerError(error) };
  }
}

export async function updateCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = customerInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const previous = await transaction.customer.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Customer not found in active organization");
      await lockAndCheckDuplicate(transaction, context.organizationId, { id: previous.id, ...parsed.data });
      const updated = await transaction.customer.update({
        where: { id: previous.id },
        data: {
          ...parsed.data,
          email: parsed.data.email ? normalizeCustomerEmail(parsed.data.email) : null,
          phone: parsed.data.phone ?? null,
        },
      });
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
    return { error: customerError(error) };
  }
}

export async function deleteCustomerAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole(["OWNER", "ADMIN"]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const customer = await transaction.customer.findFirst({ where: { id: id.data, organizationId: context.organizationId }, select: { id: true } });
      if (customer) await transaction.customer.delete({ where: { id: customer.id } });
    });
    revalidatePath("/dashboard/customers");
  } catch (error) {
    console.error(actionError(error));
  }
}
