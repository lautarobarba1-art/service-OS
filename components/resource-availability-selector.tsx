"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";

import { resourceDisplayName, type ResourceType } from "@/lib/resource-labels";

export function ResourceAvailabilitySelector({ resources, selectedId }: { resources: Array<{ id: string; name: string; type: ResourceType }>; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="availability-selector">
      Recurso
      <select
        onChange={(event) => startTransition(() => router.push(`${pathname}?resource=${encodeURIComponent(event.target.value)}`))}
        value={selectedId}
      >
        {resources.map((resource) => <option key={resource.id} value={resource.id}>{resourceDisplayName(resource)}</option>)}
      </select>
    </label>
  );
}
