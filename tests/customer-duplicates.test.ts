import { describe, expect, it } from "vitest";

import { customerIdentityKeys, findCustomerDuplicate } from "@/lib/customer-duplicates";

const existing = [
  { id: "a", fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: "+54 11 5555-1234" },
  { id: "b", fullName: "Juan Sin Contacto", email: null, phone: null },
];

describe("customer duplicate detection", () => {
  it("rejects the same email regardless of casing or whitespace", () => {
    expect(findCustomerDuplicate({ fullName: "Otra Ana", email: " ANA@EJEMPLO.COM " }, existing)?.field).toBe("email");
  });

  it("rejects equivalent phone formatting", () => {
    expect(findCustomerDuplicate({ fullName: "Otra persona", phone: "541155551234" }, existing)?.field).toBe("phone");
  });

  it("allows equal names when contact information identifies different people", () => {
    expect(findCustomerDuplicate({ fullName: "Ana Pérez", email: "otra@ejemplo.com" }, existing)).toBeNull();
  });

  it("rejects duplicate names when neither record has contact information", () => {
    expect(findCustomerDuplicate({ fullName: " juan  sin contacto " }, existing)?.field).toBe("fullName");
  });

  it("excludes the current customer while editing", () => {
    expect(findCustomerDuplicate({ id: "a", fullName: "Ana Pérez", email: "ana@ejemplo.com" }, existing)).toBeNull();
  });

  it("creates stable lock keys for concurrent writes", () => {
    expect(customerIdentityKeys({ fullName: "Ana", email: "ANA@EJEMPLO.COM", phone: "+54 11" })).toEqual(["email:ana@ejemplo.com", "phone:5411"]);
  });
});
