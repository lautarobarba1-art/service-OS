"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createAvailabilityRuleAction, updateAvailabilityRuleAction } from "@/app/dashboard/availability/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { availabilityRuleSchema } from "@/lib/validations/operations";

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
type Values = z.input<typeof availabilityRuleSchema>;
type InitialRule = { id: string; resourceId: string; dayOfWeek: number; startTime: string; endTime: string };

export function AvailabilityRuleForm({ resourceId, initial, compact = false }: { resourceId: string; initial?: InitialRule; compact?: boolean }) {
  const action = initial ? updateAvailabilityRuleAction : createAvailabilityRuleAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(availabilityRuleSchema),
    defaultValues: initial ?? { resourceId, dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
  });
  useEffect(() => { if (state.message && !initial) reset({ resourceId, dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }); }, [state.message, initial, reset, resourceId]);
  const clientError = Object.values(errors)[0]?.message?.toString();
  const submit = handleSubmit((values) => {
    const data = new FormData();
    if (initial) data.set("id", initial.id);
    data.set("resourceId", resourceId);
    data.set("dayOfWeek", String(values.dayOfWeek));
    data.set("startTime", String(values.startTime));
    data.set("endTime", String(values.endTime));
    startTransition(() => formAction(data));
  });

  return (
    <form className={compact ? "operation-form compact" : "operation-form availability-rule-form"} onSubmit={submit}>
      <input {...register("resourceId")} type="hidden" value={resourceId} />
      <div className="form-grid-three">
        <label>Día<select {...register("dayOfWeek")}>{DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
        <label>Desde<input {...register("startTime")} type="time" /></label>
        <label>Hasta<input {...register("endTime")} type="time" /></label>
      </div>
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : initial ? "Guardar horario" : "Agregar horario"}</button>
    </form>
  );
}
