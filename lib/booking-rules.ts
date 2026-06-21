export type AppRole = "OWNER" | "ADMIN" | "STAFF" | "VIEWER";
export type AppBookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type AppPaymentStatus = "UNPAID" | "PAID" | "WAIVED";

export class BookingRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BookingRuleError";
  }
}

const transitions: Record<AppBookingStatus, AppBookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canOperateBookings(role: AppRole) {
  return role === "OWNER" || role === "ADMIN" || role === "STAFF";
}

export function canChangePaymentStatus(role: AppRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function getAllowedBookingTransitions(status: AppBookingStatus, role: AppRole) {
  return canOperateBookings(role) ? transitions[status] : [];
}

export function assertBookingTransition(from: AppBookingStatus, to: AppBookingStatus, role: AppRole) {
  if (!canOperateBookings(role)) throw new BookingRuleError("FORBIDDEN", "Tu rol no permite cambiar el estado de reservas.");
  if (!transitions[from].includes(to)) {
    throw new BookingRuleError("INVALID_TRANSITION", `No se puede cambiar una reserva de ${from} a ${to}.`);
  }
}

export function assertTenantMatch(entityOrganizationId: string, activeOrganizationId: string) {
  if (entityOrganizationId !== activeOrganizationId) {
    throw new BookingRuleError("TENANT_MISMATCH", "La entidad no pertenece a la organización activa.");
  }
}

export function assertSlotCapacity(usedCapacity: number, attendeesCount: number, capacity: number) {
  if (attendeesCount < 1) throw new BookingRuleError("INVALID_ATTENDEES", "La cantidad de asistentes debe ser al menos 1.");
  if (usedCapacity + attendeesCount > capacity) {
    throw new BookingRuleError("CAPACITY_EXCEEDED", "La capacidad del horario está agotada.");
  }
}

export async function reserveWithCapacity<T>(input: {
  withLock: <R>(operation: () => Promise<R>) => Promise<R>;
  getUsedCapacity: () => Promise<number>;
  attendeesCount: number;
  capacity: number;
  create: () => Promise<T>;
}) {
  return input.withLock(async () => {
    const used = await input.getUsedCapacity();
    assertSlotCapacity(used, input.attendeesCount, input.capacity);
    return input.create();
  });
}
