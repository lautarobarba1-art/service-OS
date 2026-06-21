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

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );
}
