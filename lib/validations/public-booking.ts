import { z } from "zod";

export const publicBookingSettingsSchema = z.object({
  publicBookingEnabled: z.boolean(),
  bookingConfirmationMode: z.enum(["AUTO_CONFIRM", "MANUAL_APPROVAL"]),
  slotIntervalMinutes: z.coerce.number().int().min(5).max(120),
  minimumBookingNoticeMinutes: z.coerce.number().int().min(0).max(43_200),
  bookingWindowDays: z.coerce.number().int().min(1).max(365),
  cancellationNoticeMinutes: z.coerce.number().int().min(0).max(43_200),
});

export const servicePublicationSchema = z.object({
  serviceId: z.uuid(),
  isPublic: z.boolean(),
  resourceIds: z.array(z.uuid()).max(100),
}).refine((input) => new Set(input.resourceIds).size === input.resourceIds.length, {
  message: "No se permiten recursos repetidos.",
  path: ["resourceIds"],
});

const optionalPublicPhone = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(6, "Ingresá un teléfono válido.").max(30).optional(),
);

export const publicBookingRequestSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{1,80}$/),
  serviceId: z.uuid(),
  startDateTime: z.iso.datetime({ offset: true }),
  attendeesCount: z.coerce.number().int().min(1).max(100),
  fullName: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  phone: optionalPublicPhone,
  idempotencyKey: z.uuid(),
});

export const publicSlotLookupSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{1,80}$/),
  serviceId: z.uuid(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attendeesCount: z.coerce.number().int().min(1).max(100),
});
