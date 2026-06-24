import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicBookingFlow } from "@/components/public-booking-flow";
import { getPublishedServicesBySlug } from "@/lib/public-booking-data";
import { utcToLocalDateKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar · ServiceOS",
  robots: { index: false, follow: false },
};

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublishedServicesBySlug(slug);
  if (!data) notFound();

  return (
    <main className="public-portal">
      <header className="public-portal-header">
        <span className="brand-mark">S</span>
        <div><p className="eyebrow">RESERVA ONLINE</p><h1>{data.organizationName}</h1><p>Elegí el servicio y encontrá un horario disponible.</p></div>
      </header>
      <PublicBookingFlow
        idempotencyKey={randomUUID()}
        minimumLocalDate={utcToLocalDateKey(new Date(), data.timezone)}
        services={data.services}
        slug={slug}
      />
      <footer>Gestionado con ServiceOS · Horarios expresados en {data.timezone}</footer>
    </main>
  );
}
