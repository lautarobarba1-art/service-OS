import { registerAction } from "@/app/auth/actions";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <section className="brand-panel">
        <span className="brand-mark">S</span>
        <div>
          <p className="eyebrow">SERVICEOS</p>
          <h1>Menos caos.<br />Más servicio.</h1>
          <p>Armá la base operativa de tu negocio en pocos minutos.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">EMPEZÁ AHORA</p>
          <h2>Creá tu cuenta</h2>
          <p className="muted">Después configuraremos tu primera organización.</p>
          <AuthForm action={registerAction} mode="register" />
        </div>
      </section>
    </main>
  );
}
