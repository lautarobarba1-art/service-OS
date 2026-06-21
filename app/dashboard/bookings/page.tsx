import Link from "next/link";

import { BookingCalendar } from "@/components/booking-calendar";
import { BookingForm } from "@/components/booking-form";
import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";
import { databaseTimeToString, utcToZonedParts, zonedDateTimeToUtc } from "@/lib/timezone";

function parseMonth(value: string | undefined, timezone: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const now = utcToZonedParts(new Date(), timezone);
  return { year: now.year, month: now.month };
}

function adjacentMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const timezone = activeMembership.organization.timezone;
  const { year, month } = parseMonth((await searchParams).month, timezone);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const rangeStart = zonedDateTimeToUtc({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, timezone);
  const rangeEnd = zonedDateTimeToUtc({ year: next.year, month: next.month, day: 1, hour: 0, minute: 0, second: 0 }, timezone);

  const [bookings, customers, services, resources] = await Promise.all([
    prisma.booking.findMany({
      where: { organizationId: activeMembership.organizationId, startDateTime: { gte: rangeStart, lt: rangeEnd } },
      include: { customer: true, service: true }, orderBy: { startDateTime: "asc" },
    }),
    prisma.customer.findMany({ where: { organizationId: activeMembership.organizationId }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.service.findMany({ where: { organizationId: activeMembership.organizationId, isActive: true }, select: { id: true, name: true, capacity: true }, orderBy: { name: "asc" } }),
    prisma.resource.findMany({
      where: { organizationId: activeMembership.organizationId, isActive: true, availabilityRules: { some: {} } },
      select: { id: true, name: true, availabilityRules: { select: { dayOfWeek: true, startTime: true, endTime: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
      orderBy: { name: "asc" },
    }),
  ]);
  const canCreate = activeMembership.role !== "VIEWER";
  const rows = bookings.map((booking) => {
    const local = utcToZonedParts(booking.startDateTime, timezone);
    return {
      id: booking.id, day: local.day, time: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
      customerName: booking.customer.fullName, serviceName: booking.service.name, status: booking.status,
    };
  });
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="management-page bookings-page">
      <header className="management-heading booking-heading"><div><p className="eyebrow">OPERACIÓN</p><h1>Calendario</h1><p>Reservas expresadas en {timezone}.</p></div><div className="month-nav"><Link href={`/dashboard/bookings?month=${adjacentMonth(year, month, -1)}`}>←</Link><strong>{monthLabel}</strong><Link href={`/dashboard/bookings?month=${adjacentMonth(year, month, 1)}`}>→</Link></div></header>
      {canCreate ? <details className="booking-creator"><summary>Nueva reserva</summary><div><BookingForm customers={customers.map((item) => ({ id: item.id, name: item.fullName }))} resources={resources.map((resource) => ({ id: resource.id, name: resource.name, availability: resource.availabilityRules.map((rule) => ({ dayOfWeek: rule.dayOfWeek, startTime: databaseTimeToString(rule.startTime), endTime: databaseTimeToString(rule.endTime) })) }))} services={services} timezone={timezone} /></div></details> : null}
      <BookingCalendar bookings={rows} month={month} year={year} />
    </div>
  );
}
