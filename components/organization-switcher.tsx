"use client";

import { useRef } from "react";

import { switchOrganizationAction } from "@/app/dashboard/actions";

type MembershipOption = {
  id: string;
  organization: { name: string };
};

export function OrganizationSwitcher({ memberships, activeId }: { memberships: MembershipOption[]; activeId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  if (memberships.length < 2) return <p className="single-org">{memberships[0]?.organization.name}</p>;

  return (
    <form action={switchOrganizationAction} ref={formRef}>
      <label className="sr-only" htmlFor="membershipId">Organización activa</label>
      <select
        className="org-select"
        defaultValue={activeId}
        id="membershipId"
        name="membershipId"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.id}>{membership.organization.name}</option>
        ))}
      </select>
    </form>
  );
}
