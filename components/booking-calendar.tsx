import Link from "next/link";

export type CalendarBooking = {
  id: string;
  day: number;
  time: string;
  customerName: string;
  serviceName: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
};

const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function BookingCalendar({ year, month, bookings }: { year: number; month: number; bookings: CalendarBooking[] }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: Array<number | null> = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="calendar-wrap">
      <div className="calendar-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => (
        <div className={day ? "calendar-day" : "calendar-day empty"} key={`${day ?? "empty"}-${index}`}>
          {day ? <><strong>{day}</strong><div className="calendar-events">{bookings.filter((booking) => booking.day === day).map((booking) => (
            <Link className={`calendar-event status-${booking.status.toLowerCase()}`} href={`/dashboard/bookings/${booking.id}`} key={booking.id}>
              <span>{booking.time} · {booking.customerName}</span><small>{booking.serviceName}</small>
            </Link>
          ))}</div></> : null}
        </div>
      ))}</div>
    </div>
  );
}
