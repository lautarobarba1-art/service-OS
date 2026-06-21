"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { icon: "⌂", label: "Inicio", href: "/dashboard" },
  { icon: "□", label: "Calendario", href: "/dashboard/bookings" },
  { icon: "◇", label: "Clientes", href: "/dashboard/customers" },
  { icon: "◫", label: "Servicios", href: "/dashboard/services" },
  { icon: "♙", label: "Recursos", href: "/dashboard/resources" },
  { icon: "◷", label: "Disponibilidad", href: "/dashboard/availability" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal">
      {navigation.map((item) => {
        const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href ?? "__disabled");
        return item.href ? (
          <Link className={active ? "nav-active" : ""} href={item.href} key={item.label}>
            <span>{item.icon}</span>{item.label}
          </Link>
        ) : (
          <span className="nav-future" key={item.label}><span>{item.icon}</span>{item.label}<small>Próximamente</small></span>
        );
      })}
    </nav>
  );
}
