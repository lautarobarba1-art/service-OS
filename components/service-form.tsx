"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createServiceAction, updateServiceAction } from "@/app/dashboard/services/actions";
import { initialActionState } from "@/lib/action-state";
import { serviceSchema } from "@/lib/validations/operations";
import { OperationFormFeedback } from "@/components/operation-form-feedback";

type Values = z.input<typeof serviceSchema>;
type ServiceInitial = { id: string; name: string; description: string; durationMinutes: number; price: string; capacity: number };

export function ServiceForm({ initial, compact = false }: { initial?: ServiceInitial; compact?: boolean }) {
  const action = initial ? updateServiceAction : createServiceAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(serviceSchema),
    defaultValues: initial ?? { name: "", description: "", durationMinutes: 60, price: 0, capacity: 1 },
  });

  useEffect(() => {
    if (state.message && !initial) reset();
  }, [state.message, initial, reset]);

  const clientError = Object.values(errors)[0]?.message?.toString();
  const submit = handleSubmit((values) => {
    const data = new FormData();
    if (initial) data.set("id", initial.id);
    data.set("name", String(values.name));
    data.set("description", String(values.description ?? ""));
    data.set("durationMinutes", String(values.durationMinutes));
    data.set("price", String(values.price));
    data.set("capacity", String(values.capacity));
    startTransition(() => formAction(data));
  });
  return (
    <form className={compact ? "operation-form compact" : "operation-form"} onSubmit={submit}>
      <label>Nombre<input {...register("name")} placeholder="Ej. Consulta inicial" /></label>
      <label>Descripción<textarea {...register("description")} placeholder="Detalle opcional" rows={compact ? 2 : 3} /></label>
      <div className="form-grid-three">
        <label>Duración (min)<input {...register("durationMinutes")} min={1} step={1} type="number" /></label>
        <label>Precio<input {...register("price")} min={0} step="0.01" type="number" /></label>
        <label>Capacidad<input {...register("capacity")} min={1} step={1} type="number" /></label>
      </div>
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear servicio"}</button>
    </form>
  );
}
