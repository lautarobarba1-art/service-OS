"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  cancelPublicBookingAction,
  loadPublicManageBookingAction,
  loadPublicManageSlotsAction,
  reschedulePublicBookingAction,
  type PublicManageLoadState,
  type PublicManageMutationState,
  type PublicManageSlotsState,
} from "@/app/reserva/actions";

const initialLoad: PublicManageLoadState = {};
const initialSlots: PublicManageSlotsState = {};
const initialMutation: PublicManageMutationState = {};

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function readHashToken() {
  return window.location.hash.slice(1);
}

function statusLabel(status: string) {
  return ({
    PENDING: "Pendiente de aprobación",
    CONFIRMED: "Confirmada",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
    NO_SHOW: "Ausente",
  } as Record<string, string>)[status] ?? status;
}

function ManagementForms({ token, minimumLocalDate }: { token: string; minimumLocalDate: string }) {
  const [localDate, setLocalDate] = useState(minimumLocalDate);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotState, loadSlots, loadingSlots] = useActionState(loadPublicManageSlotsAction, initialSlots);
  const [cancelState, cancel, cancelling] = useActionState(cancelPublicBookingAction, initialMutation);
  const [rescheduleState, reschedule, rescheduling] = useActionState(reschedulePublicBookingAction, initialMutation);

  if (cancelState.result) {
    return (
      <section className="public-success" aria-live="polite">
        <span className="public-success-mark">✓</span>
        <h2>Reserva cancelada</h2>
        <p>La capacidad quedó liberada. Este enlace de gestión ya fue revocado.</p>
      </section>
    );
  }
  if (rescheduleState.result) {
    return (
      <section className="public-success" aria-live="polite">
        <span className="public-success-mark">✓</span>
        <h2>Reserva reprogramada</h2>
        <p>Nuevo horario: {rescheduleState.result.localDateTime}</p>
        {rescheduleState.result.managePath ? <Link className="button-primary" href={rescheduleState.result.managePath}>Abrir enlace actualizado</Link> : null}
        <small>El enlace anterior fue revocado.</small>
      </section>
    );
  }

  return (
    <div className="public-management-actions">
      <section>
        <h2>Reprogramar</h2>
        <form action={loadSlots} className="public-slot-search">
          <input name="token" type="hidden" value={token} />
          <label>Nueva fecha<input min={minimumLocalDate} name="localDate" onChange={(event) => { setLocalDate(event.target.value); setSelectedSlot(""); }} required type="date" value={localDate} /></label>
          <button className="button-secondary" disabled={loadingSlots} type="submit">{loadingSlots ? "Buscando…" : "Ver horarios"}</button>
        </form>
        {slotState.error ? <p className="form-error" role="alert">{slotState.error}</p> : null}
        {slotState.slots?.length ? (
          <div className="public-slots">
            <div>
              {slotState.slots.map((slot) => (
                <label className={selectedSlot === slot.startDateTime ? "selected" : ""} key={slot.startDateTime}>
                  <input checked={selectedSlot === slot.startDateTime} onChange={() => setSelectedSlot(slot.startDateTime)} type="radio" />
                  <span>{slot.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {selectedSlot ? (
          <form action={reschedule} className="public-reschedule-form">
            <input name="token" type="hidden" value={token} />
            <input name="startDateTime" type="hidden" value={selectedSlot} />
            {rescheduleState.error ? <p className="form-error" role="alert">{rescheduleState.error}</p> : null}
            <button className="button-primary" disabled={rescheduling} type="submit">{rescheduling ? "Reprogramando…" : "Confirmar nuevo horario"}</button>
          </form>
        ) : null}
      </section>

      <section className="public-cancel-section">
        <h2>Cancelar reserva</h2>
        <p>Esta acción libera el horario y no se puede deshacer desde este enlace.</p>
        <form action={cancel} onSubmit={(event) => { if (!window.confirm("¿Confirmás la cancelación de la reserva?")) event.preventDefault(); }}>
          <input name="token" type="hidden" value={token} />
          {cancelState.error ? <p className="form-error" role="alert">{cancelState.error}</p> : null}
          <button className="button-danger" disabled={cancelling} type="submit">{cancelling ? "Cancelando…" : "Cancelar reserva"}</button>
        </form>
      </section>
    </div>
  );
}

export function PublicBookingManagement() {
  const token = useSyncExternalStore(subscribeToHash, readHashToken, () => "");
  const [state, load, pending] = useActionState(loadPublicManageBookingAction, initialLoad);
  const loadedToken = useRef("");

  useEffect(() => {
    if (!token || loadedToken.current === token) return;
    loadedToken.current = token;
    const formData = new FormData();
    formData.set("token", token);
    startTransition(() => load(formData));
  }, [load, token]);

  return (
    <main className="public-manage-page">
      <section className="public-manage-card">
        <span className="brand-mark">S</span>
        {!token ? <p className="form-error">No pudimos validar el enlace de gestión.</p> : null}
        {pending ? <p className="muted">Consultando reserva…</p> : null}
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.booking ? (
          <>
            <p className="eyebrow">TU RESERVA</p>
            <h1>{state.booking.organizationName}</h1>
            <span className={`booking-status status-${state.booking.status.toLowerCase()}`}>{statusLabel(state.booking.status)}</span>
            <dl>
              <div><dt>Servicio</dt><dd>{state.booking.serviceName}</dd></div>
              <div><dt>Fecha y hora</dt><dd>{state.booking.localDateTime}</dd></div>
              <div><dt>Asistentes</dt><dd>{state.booking.attendeesCount}</dd></div>
              <div><dt>Referencia</dt><dd>{state.booking.referenceCode}</dd></div>
            </dl>
            {state.booking.canManage ? (
              <>
                <p className="management-deadline">Podés realizar cambios hasta {state.booking.cancellationDeadline}.</p>
                <ManagementForms key={token} minimumLocalDate={state.booking.minimumLocalDate} token={token} />
              </>
            ) : <p className="muted">Esta reserva ya no admite cambios desde el enlace público.</p>}
          </>
        ) : null}
      </section>
    </main>
  );
}
