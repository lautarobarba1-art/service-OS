import { Prisma } from "@prisma/client";

import { localDateKey, utcToZonedParts, zonedDateTimeToUtc } from "@/lib/timezone";

export type DashboardPeriod = "day" | "week" | "month";
export type BookingMetricInput = { startDateTime: Date; status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" };

function shiftDate(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function getDashboardPeriodRange(period: DashboardPeriod, timeZone: string, now = new Date()) {
  const localNow = utcToZonedParts(now, timeZone);
  let startLocal = { year: localNow.year, month: localNow.month, day: localNow.day };
  let endLocal: { year: number; month: number; day: number };

  if (period === "week") {
    const daysSinceMonday = (localNow.dayOfWeek + 6) % 7;
    startLocal = shiftDate(localNow.year, localNow.month, localNow.day, -daysSinceMonday);
    endLocal = shiftDate(startLocal.year, startLocal.month, startLocal.day, 7);
  } else if (period === "month") {
    startLocal = { year: localNow.year, month: localNow.month, day: 1 };
    const nextMonth = new Date(Date.UTC(localNow.year, localNow.month, 1));
    endLocal = { year: nextMonth.getUTCFullYear(), month: nextMonth.getUTCMonth() + 1, day: 1 };
  } else {
    endLocal = shiftDate(startLocal.year, startLocal.month, startLocal.day, 1);
  }

  const start = zonedDateTimeToUtc({ ...startLocal, hour: 0, minute: 0, second: 0 }, timeZone);
  const end = zonedDateTimeToUtc({ ...endLocal, hour: 0, minute: 0, second: 0 }, timeZone);
  return { start, end, startLocal, endLocal };
}

export function buildBookingSeries(bookings: BookingMetricInput[], period: DashboardPeriod, timeZone: string, range: ReturnType<typeof getDashboardPeriodRange>) {
  if (period === "day") {
    const counts = Array.from({ length: 24 }, () => 0);
    bookings.forEach((booking) => { counts[utcToZonedParts(booking.startDateTime, timeZone).hour] += 1; });
    return counts.map((value, hour) => ({ label: `${String(hour).padStart(2, "0")}h`, value }));
  }

  const length = period === "week"
    ? 7
    : new Date(Date.UTC(range.endLocal.year, range.endLocal.month - 1, 0)).getUTCDate();
  const labels = period === "week" ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] : Array.from({ length }, (_, index) => String(index + 1));
  const counts = Array.from({ length }, () => 0);
  bookings.forEach((booking) => {
    const local = utcToZonedParts(booking.startDateTime, timeZone);
    const index = period === "week" ? (local.dayOfWeek + 6) % 7 : local.day - 1;
    if (index >= 0 && index < counts.length) counts[index] += 1;
  });
  return counts.map((value, index) => ({ label: labels[index], value }));
}

export function aggregateBookingStatuses(bookings: BookingMetricInput[]) {
  const counts = { PENDING: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 };
  bookings.forEach((booking) => { counts[booking.status] += 1; });
  return counts;
}

export function percentage(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

type TopServiceRow = { id: string; name: string; bookingCount: bigint };

export async function getDashboardMetrics(
  input: { organizationId: string; timeZone: string; period: DashboardPeriod; now?: Date },
  database: Prisma.TransactionClient,
) {
  const range = getDashboardPeriodRange(input.period, input.timeZone, input.now);
  const scopedWhere = { organizationId: input.organizationId, startDateTime: { gte: range.start, lt: range.end } };

  const [bookings, newCustomers, pendingPaymentCount, pendingPayments, topServiceRows] = await Promise.all([
    database.booking.findMany({ where: scopedWhere, select: { startDateTime: true, status: true } }),
    database.customer.count({ where: { organizationId: input.organizationId, createdAt: { gte: range.start, lt: range.end } } }),
    database.booking.count({ where: { ...scopedWhere, status: "COMPLETED", paymentStatus: "UNPAID" } }),
    database.booking.findMany({
      where: { ...scopedWhere, status: "COMPLETED", paymentStatus: "UNPAID" },
      include: { customer: { select: { fullName: true } }, service: { select: { name: true } } },
      orderBy: { startDateTime: "desc" }, take: 5,
    }),
    database.$queryRaw<TopServiceRow[]>(Prisma.sql`
      SELECT s."id", s."name", COUNT(b."id")::bigint AS "bookingCount"
      FROM "Booking" b
      INNER JOIN "Service" s ON s."id" = b."serviceId"
      WHERE b."organizationId" = CAST(${input.organizationId} AS uuid)
        AND b."startDateTime" >= ${range.start}
        AND b."startDateTime" < ${range.end}
      GROUP BY s."id", s."name"
      ORDER BY COUNT(b."id") DESC, s."name" ASC
      LIMIT 5
    `),
  ]);

  const statusCounts = aggregateBookingStatuses(bookings);
  const totalBookings = bookings.length;
  return {
    range,
    totalBookings,
    newCustomers,
    pendingPaymentCount,
    pendingPayments,
    statusCounts,
    cancellationRate: percentage(statusCounts.CANCELLED, totalBookings),
    noShowRate: percentage(statusCounts.NO_SHOW, totalBookings),
    bookingSeries: buildBookingSeries(bookings, input.period, input.timeZone, range),
    topServices: topServiceRows.map((row) => ({ id: row.id, name: row.name, count: Number(row.bookingCount) })),
    rangeDateKeys: { start: localDateKey(range.startLocal), end: localDateKey(range.endLocal) },
  };
}
