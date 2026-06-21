"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { toAuditMetadata } from "@/lib/audit";
import { actionError, requireOrganizationRole } from "@/lib/authorization";
import {
  assertBookingTransition,
  assertSlotCapacity,
  BookingRuleError,
  reserveWithCapacity,
} from "@/lib/booking-rules";
import { sendBookingNotification } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  databaseDateToLocalDateString,
  databaseTimeToString,
  formatUtcInTimeZone,
  localDateStringToDatabaseDate,
  localDateTimeStringToUtc,
  utcToLocalDateKey,
  utcToZonedParts,
  validateSlotAvailability,
} from "@/lib/timezone";
import {
  bookingNotesSchema,
  bookingStatusSchema,
  createBookingSchema,
  entityIdSchema,
  firstValidationError,
  paymentStatusSchema,
} from "@/lib/validations/operations";

const OPERATORS = ["OWNER", "ADMIN", "STAFF"] as const;
const MANAGERS = ["OWNER", "ADMIN"] as const;

function bookingActionError(error: unknown) {
  if (error instanceof BookingRuleError) return error.message;
  return actionError(error);
}

async function recordEmailFailure(input: { organizationId: string; userId: string; bookingId: string; message: string }) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "email.delivery_failed",
        entityType: "Booking",
        entityId: input.bookingId,
        metadata: { message: input.message },
      },
    });
  } catch (auditError) {
    console.error("No se pudo auditar el error de email:", auditError);
  }
}

export async function createBookingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createBookingSchema.safeParse({
    customerId: formData.get("customerId"), serviceId: formData.get("serviceId"), resourceId: formData.get("resourceId"),
    localStartDateTime: formData.get("localStartDateTime"), attendeesCount: formData.get("attendeesCount"), notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    const startDateTime = localDateTimeStringToUtc(parsed.data.localStartDateTime, context.organization.timezone);
    if (startDateTime <= new Date()) throw new BookingRuleError("PAST_DATE", "La reserva debe comenzar en el futuro.");

    const result = await prisma.$transaction(async (transaction) => {
      const [customer, service, resource] = await Promise.all([
        transaction.customer.findFirst({ where: { id: parsed.data.customerId, organizationId: context.organizationId } }),
        transaction.service.findFirst({ where: { id: parsed.data.serviceId, organizationId: context.organizationId } }),
        transaction.resource.findFirst({ where: { id: parsed.data.resourceId, organizationId: context.organizationId } }),
      ]);
      if (!customer) throw new BookingRuleError("TENANT_MISMATCH", "El cliente no pertenece a la organización activa.");
      if (!service) throw new BookingRuleError("TENANT_MISMATCH", "El servicio no pertenece a la organización activa.");
      if (!resource) throw new BookingRuleError("TENANT_MISMATCH", "El recurso no pertenece a la organización activa.");
      if (!service.isActive) throw new BookingRuleError("INACTIVE_SERVICE", "El servicio está inactivo.");
      if (!resource.isActive) throw new BookingRuleError("INACTIVE_RESOURCE", "El recurso está inactivo.");

      const endDateTime = new Date(startDateTime.getTime() + service.durationMinutes * 60_000);
      const localDate = utcToLocalDateKey(startDateTime, context.organization.timezone);
      const lockKey = `${context.organizationId}:${service.id}:${resource.id}:${localDate}`;

      const booking = await reserveWithCapacity({
        withLock: async (operation) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

          const [rules, blockedDates] = await Promise.all([
            transaction.availabilityRule.findMany({ where: { organizationId: context.organizationId, resourceId: resource.id } }),
            transaction.blockedDate.findMany({
              where: {
                organizationId: context.organizationId,
                date: localDateStringToDatabaseDate(localDate),
                OR: [{ resourceId: null }, { resourceId: resource.id }],
              },
            }),
          ]);
          const availability = validateSlotAvailability({
            startDateTime, endDateTime, timeZone: context.organization.timezone, resourceId: resource.id,
            availabilityRules: rules.map((rule) => ({ dayOfWeek: rule.dayOfWeek, startTime: databaseTimeToString(rule.startTime), endTime: databaseTimeToString(rule.endTime) })),
            blockedDates: blockedDates.map((item) => ({ date: databaseDateToLocalDateString(item.date), resourceId: item.resourceId })),
          });
          if (!availability.valid) {
            let message = "El horario está fuera de la disponibilidad del recurso.";
            if (availability.reason === "BLOCKED_DATE") {
              message = "La fecha seleccionada está bloqueada.";
            } else {
              const localStart = utcToZonedParts(startDateTime, context.organization.timezone);
              const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
              const dayRules = rules.filter((rule) => rule.dayOfWeek === localStart.dayOfWeek);
              if (!rules.length) {
                message = "El recurso seleccionado no tiene disponibilidad configurada.";
              } else if (!dayRules.length) {
                message = `El recurso no tiene disponibilidad configurada para el ${dayNames[localStart.dayOfWeek]}.`;
              } else {
                const windows = dayRules.map((rule) => `${databaseTimeToString(rule.startTime)}–${databaseTimeToString(rule.endTime)}`).join(", ");
                message = `Para el ${dayNames[localStart.dayOfWeek]}, el recurso está disponible de ${windows}. La reserva completa debe quedar dentro de ese rango.`;
              }
            }
            throw new BookingRuleError(availability.reason, message);
          }
          return operation();
        },
        getUsedCapacity: async () => {
          const aggregate = await transaction.booking.aggregate({
            where: {
              organizationId: context.organizationId, serviceId: service.id, resourceId: resource.id,
              status: { in: ["PENDING", "CONFIRMED"] }, startDateTime: { lt: endDateTime }, endDateTime: { gt: startDateTime },
            },
            _sum: { attendeesCount: true },
          });
          return aggregate._sum.attendeesCount ?? 0;
        },
        attendeesCount: parsed.data.attendeesCount,
        capacity: service.capacity,
        create: async () => {
          // Kept explicit in addition to reserveWithCapacity so invalid counts are
          // rejected before reaching the database constraint.
          assertSlotCapacity(0, parsed.data.attendeesCount, service.capacity);
          return transaction.booking.create({
            data: {
              organizationId: context.organizationId, customerId: customer.id, serviceId: service.id, resourceId: resource.id,
              startDateTime, endDateTime, attendeesCount: parsed.data.attendeesCount, notes: parsed.data.notes,
            },
          });
        },
      });

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "booking.created",
          entityType: "Booking", entityId: booking.id,
          metadata: toAuditMetadata({ customerId: customer.id, serviceId: service.id, resourceId: resource.id, startDateTime, endDateTime, attendeesCount: parsed.data.attendeesCount }),
        },
      });
      return { booking, customer, service };
    }, { isolationLevel: "ReadCommitted" });

    if (result.customer.email) {
      after(async () => {
        try {
          await sendBookingNotification({
            kind: "created", email: result.customer.email!, customerName: result.customer.fullName,
            serviceName: result.service.name, organizationName: context.organization.name,
            localDateTime: formatUtcInTimeZone(result.booking.startDateTime, context.organization.timezone),
          });
        } catch (error) {
          await recordEmailFailure({ organizationId: context.organizationId, userId: context.userId, bookingId: result.booking.id, message: error instanceof Error ? error.message : "Unknown email error" });
        }
      });
    }
    revalidatePath("/dashboard/bookings");
    return { message: `Reserva creada · ${result.booking.id}` };
  } catch (error) {
    return { error: bookingActionError(error) };
  }
}

