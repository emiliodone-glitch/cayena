"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Landmark,
  MapPinned,
  Trophy,
  Wallet,
  PieChart,
  Users,
  ClipboardList,
  Megaphone,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: null },
  { href: "/secretarias", label: "Secretarías", icon: Building2, roles: null },
  { href: "/actividades", label: "Actividades", icon: CalendarDays, roles: null },
  { href: "/obras", label: "Obras", icon: Landmark, roles: null },
  { href: "/militantes", label: "Militantes", icon: MapPinned, roles: null },
  { href: "/ranking", label: "Ranking", icon: Trophy, roles: ["SUPERADMIN", "JEFE_SECRETARIA", "AUDITOR"] },
  { href: "/gastos", label: "Gastos", icon: Wallet, roles: null },
  { href: "/poa", label: "POA / Metas", icon: PieChart, roles: null },
  { href: "/encuestas", label: "Encuestas", icon: ClipboardList, roles: ["SUPERADMIN", "JEFE_SECRETARIA"] },
  { href: "/convocatorias", label: "Convocatorias", icon: Megaphone, roles: ["SUPERADMIN", "JEFE_SECRETARIA"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["SUPERADMIN"] },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [pendientes, setPendientes] = useState(0);

  // Cuántas secretarías tienen algo pendiente ahora mismo (informe atrasado
  // o sin actividad reciente) — mismo criterio que ya usan las alertas
  // automáticas, así el número del sidebar nunca contradice lo que se le
  // avisó a cada titular. Solo le interesa al SUPERADMIN (es quien gestiona
  // el organigrama completo, no una sola secretaría).
  useEffect(() => {
    if (user?.role !== "SUPERADMIN") return;
    apiFetch<{ pendientes: number }>("/secretarias/pendientes-count")
      .then((r) => setPendientes(r.pendientes))
      .catch(() => setPendientes(0));
  }, [user]);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-60 flex-shrink-0 flex-col bg-institucional-900 text-institucional-50 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-institucional-600 text-lg">
              ✻
            </span>
            <div>
              <div className="text-sm font-bold leading-none">Cayena</div>
              <div className="text-[11px] text-institucional-100/70">Fuerza del Pueblo</div>
            </div>
          </div>
          <button onClick={onClose} className="text-institucional-100/70 hover:text-white md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.filter((item) => !item.roles || (user && (item.roles as readonly string[]).includes(user.role))).map(
            (item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-institucional-600 font-semibold text-white"
                      : "text-institucional-100/80 hover:bg-institucional-800",
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                  {item.href === "/secretarias" && pendientes > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {pendientes > 9 ? "9+" : pendientes}
                    </span>
                  )}
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-institucional-800 py-1.5 text-institucional-50 hover:bg-institucional-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
