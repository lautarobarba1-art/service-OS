"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { localDateStringToDatabaseDate, timeStringToDatabaseDate } from "@/lib/timezone";
import {
  availabilityRuleSchema,
  blockedDateSchema,
  entityIdSchema,
  firstValidationError,
} from "@/lib/validations/operations";

const MANAGERS = ["OWNER", "ADMIN"] as const;

function ruleInput(formData: FormData) {
  return availabilityRuleSchema.safeParse({
    resourceId: formData.get("resourceId"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
}

async function resourceBelongsToOrganization(resourceId: string, organizationId: string) {
  return prisma.resource.findFirst({ where: { id: resourceId, organizationId }, select: { id: true } });
}

export async function createAvailabilityRuleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ruleInput(formData);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    if (!(await resourceBelongsToOrganization(parsed.data.resourceId, context.organizationId))) return { error: "El recurso no pertenece a la organización activa." };
    await prisma.$transaction(async (transaction) => {
      const rule = await transaction.availabilityRule.create({
        data: {
          organizationId: context.organizationId,
          resourceId: parsed.data.resourceId,
          dayOfWeek: parsed.data.dayOfWeek,
          startTime: timeStringToDatabaseDate(parsed.data.startTime),
          endTime: timeStringToDatabaseDate(parsed.data.endTime),
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "availability.updated",
          entityType: "AvailabilityRule", entityId: rule.id, metadata: toAuditMetadata({ operation: "created", new: parsed.data }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
    return { message: "Horario agregado." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function updateAvailabilityRuleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = ruleInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    if (!(await resourceBelongsToOrganization(parsed.data.resourceId, context.organizationId))) return { error: "El recurso no pertenece a la organización activa." };
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.availabilityRule.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Availability rule not found in active organization");
      const updated = await transaction.availabilityRule.update({
        where: { id: previous.id },
        data: {
          resourceId: parsed.data.resourceId, dayOfWeek: parsed.data.dayOfWeek,
          startTime: timeStringToDatabaseDate(parsed.data.startTime), endTime: timeStringToDatabaseDate(parsed.data.endTime),
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "availability.updated",
          entityType: "AvailabilityRule", entityId: updated.id,
          metadata: toAuditMetadata({ operation: "updated", previous, new: updated }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
    return { message: "Horario actualizado." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function deleteAvailabilityRuleAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.availabilityRule.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) return;
      await transaction.availabilityRule.delete({ where: { id: previous.id } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "availability.updated",
          entityType: "AvailabilityRule", entityId: previous.id,
          metadata: toAuditMetadata({ operation: "deleted", previous }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
  } catch (error) { console.error(actionError(error)); }
}

function blockedInput(formData: FormData) {
  return blockedDateSchema.safeParse({ resourceId: formData.get("resourceId"), date: formData.get("date"), reason: formData.get("reason") });
}

async function validBlockedResource(resourceId: string | null, organizationId: string) {
  return resourceId === null || Boolean(await resourceBelongsToOrganization(resourceId, organizationId));
}

export async function createBlockedDateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = blockedInput(formData);
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    if (!(await validBlockedResource(parsed.data.resourceId, context.organizationId))) return { error: "El recurso no pertenece a la organización activa." };
    await prisma.$transaction(async (transaction) => {
      const blocked = await transaction.blockedDate.create({
        data: { organizationId: context.organizationId, resourceId: parsed.data.resourceId, date: localDateStringToDatabaseDate(parsed.data.date), reason: parsed.data.reason },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "blocked_date.created",
          entityType: "BlockedDate", entityId: blocked.id, metadata: toAuditMetadata({ new: parsed.data }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
    return { message: "Fecha bloqueada." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function updateBlockedDateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = blockedInput(formData);
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!parsed.success) return { error: firstValidationError(parsed.error) };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    if (!(await validBlockedResource(parsed.data.resourceId, context.organizationId))) return { error: "El recurso no pertenece a la organización activa." };
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.blockedDate.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new Error("Blocked date not found in active organization");
      const updated = await transaction.blockedDate.update({
        where: { id: previous.id },
        data: { resourceId: parsed.data.resourceId, date: localDateStringToDatabaseDate(parsed.data.date), reason: parsed.data.reason },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "availability.updated",
          entityType: "BlockedDate", entityId: updated.id,
          metadata: toAuditMetadata({ operation: "updated", previous, new: updated }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
    return { message: "Bloqueo actualizado." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function deleteBlockedDateAction(formData: FormData) {
  const id = entityIdSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.blockedDate.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) return;
      await transaction.blockedDate.delete({ where: { id: previous.id } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "blocked_date.deleted",
          entityType: "BlockedDate", entityId: previous.id, metadata: toAuditMetadata({ previous }),
        },
      });
    });
    revalidatePath("/dashboard/availability");
  } catch (error) { console.error(actionError(error)); }
}
