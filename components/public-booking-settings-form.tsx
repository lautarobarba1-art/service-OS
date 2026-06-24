"use client";

import { startTransition, useActionState } from "react";

import { updatePublicBookingSettingsAction } from "@/app/dashboard/booking-settings/actions";
import { initialActionState } from "@/lib/action-state";
import { OperationFormFeedback } from "@/components/operation-form-feedback";

type Settings = {
  publicBookingEnabled: boolean;
  bookingConfirmationMode: "AUTO_CONFIRM" | "MANUAL_APPROVAL";
  slotIntervalMinutes: number;
  minimumBookingNoticeMinutes: number;
  bookingWindowDays: number;
  cancellationNoticeMinutes: number;
};

export function PublicBookingSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updatePublicBookingSettingsAction, initialActionState);
  return (
    <form action={(formData) => startTransition(() => action(formData))} className="operation-form public-settings-form">
      <label className="toggle-field">
        <input defaultChecked={settings.publicBookingEnabled} name="publicBookingEnabled" type="checkbox" />
        <span><strong>Habilitar página pública</strong><small>La URL permanecerá sin servicios hasta que publiques y asignes al menos uno.</small></span>
      </label>
      <label>Modo de confirmación
        <select defaultValue={settings.bookingConfirmationMode} name="bookingConfirmationMode">
          <option value="AUTO_CONFIRM">Confirmación automática</option>
          <option value="MANUAL_APPROVAL">Aprobación manual</option>
        </select>
      </label>
      <div className="form-grid-two">
        <label>Intervalo entre horarios (min)<input defaultValue={settings.slotIntervalMinutes} max={120} min={5} name="slotIntervalMinutes" type="number" /></label>
        <label>Anticipación mínima (min)<input defaultValue={settings.minimumBookingNoticeMinutes} max={43200} min={0} name="minimumBookingNoticeMinutes" type="number" /></label>
        <label>Ventana de reserva (días)<input defaultValue={settings.bookingWindowDays} max={365} min={1} name="bookingWindowDays" type="number" /></label>
        <label>Límite para cancelar (min)<input defaultValue={settings.cancellationNoticeMinutes} max={43200} min={0} name="cancellationNoticeMinutes" type="number" /></label>
      </div>
      <OperationFormFeedback state={state} />
      <button className="button-primary" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar configuración"}</button>
    </form>
  );
}
