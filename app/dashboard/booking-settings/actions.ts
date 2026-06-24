"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import { withAuthenticatedRls } from "@/lib/prisma";
import { publicBookingSettingsSchema, servicePublicationSchema } from "@/lib/validations/public-booking";

const MANAGERS = ["OWNER", "ADMIN"] as const;

export async function updatePublicBookingSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = publicBookingSettingsSchema.safeParse({
    publicBookingEnabled: formData.get("publicBookingEnabled") === "on",
    bookingConfirmationMode: formData.get("bookingConfirmationMode"),
    slotIntervalMinutes: formData.get("slotIntervalMinutes"),
    minimumBookingNoticeMinutes: formData.get("minimumBookingNoticeMinutes"),
    bookingWindowDays: formData.get("bookingWindowDays"),
    cancellationNoticeMinutes: formData.get("cancellationNoticeMinutes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "La configuración no es válida." };

  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const previous = await transaction.organization.findUnique({ where: { id: context.organizationId } });
      if (!previous) throw new Error("Organization not found");
      const updated = await transaction.organization.update({
        where: { id: previous.id },
        data: parsed.data,
      });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: "organization.public_booking_updated",
          entityType: "Organization",
          entityId: previous.id,
          metadata: toAuditMetadata({
            previous: {
              publicBookingEnabled: previous.publicBookingEnabled,
              bookingConfirmationMode: previous.bookingConfirmationMode,
              slotIntervalMinutes: previous.slotIntervalMinutes,
              minimumBookingNoticeMinutes: previous.minimumBookingNoticeMinutes,
              bookingWindowDays: previous.bookingWindowDays,
              cancellationNoticeMinutes: previous.cancellationNoticeMinutes,
            },
            new: {
              publicBookingEnabled: updated.publicBookingEnabled,
              bookingConfirmationMode: updated.bookingConfirmationMode,
              slotIntervalMinutes: updated.slotIntervalMinutes,
              minimumBookingNoticeMinutes: updated.minimumBookingNoticeMinutes,
              bookingWindowDays: updated.bookingWindowDays,
              cancellationNoticeMinutes: updated.cancellationNoticeMinutes,
            },
          }),
        },
      });
    });
    revalidatePath("/dashboard/booking-settings");
    return { message: "Configuración de auto-reserva actualizada." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateServicePublicationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = servicePublicationSchema.safeParse({
    serviceId: formData.get("serviceId"),
    isPublic: formData.get("isPublic") === "on",
    resourceIds: formData.getAll("resourceIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "La publicación no es válida." };

  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await withAuthenticatedRls(context.userId, async (transaction) => {
      const service = await transaction.service.findFirst({
        where: { id: parsed.data.serviceId, organizationId: context.organizationId },
        include: { serviceResources: { select: { resourceId: true } } },
      });
      if (!service) throw new Error("Service not found in active organization");
      if (parsed.data.isPublic && !service.isActive) throw new Error("Inactive services cannot be published");

      const resources = parsed.data.resourceIds.length
        ? await transaction.resource.findMany({
          where: { id: { in: parsed.data.resourceIds }, organizationId: context.organizationId, isActive: true },
          select: { id: true },
        })
        : [];
      if (resources.length !== parsed.data.resourceIds.length) {
        throw new Error("Invalid or inactive resource in service publication");
      }

      await transaction.service.update({ where: { id: service.id }, data: { isPublic: parsed.data.isPublic } });
      await transaction.serviceResource.deleteMany({
        where: { organizationId: context.organizationId, serviceId: service.id },
      });
      if (resources.length) {
        await transaction.serviceResource.createMany({
          data: resources.map((resource) => ({
            organizationId: context.organizationId,
            serviceId: service.id,
            resourceId: resource.id,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          action: "service.publication_updated",
          entityType: "Service",
          entityId: service.id,
          metadata: toAuditMetadata({
            previous: { isPublic: service.isPublic, resourceIds: service.serviceResources.map((item) => item.resourceId).sort() },
            new: { isPublic: parsed.data.isPublic, resourceIds: resources.map((resource) => resource.id).sort() },
          }),
        },
      });
    });
    revalidatePath("/dashboard/booking-settings");
    revalidatePath("/dashboard/services");
    return {
      message: parsed.data.isPublic && parsed.data.resourceIds.length === 0
        ? "Servicio publicado, pero no mostrará horarios hasta asignarle recursos."
        : "Publicación del servicio actualizada.",
    };
  } catch (error) {
    return { error: actionError(error) };
  }
}
