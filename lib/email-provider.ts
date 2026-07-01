import nodemailer from "nodemailer";

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

function booleanEnv(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

function getSmtpPort() {
  const parsed = Number(process.env.SMTP_PORT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function getEmailFrom() {
  return process.env.EMAIL_FROM?.trim();
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && getEmailFrom());
}

export function emailDeliveryConfigured() {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "smtp";
  return provider === "smtp" && smtpConfigured();
}

export async function sendEmail(payload: EmailPayload) {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "smtp";

  if (provider !== "smtp") {
    console.warn(`EMAIL_PROVIDER=${provider} no está soportado; se omitió el email.`);
    return;
  }

  const from = getEmailFrom();
  if (!smtpConfigured() || !from) {
    console.warn("SMTP no está configurado; se omitió el email.");
    return;
  }

  const port = getSmtpPort();
  const secure = process.env.SMTP_SECURE ? booleanEnv(process.env.SMTP_SECURE) : port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    replyTo: payload.replyTo,
  });
}
