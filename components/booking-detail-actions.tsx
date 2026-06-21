"use client";

import { startTransition, useActionState } from "react";

import {
  changeBookingStatusAction,
  updateBookingNotesAction,
  updateBookingPaymentAction,
} from "@/app/dashboard/bookings/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import type { AppBookingStatus, AppPaymentStatus } from "@/lib/booking-rules";

const statusLabels: Record<AppBookingStatus, string> = {
  PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No se presentó",
};

export function BookingStatusActions({ bookingId, transitions }: { bookingId: string; transitions: AppBookingStatus[] }) {
  const [state, action, pending] = useActionState(changeBookingStatusAction, initialActionState);
  if (!transitions.length) return <p className="terminal-status">Este estado no admite nuevas transiciones.</p>;
  return (
    <div className="detail-action-block"><div className="status-action-list">{transitions.map((status) => (
      <button disabled={pending} key={status} onClick={() => { const data = new FormData(); data.set("id", bookingId); data.set("status", status); startTransition(() => action(data)); }} type="button">{statusLabels[status]}</button>
    ))}</div><OperationFormFeedback state={state} /></div>
  );
}

export function BookingPaymentForm({ bookingId, current }: { bookingId: string; current: AppPaymentStatus }) {
  const [state, action, pending] = useActionState(updateBookingPaymentAction, initialActionState);
  return (
    <form className="detail-inline-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }}>
      <input name="id" type="hidden" value={bookingId} />
      <select defaultValue={current} name="paymentStatus"><option value="UNPAID">Sin pagar</option><option value="PAID">Pagada</option><option value="WAIVED">Eximida</option></select>
      <button disabled={pending} type="submit">Guardar</button><OperationFormFeedback state={state} />
    </form>
  );
}

export function BookingNotesForm({ bookingId, notes }: { bookingId: string; notes: string }) {
  const [state, action, pending] = useActionState(updateBookingNotesAction, initialActionState);
  return (
    <form className="operation-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }}>
      <input name="id" type="hidden" value={bookingId} />
      <label>Notas internas<textarea defaultValue={notes} name="notes" rows={4} /></label>
      <button className="button-primary" disabled={pending} type="submit">Guardar notas</button><OperationFormFeedback state={state} />
    </form>
  );
}
