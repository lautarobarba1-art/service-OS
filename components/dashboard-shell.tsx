import Link from "next/link";

import { logoutAction } from "@/app/auth/actions";
import { OrganizationSwitcher } from "@/components/organization-switcher";

type ShellProps = {
  children: React.ReactNode;
  userName: string;
  memberships: Array<{ id: string; organization: { name: string } }>;
  activeId: string;
};

const navigation = [
  ["⌂", "Inicio"],
  ["□", "Calendario"],
  ["◇", "Clientes"],
  ["◫", "Servicios"],
  ["♙", "Recursos"],
  ["◷", "Disponibilidad"],
];

export function DashboardShell({ children, userName, memberships, activeId }: ShellProps) {
  return (
    <div className="dashboard-grid">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/dashboard"><span>S</span>ServiceOS</Link>
        <OrganizationSwitcher activeId={activeId} memberships={memberships} />
        <nav aria-label="Navegación principal">
          {navigation.map(([icon, label], index) => (
            <Link aria-disabled={index > 0} className={index === 0 ? "nav-active" : "nav-future"} href={index === 0 ? "/dashboard" : "#"} key={label}>
              <span>{icon}</span>{label}{index > 0 ? <small>Próximamente</small> : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{userName.slice(0, 1).toUpperCase()}</div>
          <div><strong>{userName}</strong><span>Cuenta</span></div>
          <form action={logoutAction}><button aria-label="Cerrar sesión" title="Cerrar sesión">↪</button></form>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="topbar"><p>Panel operativo</p><span className="status-dot">Sistema listo</span></header>
        <main>{children}</main>
      </div>
    </div>
  );
}