export async function changeBookingStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const status = bookingStatusSchema.safeParse(formData.get("status"));
  if (!id.success) return { error: firstValidationError(id.error) };
  if (!status.success) return { error: "El estado no es válido." };
  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    const result = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.booking.findFirst({
        where: { id: id.data, organizationId: context.organizationId },
        include: { customer: true, service: true },
      });
      if (!previous) throw new BookingRuleError("NOT_FOUND", "La reserva no existe en la organización activa.");
      assertBookingTransition(previous.status, status.data, context.role);
      const updated = await transaction.booking.update({ where: { id: previous.id }, data: { status: status.data } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId,
          action: status.data === "CANCELLED" ? "booking.cancelled" : "booking.status_changed",
          entityType: "Booking", entityId: updated.id,
          metadata: { previous: { status: previous.status }, new: { status: updated.status } },
        },
      });
      return { previous, updated };
    });

    if (status.data === "CANCELLED" && result.previous.customer.email) {
      after(async () => {
        try {
          await sendBookingNotification({
            kind: "cancelled", email: result.previous.customer.email!, customerName: result.previous.customer.fullName,
            serviceName: result.previous.service.name, organizationName: context.organization.name,
            localDateTime: formatUtcInTimeZone(result.previous.startDateTime, context.organization.timezone),
          });
        } catch (error) {
          await recordEmailFailure({ organizationId: context.organizationId, userId: context.userId, bookingId: result.updated.id, message: error instanceof Error ? error.message : "Unknown email error" });
        }
      });
    }
    revalidatePath("/dashboard/bookings");
    revalidatePath(`/dashboard/bookings/${id.data}`);
    return { message: "Estado actualizado." };
  } catch (error) { return { error: bookingActionError(error) }; }
}

export async function updateBookingPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const paymentStatus = paymentStatusSchema.safeParse(formData.get("paymentStatus"));
  if (!id.success || !paymentStatus.success) return { error: "Los datos de pago no son válidos." };
  try {
    const context = await requireOrganizationRole([...MANAGERS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.booking.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new BookingRuleError("NOT_FOUND", "La reserva no existe en la organización activa.");
      const updated = await transaction.booking.update({ where: { id: previous.id }, data: { paymentStatus: paymentStatus.data } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "booking.payment_status_changed",
          entityType: "Booking", entityId: updated.id,
          metadata: { previous: { paymentStatus: previous.paymentStatus }, new: { paymentStatus: updated.paymentStatus } },
        },
      });
    });
    revalidatePath("/dashboard/bookings"); revalidatePath(`/dashboard/bookings/${id.data}`);
    return { message: "Estado de pago actualizado." };
  } catch (error) { return { error: bookingActionError(error) }; }
}

export async function updateBookingNotesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const id = entityIdSchema.safeParse(formData.get("id"));
  const parsed = bookingNotesSchema.safeParse({ notes: formData.get("notes") });
  if (!id.success || !parsed.success) return { error: "Las notas no son válidas." };
  try {
    const context = await requireOrganizationRole([...OPERATORS]);
    await prisma.$transaction(async (transaction) => {
      const previous = await transaction.booking.findFirst({ where: { id: id.data, organizationId: context.organizationId } });
      if (!previous) throw new BookingRuleError("NOT_FOUND", "La reserva no existe en la organización activa.");
      const updated = await transaction.booking.update({ where: { id: previous.id }, data: { notes: parsed.data.notes ?? null } });
      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId, userId: context.userId, action: "booking.updated",
          entityType: "Booking", entityId: updated.id,
          metadata: toAuditMetadata({ previous: { notes: previous.notes }, new: { notes: updated.notes } }),
        },
      });
    });
    revalidatePath(`/dashboard/bookings/${id.data}`);
    return { message: "Notas actualizadas." };
  } catch (error) { return { error: bookingActionError(error) }; }
}
