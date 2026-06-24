"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { sendPublicBookingManagementNotification } from "@/lib/email";
import { getPublicServiceSlots } from "@/lib/public-booking-data";
import {
  cancelPublicBooking,
  getPublicBookingAuthorization,
  getPublicBookingByManageToken,
  PublicManagementError,
  reschedulePublicBooking,
} from "@/lib/public-booking-management";
import { consumePublicRateLimit } from "@/lib/public-rate-limit";
import { prisma } from "@/lib/prisma";
import {
  formatUtcInTimeZone,
  localDateStringToDatabaseDate,
  utcToLocalDateKey,
  zonedDateTimeToUtc,
} from "@/lib/timezone";
import {
  publicManageSlotLookupSchema,
  publicManageTokenSchema,
  publicRescheduleSchema,
} from "@/lib/validations/public-booking";

export type PublicManageLoadState = {
  error?: string;
  booking?: {
    referenceCode: string;
    status: string;
    serviceName: string;
    organizationName: string;
    localDateTime: string;
    attendeesCount: number;
    canManage: boolean;
    cancellationDeadline: string;
    minimumLocalDate: string;
  };
};

export type PublicManageSlotsState = {
  error?: string;
  slots?: Array<{ startDateTime: string; label: string }>;
};

export type PublicManageMutationState = {
  error?: string;
  result?: { kind: "cancelled" | "rescheduled"; localDateTime: string; managePath?: string };
};

function networkIdentifier(requestHeaders: Headers) {
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || "unknown";
}

function appOrigin(requestHeaders: Headers) {
  const raw = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    || requestHeaders.get("origin") || "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function localDayRange(localDate: string, timezone: string) {
  const date = localDateStringToDatabaseDate(localDate);
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    rangeStart: zonedDateTimeToUtc({
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0,
    }, timezone),
    rangeEnd: zonedDateTimeToUtc({
      year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0,
    }, timezone),
  };
}

async function authorizeAndLimit(token: string) {
  const authorization = await getPublicBookingAuthorization(token);
  if (!authorization) return { error: "No pudimos validar el enlace de gestión." } as const;
  const requestHeaders = await headers();
  const limit = await consumePublicRateLimit({
    organizationId: authorization.organizationId,
    networkIdentifier: networkIdentifier(requestHeaders),
    action: "manage_booking",
  });
  if (!limit.allowed) return { error: `Demasiados intentos. Probá nuevamente en ${limit.retryAfterSeconds} segundos.` } as const;
  return { authorization, requestHeaders } as const;
}

async function recordEmailFailure(organizationId: string, bookingId: string, message: string) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "email.delivery_failed",
        entityType: "Booking",
        entityId: bookingId,
        metadata: { source: "PUBLIC", message },
      },
    });
  } catch (error) {
    console.error("No se pudo auditar el error de email de autogestión:", error);
  }
}

export async function loadPublicManageBookingAction(
  _: PublicManageLoadState,
  formData: FormData,
): Promise<PublicManageLoadState> {
  const token = publicManageTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: "No pudimos validar el enlace de gestión." };
  try {
    const access = await authorizeAndLimit(token.data);
    if ("error" in access) return { error: access.error };
    const booking = await getPublicBookingByManageToken(token.data);
    if (!booking) return { error: "No pudimos validar el enlace de gestión." };
    return {
      booking: {
        referenceCode: booking.referenceCode,
        status: booking.status,
        serviceName: booking.serviceName,
        organizationName: booking.organizationName,
        localDateTime: formatUtcInTimeZone(booking.startDateTime, booking.timezone),
        attendeesCount: booking.attendeesCount,
        canManage: booking.canManage,
        cancellationDeadline: formatUtcInTimeZone(booking.cancellationDeadline, booking.timezone),
        minimumLocalDate: utcToLocalDateKey(new Date(), booking.timezone),
      },
    };
  } catch (error) {
    console.error("Error al consultar una reserva pública.", error);
    return { error: "No pudimos consultar la reserva. Intentá nuevamente." };
  }
}

