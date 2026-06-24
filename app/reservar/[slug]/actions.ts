"use server";

import { after } from "next/server";
import { headers } from "next/headers";

import { sendPublicBookingNotification } from "@/lib/email";
import { getPublicOrganizationForRequest, getPublicServiceSlots } from "@/lib/public-booking-data";
import { createPublicBooking, PublicBookingError } from "@/lib/public-booking-service";
import { consumePublicRateLimit } from "@/lib/public-rate-limit";
import { formatUtcInTimeZone, localDateStringToDatabaseDate, zonedDateTimeToUtc } from "@/lib/timezone";
import { publicBookingRequestSchema, publicSlotLookupSchema } from "@/lib/validations/public-booking";
import { prisma } from "@/lib/prisma";

export type PublicSlotActionState = {
  error?: string;
  slots?: Array<{ startDateTime: string; endDateTime: string; label: string }>;
};

export type PublicBookingActionState = {
  error?: string;
  result?: {
    referenceCode: string;
    status: "PENDING" | "CONFIRMED";
    localDateTime: string;
    managePath?: string;
  };
};

function networkIdentifier(requestHeaders: Headers) {
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || "unknown";
}

function configuredAppOrigin(requestHeaders: Headers) {
  const raw = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const candidate = raw || requestHeaders.get("origin") || "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function localDayRange(localDate: string, timezone: string) {
  const date = localDateStringToDatabaseDate(localDate);
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  const rangeStart = zonedDateTimeToUtc({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0,
  }, timezone);
  const rangeEnd = zonedDateTimeToUtc({
    year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0,
  }, timezone);
  return { rangeStart, rangeEnd };
}

async function recordPublicEmailFailure(organizationId: string, bookingId: string, message: string) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "email.delivery_failed",
        entityType: "Booking",
        entityId: bookingId,
        metadata: { message, source: "PUBLIC" },
      },
    });
  } catch (error) {
    console.error("No se pudo auditar el error de email público:", error);
  }
}

export async function loadPublicSlotsAction(
  _: PublicSlotActionState,
  formData: FormData,
): Promise<PublicSlotActionState> {
  const parsed = publicSlotLookupSchema.safeParse({
    slug: formData.get("slug"),
    serviceId: formData.get("serviceId"),
    localDate: formData.get("localDate"),
    attendeesCount: formData.get("attendeesCount"),
  });
  if (!parsed.success) return { error: "Revisá el servicio, la fecha y la cantidad de asistentes." };

  try {
    const organization = await getPublicOrganizationForRequest(parsed.data.slug);
    if (!organization) return { error: "La reserva pública no está disponible." };
    const requestHeaders = await headers();
    const rateLimit = await consumePublicRateLimit({
      organizationId: organization.id,
      networkIdentifier: networkIdentifier(requestHeaders),
      action: "slots",
    });
    if (!rateLimit.allowed) return { error: `Demasiadas consultas. Probá nuevamente en ${rateLimit.retryAfterSeconds} segundos.` };

    const range = localDayRange(parsed.data.localDate, organization.timezone);
    const slots = await getPublicServiceSlots({
      slug: parsed.data.slug,
      serviceId: parsed.data.serviceId,
      attendeesCount: parsed.data.attendeesCount,
      ...range,
    });
    if (!slots?.length) return { slots: [], error: "No hay horarios disponibles para ese día." };
    return {
      slots: slots.map((slot) => ({
        startDateTime: slot.startDateTime.toISOString(),
        endDateTime: slot.endDateTime.toISOString(),
        label: formatUtcInTimeZone(slot.startDateTime, organization.timezone),
      })),
    };
  } catch (error) {
    console.error("Error al consultar slots públicos:", error);
    return { error: "No pudimos consultar los horarios. Intentá nuevamente." };
  }
}

export async function createPublicBookingAction(
  _: PublicBookingActionState,
  formData: FormData,
): Promise<PublicBookingActionState> {
  const parsed = publicBookingRequestSchema.safeParse({
    slug: formData.get("slug"),
    serviceId: formData.get("serviceId"),
    startDateTime: formData.get("startDateTime"),
    attendeesCount: formData.get("attendeesCount"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: "Revisá tus datos y el horario seleccionado." };

  try {
    const organization = await getPublicOrganizationForRequest(parsed.data.slug);
    if (!organization) return { error: "La reserva pública no está disponible." };
    const requestHeaders = await headers();
    const rateLimit = await consumePublicRateLimit({
      organizationId: organization.id,
      networkIdentifier: networkIdentifier(requestHeaders),
      action: "create_booking",
    });
    if (!rateLimit.allowed) return { error: `Demasiados intentos. Probá nuevamente en ${rateLimit.retryAfterSeconds} segundos.` };

    const result = await createPublicBooking(parsed.data);
    const localDateTime = formatUtcInTimeZone(result.booking.startDateTime, result.organization.timezone);
    const managePath = result.manageToken ? `/reserva/${result.manageToken}` : undefined;
    const publicStatus = result.booking.status === "CONFIRMED" ? "CONFIRMED" : "PENDING";

    if (!result.replayed) {
      after(async () => {
        try {
          const origin = configuredAppOrigin(requestHeaders);
          await sendPublicBookingNotification({
            email: parsed.data.email,
            customerName: parsed.data.fullName,
            serviceName: result.service.name,
            organizationName: result.organization.name,
            localDateTime,
            referenceCode: result.booking.referenceCode,
            status: result.booking.status,
            manageUrl: origin && managePath ? `${origin}${managePath}` : undefined,
          });
        } catch (error) {
          await recordPublicEmailFailure(
            result.organization.id,
            result.booking.id,
            error instanceof Error ? error.message : "Unknown email error",
          );
        }
      });
    }

    return {
      result: {
        referenceCode: result.booking.referenceCode,
        status: publicStatus,
        localDateTime,
        managePath,
      },
    };
  } catch (error) {
    if (error instanceof PublicBookingError) return { error: error.message };
    console.error("Error al crear una reserva pública:", error);
    return { error: "No pudimos completar la reserva. Intentá nuevamente." };
  }
}
