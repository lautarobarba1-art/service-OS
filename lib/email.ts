import { sendEmail } from "@/lib/email-provider";

const brandFrom = "ServiceOS";

export async function sendWelcomeEmail(email: string, name: string) {
  await sendEmail({
    to: email,
    subject: "Bienvenido a ServiceOS",
    html: emailLayout(
      "Tu operación, en orden.",
      `<p>Hola ${escapeHtml(name)},</p><p>Tu cuenta de ServiceOS ya está lista. El próximo paso es crear tu organización y configurar su zona horaria.</p>`,
    ),
    text: `Hola ${name},\n\nTu cuenta de ServiceOS ya está lista. El próximo paso es crear tu organización y configurar su zona horaria.`,
  });
}

export async function sendBookingNotification(input: {
  kind: "created" | "cancelled";
  email: string;
  customerName: string;
  serviceName: string;
  organizationName: string;
  localDateTime: string;
}) {
  const cancelled = input.kind === "cancelled";
  await sendEmail({
    to: input.email,
    subject: cancelled ? `Reserva cancelada · ${input.organizationName}` : `Reserva recibida · ${input.organizationName}`,
    html: emailLayout(
      cancelled ? "Tu reserva fue cancelada" : "Recibimos tu reserva",
      `<p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p>`,
    ),
    text: `${cancelled ? "Tu reserva fue cancelada" : "Recibimos tu reserva"}\n\n${input.serviceName}\n${input.localDateTime}\n${input.organizationName}`,
  });
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
  const confirmed = input.status === "CONFIRMED";
  const manageLink = input.manageUrl
    ? `<p><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#274d35;color:#fff;text-decoration:none">Ver mi reserva</a></p>`
    : "";

  await sendEmail({
    to: input.email,
    subject: `${confirmed ? "Reserva confirmada" : "Solicitud recibida"} · ${input.organizationName}`,
    html: emailLayout(
      confirmed ? "Tu reserva está confirmada" : "Recibimos tu solicitud",
      `<p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p><p>Referencia: <strong>${escapeHtml(input.referenceCode)}</strong></p>${manageLink}`,
    ),
    text: `${confirmed ? "Tu reserva está confirmada" : "Recibimos tu solicitud"}\n\n${input.serviceName}\n${input.localDateTime}\n${input.organizationName}\nReferencia: ${input.referenceCode}${input.manageUrl ? `\n${input.manageUrl}` : ""}`,
  });
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
  const cancelled = input.kind === "cancelled";
  const manageLink = !cancelled && input.manageUrl
    ? `<p><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#274d35;color:#fff;text-decoration:none">Ver reserva actualizada</a></p>`
    : "";

  await sendEmail({
    to: input.email,
    subject: `${cancelled ? "Reserva cancelada" : "Reserva reprogramada"} · ${input.organizationName}`,
    html: emailLayout(
      cancelled ? "Tu reserva fue cancelada" : "Tu reserva fue reprogramada",
      `<p>Hola ${escapeHtml(input.customerName)},</p><p><strong>${escapeHtml(input.serviceName)}</strong><br>${escapeHtml(input.localDateTime)}<br>${escapeHtml(input.organizationName)}</p><p>Referencia: <strong>${escapeHtml(input.referenceCode)}</strong></p>${manageLink}`,
    ),
    text: `${cancelled ? "Tu reserva fue cancelada" : "Tu reserva fue reprogramada"}\n\n${input.serviceName}\n${input.localDateTime}\n${input.organizationName}\nReferencia: ${input.referenceCode}${!cancelled && input.manageUrl ? `\n${input.manageUrl}` : ""}`,
  });
}

function emailLayout(title: string, body: string) {
  return `<div style="font-family:Arial,sans-serif;color:#172019;line-height:1.5"><p style="margin:0 0 16px;color:#2f6b4d;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${brandFrom}</p><h1 style="margin:0 0 18px;color:#172019;font-size:24px">${escapeHtml(title)}</h1>${body}</div>`;
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
