"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createResourceAction, updateResourceAction } from "@/app/dashboard/resources/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { resourceSchema } from "@/lib/validations/operations";

type Values = z.input<typeof resourceSchema>;
type ResourceInitial = { id: string; name: string; type: "PERSON" | "ROOM" | "EQUIPMENT" };

export function ResourceForm({ initial, compact = false }: { initial?: ResourceInitial; compact?: boolean }) {
  const action = initial ? updateResourceAction : createResourceAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(resourceSchema), defaultValues: initial ?? { name: "", type: "PERSON" },
  });
  useEffect(() => { if (state.message && !initial) reset(); }, [state.message, initial, reset]);
  const clientError = Object.values(errors)[0]?.message?.toString();
  const submit = handleSubmit((values) => {
    const data = new FormData();
    if (initial) data.set("id", initial.id);
    data.set("name", String(values.name));
    data.set("type", String(values.type));
    startTransition(() => formAction(data));
  });

  return (
    <form className={compact ? "operation-form compact" : "operation-form"} onSubmit={submit}>
      <div className="form-grid-two">
        <label>Nombre<input {...register("name")} placeholder="Ej. Sala A" /></label>
        <label>Tipo<select {...register("type")}><option value="PERSON">Persona</option><option value="ROOM">Sala</option><option value="EQUIPMENT">Equipo</option></select></label>
      </div>
      {!compact ? <p className="field-help">Persona: profesional o miembro del equipo. Sala: espacio físico. Equipo: herramienta o máquina que no puede usarse en dos reservas al mismo tiempo.</p> : null}
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear recurso"}</button>
    </form>
  );
}
