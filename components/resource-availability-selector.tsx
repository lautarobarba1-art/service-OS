"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";

export function ResourceAvailabilitySelector({ resources, selectedId }: { resources: Array<{ id: string; name: string }>; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="availability-selector">
      Recurso
      <select
        onChange={(event) => startTransition(() => router.push(`${pathname}?resource=${encodeURIComponent(event.target.value)}`))}
        value={selectedId}
      >
        {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
      </select>
    </label>
  );
}
