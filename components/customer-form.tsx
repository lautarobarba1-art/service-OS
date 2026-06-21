"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createCustomerAction, updateCustomerAction } from "@/app/dashboard/customers/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { customerSchema } from "@/lib/validations/operations";

type Values = z.input<typeof customerSchema>;
type CustomerInitial = { id: string; fullName: string; email: string; phone: string; notes: string };

export function CustomerForm({ initial, compact = false }: { initial?: CustomerInitial; compact?: boolean }) {
  const action = initial ? updateCustomerAction : createCustomerAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(customerSchema),
    defaultValues: initial ?? { fullName: "", email: "", phone: "", notes: "" },
  });
  useEffect(() => { if (state.message && !initial) reset(); }, [state.message, initial, reset]);
  const clientError = Object.values(errors)[0]?.message?.toString();
  const submit = handleSubmit((values) => {
    const data = new FormData();
    if (initial) data.set("id", initial.id);
    data.set("fullName", String(values.fullName));
    data.set("email", String(values.email ?? ""));
    data.set("phone", String(values.phone ?? ""));
    data.set("notes", String(values.notes));
    startTransition(() => formAction(data));
  });

  return (
    <form className={compact ? "operation-form compact" : "operation-form"} onSubmit={submit}>
      <label>Nombre completo<input {...register("fullName")} placeholder="Ej. Ana Torres" /></label>
      <div className="form-grid-two">
        <label>Email<input {...register("email")} placeholder="ana@email.com" type="email" /></label>
        <label>Teléfono<input {...register("phone")} placeholder="+54 11…" type="tel" /></label>
      </div>
      <label>Notas<textarea {...register("notes")} placeholder="Notas internas" rows={compact ? 2 : 3} /></label>
      <OperationFormFeedback clientError={clientError} state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear cliente"}</button>
    </form>
  );
}
