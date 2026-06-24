import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicBookingByManageToken } from "@/lib/public-booking-management";
import { formatUtcInTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi reserva · ServiceOS",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const statusLabels = {
  PENDING: "Pendiente de aprobación",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "Ausente",
} as const;

export default async function PublicBookingDetailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getPublicBookingByManageToken(token);
  if (!booking) notFound();

  return (
    <main className="public-manage-page">
      <section className="public-manage-card">
        <span className="brand-mark">S</span>
        <p className="eyebrow">TU RESERVA</p>
        <h1>{booking.organizationName}</h1>
        <span className={`booking-status status-${booking.status.toLowerCase()}`}>{statusLabels[booking.status]}</span>
        <dl>
          <div><dt>Servicio</dt><dd>{booking.serviceName}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{formatUtcInTimeZone(booking.startDateTime, booking.timezone)}</dd></div>
          <div><dt>Asistentes</dt><dd>{booking.attendeesCount}</dd></div>
          <div><dt>Referencia</dt><dd>{booking.referenceCode}</dd></div>
        </dl>
        <p className="muted">Para realizar cambios, comunicate directamente con el negocio.</p>
      </section>
    </main>
  );
}
