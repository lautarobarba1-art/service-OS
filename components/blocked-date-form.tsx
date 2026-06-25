"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createBlockedDateAction, updateBlockedDateAction } from "@/app/dashboard/availability/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { resourceDisplayName, type ResourceType } from "@/lib/resource-labels";
import { blockedDateSchema } from "@/lib/validations/operations";

type Values = z.input<typeof blockedDateSchema>;
type InitialBlocked = { id: string; resourceId: string; date: string; reason: string };

export function BlockedDateForm({
  resources,
  initial,
  compact = false,
}: {
  resources: Array<{ id: string; name: string; type: ResourceType }>;
  initial?: InitialBlocked;
  compact?: boolean;
}) {
  const action = initial ? updateBlockedDateAction : createBlockedDateAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(blockedDateSchema),
    defaultValues: initial ?? { resourceId: "", date: "", reason: "" },
  });
  useEffect(() => {
    if (state.message && !initial) reset({ resourceId: "", date: "", reason: "" });
  }, [state.message, initial, reset]);
  const clientError = Object.values(errors)[0]?.message?.toString();
  const submit = handleSubmit((values) => {
    const data = new FormData();
    if (initial) data.set("id", initial.id);
    data.set("resourceId", String(values.resourceId ?? ""));
    data.set("date", String(values.date));
    data.set("reason", String(values.reason ?? ""));
    startTransition(() => formAction(data));
  });

  return (
    <form className={compact ? "operation-form compact" : "operation-form"} onSubmit={submit}>
      <div className="form-grid-two">
        <label>Alcance<select {...register("resourceId")}><option value="">Toda la organización</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resourceDisplayName(resource)}</option>)}</select></label>
        <label>Fecha local<input {...register("date")} type="date" /></label>
      </div>
      <label>Motivo<input {...register("reason")} placeholder="Ej. Feriado" /></label>
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : initial ? "Guardar bloqueo" : "Bloquear fecha"}</button>
    </form>
  );
}
