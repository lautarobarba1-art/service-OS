export type CustomerIdentity = {
  id?: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
};

export class CustomerDuplicateError extends Error {
  constructor(public readonly field: "email" | "phone" | "fullName", message: string) {
    super(message);
    this.name = "CustomerDuplicateError";
  }
}

export function normalizeCustomerEmail(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function normalizeCustomerPhone(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

export function normalizeCustomerName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function customerIdentityKeys(customer: CustomerIdentity) {
  const keys: string[] = [];
  const email = normalizeCustomerEmail(customer.email);
  const phone = normalizeCustomerPhone(customer.phone);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  if (!email && !phone) keys.push(`name:${normalizeCustomerName(customer.fullName)}`);
  return keys.sort();
}

export function findCustomerDuplicate(input: CustomerIdentity, existing: CustomerIdentity[]) {
  const email = normalizeCustomerEmail(input.email);
  const phone = normalizeCustomerPhone(input.phone);
  const name = normalizeCustomerName(input.fullName);
  const candidates = existing.filter((customer) => customer.id !== input.id);

  if (email && candidates.some((customer) => normalizeCustomerEmail(customer.email) === email)) {
    return new CustomerDuplicateError("email", "Ya existe un cliente creado anteriormente con ese email.");
  }
  if (phone && candidates.some((customer) => normalizeCustomerPhone(customer.phone) === phone)) {
    return new CustomerDuplicateError("phone", "Ya existe un cliente creado anteriormente con ese teléfono.");
  }
  if (!email && !phone && candidates.some((customer) => !normalizeCustomerEmail(customer.email) && !normalizeCustomerPhone(customer.phone) && normalizeCustomerName(customer.fullName) === name)) {
    return new CustomerDuplicateError("fullName", "Ya existe un cliente sin datos de contacto con ese nombre.");
  }
  return null;
}
