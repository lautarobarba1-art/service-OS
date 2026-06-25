"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createPublicBookingAction,
  loadPublicSlotsAction,
  type PublicBookingActionState,
  type PublicSlotActionState,
} from "@/app/reservar/[slug]/actions";

type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  capacity: number;
};

const initialSlots: PublicSlotActionState = {};
const initialBooking: PublicBookingActionState = {};

function BookingDetails({
  slug,
  service,
  localDate,
  attendeesCount,
  idempotencyKey,
}: {
  slug: string;
  service: PublicService;
  localDate: string;
  attendeesCount: number;
  idempotencyKey: string;
}) {
  const [slotState, loadSlots, loadingSlots] = useActionState(loadPublicSlotsAction, initialSlots);
  const [bookingState, createBooking, creatingBooking] = useActionState(createPublicBookingAction, initialBooking);
  const [selectedSlot, setSelectedSlot] = useState("");

  if (bookingState.result) {
    const confirmed = bookingState.result.status === "CONFIRMED";
    return (
      <section className="public-success" aria-live="polite">
        <span className="public-success-mark">✓</span>
        <p className="eyebrow">{confirmed ? "RESERVA CONFIRMADA" : "SOLICITUD RECIBIDA"}</p>
        <h2>{confirmed ? "Tu horario quedó reservado" : "El negocio revisará tu solicitud"}</h2>
        <p>{service.name} · {bookingState.result.localDateTime}</p>
        <div><span>Referencia</span><strong>{bookingState.result.referenceCode}</strong></div>
        {bookingState.result.managePath ? <Link className="button-primary" href={bookingState.result.managePath}>Ver mi reserva</Link> : null}
        <small>También enviamos el detalle al email ingresado.</small>
      </section>
    );
  }

  return (
    <>
      <form action={loadSlots} className="public-slot-search">
        <input name="slug" type="hidden" value={slug} />
        <input name="serviceId" type="hidden" value={service.id} />
        <input name="localDate" type="hidden" value={localDate} />
        <input name="attendeesCount" type="hidden" value={attendeesCount} />
        <button className="button-secondary" disabled={loadingSlots} type="submit">
          {loadingSlots ? "Buscando…" : "Ver horarios disponibles"}
        </button>
      </form>

      {slotState.error ? <p className="form-error" role="alert">{slotState.error}</p> : null}
      {slotState.slots?.length ? (
        <section className="public-slots" aria-label="Horarios disponibles">
          <h3>Elegí un horario</h3>
          <div>
            {slotState.slots.map((slot) => (
              <label key={slot.startDateTime} className={selectedSlot === slot.startDateTime ? "selected" : ""}>
                <input
                  checked={selectedSlot === slot.startDateTime}
                  name="selectedSlot"
                  onChange={() => setSelectedSlot(slot.startDateTime)}
                  type="radio"
                  value={slot.startDateTime}
                />
                <span>{slot.label}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {selectedSlot ? (
        <form action={createBooking} className="public-guest-form">
          <input name="slug" type="hidden" value={slug} />
          <input name="serviceId" type="hidden" value={service.id} />
          <input name="startDateTime" type="hidden" value={selectedSlot} />
          <input name="attendeesCount" type="hidden" value={attendeesCount} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          <h3>Tus datos</h3>
          <label>Nombre completo<input autoComplete="name" maxLength={120} minLength={2} name="fullName" required /></label>
          <div className="form-grid-two">
            <label>Email<input autoComplete="email" name="email" required type="email" /></label>
            <label>Teléfono <span>(opcional)</span><input autoComplete="tel" maxLength={30} name="phone" type="tel" /></label>
          </div>
          {bookingState.error ? <p className="form-error" role="alert">{bookingState.error}</p> : null}
          <button className="button-primary" disabled={creatingBooking} type="submit">
            {creatingBooking ? "Confirmando…" : "Confirmar reserva"}
          </button>
          <small>Al confirmar aceptás que el negocio use estos datos para gestionar tu reserva.</small>
        </form>
      ) : null}
    </>
  );
}

export function PublicBookingFlow({
  slug,
  services,
  minimumLocalDate,
  idempotencyKey,
}: {
  slug: string;
  services: PublicService[];
  minimumLocalDate: string;
  idempotencyKey: string;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [localDate, setLocalDate] = useState(minimumLocalDate);
  const [attendeesCount, setAttendeesCount] = useState(1);
  const service = services.find((item) => item.id === serviceId);
  const serviceCapacity = service?.capacity ?? 1;
  const effectiveAttendeesCount = Math.min(Math.max(attendeesCount, 1), serviceCapacity);

  if (!service) return <p className="public-empty">No hay servicios disponibles en este momento.</p>;
  const allowsMultiplePlaces = service.capacity > 1;
  const price = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(service.price));

  return (
    <div className="public-booking-flow">
      <section className="public-service-controls">
        <label>Servicio
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="public-service-meta">
          <strong>{service.name}</strong>
          {service.description ? <p>{service.description}</p> : null}
          <span>{service.durationMinutes} min · ${price} · hasta {service.capacity} {service.capacity === 1 ? "persona" : "personas"}</span>
        </div>
        <div className="form-grid-two">
          <label>Fecha<input min={minimumLocalDate} onChange={(event) => setLocalDate(event.target.value)} required type="date" value={localDate} /></label>
          {allowsMultiplePlaces ? (
            <label>Cantidad de lugares<input max={service.capacity} min={1} onChange={(event) => setAttendeesCount(Math.min(Math.max(Number(event.target.value), 1), service.capacity))} required type="number" value={effectiveAttendeesCount} /></label>
          ) : null}
        </div>
      </section>
      <BookingDetails
        key={`${serviceId}:${localDate}:${effectiveAttendeesCount}`}
        attendeesCount={effectiveAttendeesCount}
        idempotencyKey={idempotencyKey}
        localDate={localDate}
        service={service}
        slug={slug}
      />
    </div>
  );
}
