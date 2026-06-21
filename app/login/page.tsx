import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="auth-page">
      <section className="brand-panel">
        <span className="brand-mark">S</span>
        <div>
          <p className="eyebrow">SERVICEOS</p>
          <h1>Todo tu negocio,<br />en un solo ritmo.</h1>
          <p>Reservas, equipo y operación sin el ruido de las planillas.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">BIENVENIDO</p>
          <h2>Volvé a tu operación</h2>
          <p className="muted">Ingresá con las credenciales de tu cuenta.</p>
          {params.error ? <p className="form-error">El enlace no es válido o ya venció.</p> : null}
          <AuthForm action={loginAction} mode="login" nextPath={params.next} />
        </div>
      </section>
    </main>
  );
}
