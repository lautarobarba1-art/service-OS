import { z } from "zod";

import { localDateStringToDatabaseDate, timeStringToSeconds } from "@/lib/timezone";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.email("Ingresá un email válido.").optional(),
);

export const entityIdSchema = z.uuid("El identificador no es válido.");

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre del servicio."),
  description: optionalText,
  durationMinutes: z.coerce.number().int("La duración debe ser un número entero.").positive("La duración debe ser mayor a cero."),
  price: z.coerce.number().nonnegative("El precio no puede ser negativo."),
  capacity: z.coerce.number().int("La capacidad debe ser un número entero.").min(1, "La capacidad mínima es 1."),
});

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresá el nombre del cliente."),
  email: optionalEmail,
  phone: optionalText,
  notes: z.string().trim(),
});

export const resourceSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre del recurso."),
  type: z.enum(["PERSON", "ROOM", "EQUIPMENT"], "Elegí un tipo de recurso válido."),
});

export function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisá los datos ingresados.";
}

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "La hora debe tener formato HH:mm.").refine((value) => {
  try { timeStringToSeconds(value); return true; } catch { return false; }
}, "La hora no es válida.");

export const availabilityRuleSchema = z.object({
  resourceId: z.uuid("Elegí un recurso válido."),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
}).refine((value) => timeStringToSeconds(value.startTime) < timeStringToSeconds(value.endTime), {
  message: "La hora de fin debe ser posterior a la de inicio.",
  path: ["endTime"],
});

export const blockedDateSchema = z.object({
  resourceId: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.uuid("Elegí un recurso válido.").nullable(),
  ),
  date: z.string().refine((value) => {
    try { localDateStringToDatabaseDate(value); return true; } catch { return false; }
  }, "Ingresá una fecha válida."),
  reason: optionalText,
});

export const createBookingSchema = z.object({
  customerId: z.uuid("Elegí un cliente válido."),
  serviceId: z.uuid("Elegí un servicio válido."),
  resourceId: z.uuid("Elegí un recurso válido."),
  localStartDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Ingresá fecha y hora."),
  attendeesCount: z.coerce.number().int("La cantidad debe ser entera.").min(1, "Debe asistir al menos una persona."),
  notes: optionalText,
});

export const bookingStatusSchema = z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
export const paymentStatusSchema = z.enum(["UNPAID", "PAID", "WAIVED"]);
export const bookingNotesSchema = z.object({ notes: optionalText });
