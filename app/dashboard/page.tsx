import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardCharts } from "@/components/dashboard-charts";
import { getDashboardMetrics, type DashboardPeriod } from "@/lib/dashboard-metrics";
import { getOrganizationContext } from "@/lib/organization-context";
import { formatUtcInTimeZone } from "@/lib/timezone";

const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "day", label: "Hoy" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" },
];

const statusMeta = [
  { key: "PENDING" as const, label: "Pendientes", color: "#b58a2b" },
  { key: "CONFIRMED" as const, label: "Confirmadas", color: "#2f6b4d" },
  { key: "COMPLETED" as const, label: "Completadas", color: "#6f9276" },
  { key: "CANCELLED" as const, label: "Canceladas", color: "#a35b53" },
  { key: "NO_SHOW" as const, label: "No-show", color: "#716779" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  if (activeMembership.role !== "OWNER" && activeMembership.role !== "ADMIN") redirect("/dashboard/bookings");
  const requestedPeriod = (await searchParams).period;
  const period: DashboardPeriod = requestedPeriod === "day" || requestedPeriod === "week" || requestedPeriod === "month" ? requestedPeriod : "week";
  const metrics = await getDashboardMetrics({
    organizationId: activeMembership.organizationId,
    timeZone: activeMembership.organization.timezone,
    period,
  });
  const statusSeries = statusMeta.map((item) => ({ label: item.label, color: item.color, value: metrics.statusCounts[item.key] }));
  const maxServiceCount = Math.max(1, ...metrics.topServices.map((item) => item.count));

  return (
    <div className="dashboard-content metrics-dashboard">
      <div className="page-heading metrics-heading">
        <div><p className="eyebrow">PULSO OPERATIVO</p><h1>{activeMembership.organization.name}</h1><p>{activeMembership.organization.timezone}</p></div>
        <div className="period-switcher">{periods.map((item) => <Link className={period === item.value ? "active" : ""} href={`/dashboard?period=${item.value}`} key={item.value}>{item.label}</Link>)}</div>
      </div>

      <section className="kpi-grid">
        <article><span>Reservas</span><strong>{metrics.totalBookings}</strong><small>En el período</small></article>
        <article><span>Clientes nuevos</span><strong>{metrics.newCustomers}</strong><small>Altas del período</small></article>
        <article className={metrics.pendingPaymentCount ? "kpi-alert" : ""}><span>Cobros pendientes</span><strong>{metrics.pendingPaymentCount}</strong><small>Completadas sin cobrar</small></article>
        <article><span>Cancelación</span><strong>{metrics.cancellationRate}%</strong><small>Canceladas / total</small></article>
        <article><span>No-show</span><strong>{metrics.noShowRate}%</strong><small>Ausencias / total</small></article>
      </section>

      <DashboardCharts bookingSeries={metrics.bookingSeries} statusSeries={statusSeries} />

      <div className="dashboard-lists-grid">
        <section className="metric-panel">
          <div className="metric-panel-title"><div><p className="eyebrow">DEMANDA</p><h2>Servicios más reservados</h2></div></div>
          <div className="ranking-list">{metrics.topServices.length ? metrics.topServices.map((service, index) => (
            <div key={service.id}><span className="rank-number">{index + 1}</span><div><strong>{service.name}</strong><i><b style={{ width: `${(service.count / maxServiceCount) * 100}%` }} /></i></div><span>{service.count}</span></div>
          )) : <p className="empty-metric">Todavía no hay reservas en este período.</p>}</div>
        </section>
        <section className="metric-panel">
          <div className="metric-panel-title"><div><p className="eyebrow">SEGUIMIENTO</p><h2>Cobros pendientes</h2></div><Link href="/dashboard/bookings">Ver calendario</Link></div>
          <div className="pending-payment-list">{metrics.pendingPayments.length ? metrics.pendingPayments.map((booking) => (
            <Link href={`/dashboard/bookings/${booking.id}`} key={booking.id}><div><strong>{booking.customer.fullName}</strong><span>{booking.service.name}</span></div><time>{formatUtcInTimeZone(booking.startDateTime, activeMembership.organization.timezone)}</time></Link>
          )) : <p className="empty-metric">No hay reservas completadas sin cobrar.</p>}</div>
        </section>
      </div>
    </div>
  );
}
