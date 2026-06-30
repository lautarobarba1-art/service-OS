"use client";

import Link from "next/link";
import { useState } from "react";

type ChecklistItem = {
  label: string;
  detail: string;
  complete: boolean;
};

export function PublicBookingSharePanel({
  publicUrl,
  publicPath,
  enabled,
  checklist,
}: {
  publicUrl: string;
  publicPath: string;
  enabled: boolean;
  checklist: ChecklistItem[];
}) {
  const [copied, setCopied] = useState(false);
  const ready = checklist.every((item) => item.complete);

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="public-booking-share-panel">
      <div className="public-booking-link-card">
        <div>
          <p className="eyebrow">LINK PÚBLICO</p>
          <h2>Compartí tu página de reserva</h2>
          <p>Este es el enlace que podés enviar por WhatsApp, Instagram, email o pegar en tu sitio web.</p>
        </div>
        <span className={enabled && ready ? "active-pill" : "inactive-pill"}>{enabled && ready ? "Listo para compartir" : "Revisar configuración"}</span>
        <div className="public-booking-url-box">
          <code>{publicUrl}</code>
          <div>
            <button className="button-primary" onClick={copyPublicUrl} type="button">{copied ? "Copiado" : "Copiar link"}</button>
            <Link className="button-secondary" href={publicPath} target="_blank">Abrir</Link>
          </div>
        </div>
      </div>
      <div className="public-booking-checklist">
        <div>
          <p className="eyebrow">DIAGNÓSTICO</p>
          <h2>Checklist de auto-reserva</h2>
        </div>
        <ul>
          {checklist.map((item) => (
            <li className={item.complete ? "complete" : "pending"} key={item.label}>
              <span aria-hidden="true">{item.complete ? "✓" : "!"}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