export async function loadPublicManageSlotsAction(
  _: PublicManageSlotsState,
  formData: FormData,
): Promise<PublicManageSlotsState> {
  const parsed = publicManageSlotLookupSchema.safeParse({ token: formData.get("token"), localDate: formData.get("localDate") });
  if (!parsed.success) return { error: "No pudimos validar la consulta." };
  try {
    const access = await authorizeAndLimit(parsed.data.token);
    if ("error" in access) return { error: access.error };
    const { authorization } = access;
    const deadline = new Date(authorization.startDateTime.getTime() - authorization.organization.cancellationNoticeMinutes * 60_000);
    if (!(["PENDING", "CONFIRMED"].includes(authorization.status)) || new Date() >= deadline) {
      return { error: "Esta reserva ya no admite cambios." };
    }
    const slots = await getPublicServiceSlots({
      slug: authorization.organization.slug,
      serviceId: authorization.serviceId,
      attendeesCount: authorization.attendeesCount,
      excludeBookingId: authorization.id,
      ...localDayRange(parsed.data.localDate, authorization.organization.timezone),
    });
    if (!slots?.length) return { slots: [], error: "No hay horarios disponibles para ese día." };
    return {
      slots: slots
        .filter((slot) => slot.startDateTime.getTime() !== authorization.startDateTime.getTime())
        .map((slot) => ({
          startDateTime: slot.startDateTime.toISOString(),
          label: formatUtcInTimeZone(slot.startDateTime, authorization.organization.timezone),
        })),
    };
  } catch (error) {
    console.error("Error al consultar horarios de reprogramación.", error);
    return { error: "No pudimos consultar los horarios. Intentá nuevamente." };
  }
}

export async function cancelPublicBookingAction(
  _: PublicManageMutationState,
  formData: FormData,
): Promise<PublicManageMutationState> {
  const token = publicManageTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: "No pudimos validar el enlace de gestión." };
  try {
    const access = await authorizeAndLimit(token.data);
    if ("error" in access) return { error: access.error };
    const result = await cancelPublicBooking(token.data);
    const localDateTime = formatUtcInTimeZone(result.previous.startDateTime, result.previous.organization.timezone);
    if (result.previous.customer.email) {
      after(async () => {
        try {
          await sendPublicBookingManagementNotification({
            kind: "cancelled",
            email: result.previous.customer.email!,
            customerName: result.previous.customer.fullName,
            serviceName: result.previous.service.name,
            organizationName: result.previous.organization.name,
            localDateTime,
            referenceCode: result.previous.referenceCode,
          });
        } catch (error) {
          await recordEmailFailure(result.previous.organizationId, result.booking.id, error instanceof Error ? error.message : "Unknown email error");
        }
      });
    }
    return { result: { kind: "cancelled", localDateTime } };
  } catch (error) {
    if (error instanceof PublicManagementError) return { error: error.message };
    console.error("Error al cancelar una reserva pública.", error);
    return { error: "No pudimos cancelar la reserva. Intentá nuevamente." };
  }
}

export async function reschedulePublicBookingAction(
  _: PublicManageMutationState,
  formData: FormData,
): Promise<PublicManageMutationState> {
  const parsed = publicRescheduleSchema.safeParse({ token: formData.get("token"), startDateTime: formData.get("startDateTime") });
  if (!parsed.success) return { error: "No pudimos validar la reprogramación." };
  try {
    const access = await authorizeAndLimit(parsed.data.token);
    if ("error" in access) return { error: access.error };
    const result = await reschedulePublicBooking(parsed.data);
    const localDateTime = formatUtcInTimeZone(result.booking.startDateTime, result.previous.organization.timezone);
    const managePath = `/reserva#${result.newToken}`;
    if (result.previous.customer.email) {
      after(async () => {
        try {
          const origin = appOrigin(access.requestHeaders);
          await sendPublicBookingManagementNotification({
            kind: "rescheduled",
            email: result.previous.customer.email!,
            customerName: result.previous.customer.fullName,
            serviceName: result.previous.service.name,
            organizationName: result.previous.organization.name,
            localDateTime,
            referenceCode: result.previous.referenceCode,
            manageUrl: origin ? `${origin}${managePath}` : undefined,
          });
        } catch (error) {
          await recordEmailFailure(result.previous.organizationId, result.booking.id, error instanceof Error ? error.message : "Unknown email error");
        }
      });
    }
    return { result: { kind: "rescheduled", localDateTime, managePath } };
  } catch (error) {
    if (error instanceof PublicManagementError) return { error: error.message };
    console.error("Error al reprogramar una reserva pública.", error);
    return { error: "No pudimos reprogramar la reserva. Intentá nuevamente." };
  }
}
