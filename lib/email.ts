import { Resend } from "resend";

export async function sendWelcomeEmail(email: string, name: string) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY no está configurada; se omitió el email de bienvenida.");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "ServiceOS <onboarding@resend.dev>",
    to: email,
    subject: "Bienvenido a ServiceOS",
    html: `<div style="font-family:Arial,sans-serif;color:#172019"><h1>Tu operación, en orden.</h1><p>Hola ${escapeHtml(name)},</p><p>Tu cuenta de ServiceOS ya está lista. El próximo paso es crear tu organización y configurar su zona horaria.</p></div>`,
  });

  if (error) throw new Error(error.message);
}

export async function sendBookingNotification(input: {
  kind: "created" | "cancelled";
  email: string;
  customerName: string;
  serviceName: string;
  organizationName: string;
  localDateTime: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no está configurada; se omitió el email de reserva.");
    return;
  }
  const cancelled = input.kind === "cancelled";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "ServiceOS <onboarding@resend.dev>",
    to: input.email,
    subject: cancelled ? `Reserva cancelada · ${input.organizationName}` : `Reserva recibida · ${input.organizationName}`,
    html: `<div style="font-family:Arial,sans-serif;color:#172019"><h1>${cancelled ? "Tu reserva fue cancelada" : "Recibimos tu reserva"}</h1><p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p></div>`,
  });
  if (error) throw new Error(error.message);
}

export async function sendPublicBookingNotification(input: {
  email: string;
  customerName: string;
  serviceName: string;
  organizationName: string;
  localDateTime: string;
  referenceCode: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  manageUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no está configurada; se omitió el email de reserva pública.");
    return;
  }
  const confirmed = input.status === "CONFIRMED";
  const manageLink = input.manageUrl
    ? `<p><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#274d35;color:#fff;text-decoration:none">Ver mi reserva</a></p>`
    : "";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "ServiceOS <onboarding@resend.dev>",
    to: input.email,
    subject: `${confirmed ? "Reserva confirmada" : "Solicitud recibida"} · ${input.organizationName}`,
    html: `<div style="font-family:Arial,sans-serif;color:#172019"><h1>${confirmed ? "Tu reserva está confirmada" : "Recibimos tu solicitud"}</h1><p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p><p>Referencia: <strong>${escapeHtml(input.referenceCode)}</strong></p>${manageLink}</div>`,
  });
  if (error) throw new Error(error.message);
}

export async function sendPublicBookingManagementNotification(input: {
  kind: "cancelled" | "rescheduled";
  email: string;
  customerName: string;
  serviceName: string;
  organizationName: string;
  localDateTime: string;
  referenceCode: string;
  manageUrl?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY no está configurada; se omitió el email de gestión pública.");
    return;
  }
  const cancelled = input.kind === "cancelled";
  const manageLink = !cancelled && input.manageUrl
    ? `<p><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#274d35;color:#fff;text-decoration:none">Ver reserva actualizada</a></p>`
    : "";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "ServiceOS <onboarding@resend.dev>",
    to: input.email,
    subject: `${cancelled ? "Reserva cancelada" : "Reserva reprogramada"} · ${input.organizationName}`,
    html: `<div style="font-family:Arial,sans-serif;color:#172019"><h1>${cancelled ? "Tu reserva fue cancelada" : "Tu reserva fue reprogramada"}</h1><p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p><p>Referencia: <strong>${escapeHtml(input.referenceCode)}</strong></p>${manageLink}</div>`,
  });
  if (error) throw new Error(error.message);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );
}
