import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingNotesForm, BookingPaymentForm, BookingStatusActions } from "@/components/booking-detail-actions";
import { getAllowedBookingTransitions } from "@/lib/booking-rules";
import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";
import { formatUtcInTimeZone } from "@/lib/timezone";
import { entityIdSchema } from "@/lib/validations/operations";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const { id } = await params;
  if (!entityIdSchema.safeParse(id).success) notFound();
  const booking = await prisma.booking.findFirst({
    where: { id, organizationId: activeMembership.organizationId },
    include: { customer: true, service: true, resource: true },
  });
  if (!booking) notFound();
  const timezone = activeMembership.organization.timezone;
  const transitions = getAllowedBookingTransitions(booking.status, activeMembership.role);
  const canOperate = activeMembership.role !== "VIEWER";
  const canManagePayment = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";

  return (
    <div className="management-page booking-detail">
      <Link className="back-link" href="/dashboard/bookings">← Volver al calendario</Link>
      <header className="management-heading"><p className="eyebrow">RESERVA</p><h1>{booking.customer.fullName}</h1><p>{booking.service.name} · {formatUtcInTimeZone(booking.startDateTime, timezone)}</p></header>
      <div className="booking-detail-grid">
        <section className="detail-card"><h2>Datos</h2><dl><div><dt>Recurso</dt><dd>{booking.resource.name}</dd></div><div><dt>Asistentes</dt><dd>{booking.attendeesCount}</dd></div><div><dt>Inicio</dt><dd>{formatUtcInTimeZone(booking.startDateTime, timezone)}</dd></div><div><dt>Fin</dt><dd>{formatUtcInTimeZone(booking.endDateTime, timezone)}</dd></div><div><dt>Estado</dt><dd>{booking.status}</dd></div><div><dt>Pago</dt><dd>{booking.paymentStatus}</dd></div></dl></section>
        <section className="detail-card"><h2>Estado</h2>{canOperate ? <BookingStatusActions bookingId={booking.id} transitions={transitions} /> : <p className="permission-note">Tu rol es de solo lectura.</p>}<h2>Pago</h2>{canManagePayment ? <BookingPaymentForm bookingId={booking.id} current={booking.paymentStatus} /> : <p className="muted">Solo OWNER y ADMIN pueden modificarlo.</p>}</section>
      </div>
      {canOperate ? <section className="detail-card notes-card"><BookingNotesForm bookingId={booking.id} notes={booking.notes ?? ""} /></section> : null}
    </div>
  );
}
