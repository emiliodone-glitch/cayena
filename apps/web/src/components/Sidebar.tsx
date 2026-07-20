"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◧", roles: null },
  { href: "/secretarias", label: "Secretarías", icon: "▤", roles: null },
  { href: "/actividades", label: "Actividades", icon: "▦", roles: null },
  { href: "/obras", label: "Obras", icon: "▲", roles: null },
  { href: "/militantes", label: "Militantes", icon: "◉", roles: null },
  { href: "/gastos", label: "Gastos", icon: "$", roles: null },
  { href: "/poa", label: "POA / Metas", icon: "◔", roles: null },
  { href: "/usuarios", label: "Usuarios", icon: "⚙", roles: ["SUPERADMIN"] },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-60 flex-col bg-institucional-900 text-institucional-50">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-institucional-600 text-lg">
          ✻
        </span>
        <div>
          <div className="text-sm font-bold leading-none">Cayena</div>
          <div className="text-[11px] text-institucional-100/70">Fuerza del Pueblo</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.filter((item) => !item.roles || (user && (item.roles as readonly string[]).includes(user.role))).map(
          (item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-institucional-600 font-semibold text-white"
                    : "text-institucional-100/80 hover:bg-institucional-800",
                )}
              >
                <span className="w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          },
        )}
      </nav>

      <div className="border-t border-institucional-800 px-4 py-4 text-xs">
        <div className="mb-2 truncate font-medium">{user?.nombre}</div>
        <div className="mb-3 text-institucional-100/60">{user?.role}</div>
        <button
          onClick={logout}
          className="w-full rounded-lg bg-institucional-800 py-1.5 text-institucional-50 hover:bg-institucional-700"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
