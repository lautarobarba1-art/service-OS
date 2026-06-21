"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { createBookingAction } from "@/app/dashboard/bookings/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { createBookingSchema } from "@/lib/validations/operations";

type Values = z.input<typeof createBookingSchema>;
type Option = { id: string; name: string };
type ResourceOption = Option & { availability: Array<{ dayOfWeek: number; startTime: string; endTime: string }> };
const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function BookingForm({ customers, services, resources, timezone }: { customers: Option[]; services: Array<Option & { capacity: number }>; resources: ResourceOption[]; timezone: string }) {
  const [state, formAction, pending] = useActionState(createBookingAction, initialActionState);
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: { customerId: "", serviceId: "", resourceId: "", localStartDateTime: "", attendeesCount: 1, notes: "" },
  });
  useEffect(() => { if (state.message) reset(); }, [state.message, reset]);
  const clientError = Object.values(errors)[0]?.message?.toString();
  const selectedResourceId = useWatch({ control, name: "resourceId" });
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const submit = handleSubmit((values) => {
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => data.set(key, String(value ?? "")));
    startTransition(() => formAction(data));
  });
  const ready = customers.length > 0 && services.length > 0 && resources.length > 0;

  return (
    <form className="operation-form booking-form" onSubmit={submit}>
      <div className="form-grid-three">
        <label>Cliente<select {...register("customerId")}><option value="">Seleccionar…</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Servicio<select {...register("serviceId")}><option value="">Seleccionar…</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · cap. {item.capacity}</option>)}</select></label>
        <label>Recurso<select {...register("resourceId")}><option value="">Seleccionar…</option>{resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="form-grid-two">
        <label>Inicio local<input {...register("localStartDateTime")} type="datetime-local" /></label>
        <label>Asistentes<input {...register("attendeesCount")} min={1} step={1} type="number" /></label>
      </div>
      <label>Notas<textarea {...register("notes")} placeholder="Notas internas opcionales" rows={2} /></label>
      <p className="field-help">Zona horaria: {timezone}</p>
      {selectedResource ? (
        <div className="booking-availability-hint">
          <strong>Disponibilidad de {selectedResource.name}</strong>
          <div>{selectedResource.availability.map((rule, index) => <span key={`${rule.dayOfWeek}-${rule.startTime}-${index}`}>{dayNames[rule.dayOfWeek]} {rule.startTime}–{rule.endTime}</span>)}</div>
        </div>
      ) : null}
      {!ready ? <p className="form-error">Necesitás al menos un cliente, servicio activo y un recurso con disponibilidad configurada.</p> : null}
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending || !ready} type="submit">{pending ? "Validando disponibilidad…" : "Crear reserva"}</button>
    </form>
  );
}
