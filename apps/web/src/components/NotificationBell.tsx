"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, Landmark, CalendarDays, Megaphone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Notificacion = {
  id: string;
  titulo: string;
  cuerpo: string;
  tipo: string;
  enviadaAt: string;
};

const ICONO: Record<string, typeof AlertTriangle> = {
  ALERTA_META: AlertTriangle,
  OBRA: Landmark,
  ACTIVIDAD: CalendarDays,
  CONVOCATORIA: Megaphone,
};

function tiempoRelativo(fecha: string) {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export function NotificationBell() {
  const { user } = useAuth();
  // PROMOTOR/DIRIGENCIA se suman porque un coordinador de zona con
  // territorio asignado puede recibir alertas de estancamiento dirigidas
  // específicamente a él (ver GET /notificaciones, que ya filtra qué le
  // corresponde ver a cada quien).
  const puedeVer =
    user?.role === "SUPERADMIN" ||
    user?.role === "JEFE_SECRETARIA" ||
    user?.role === "PROMOTOR" ||
    user?.role === "DIRIGENCIA";
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!puedeVer) return;
    apiFetch<Notificacion[]>("/notificaciones").then(setNotificaciones).catch(() => setNotificaciones([]));
  }, [puedeVer]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  if (!puedeVer) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
      >
        <Bell className="h-5 w-5" />
        {notificaciones.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {notificaciones.length > 9 ? "9+" : notificaciones.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-institucional-900">
            Notificaciones
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.map((n) => {
              const Icon = ICONO[n.tipo] ?? Bell;
              return (
                <div key={n.id} className="flex gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
                  <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-institucional-600" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">{n.titulo}</div>
                    <div className="truncate text-xs text-gray-500">{n.cuerpo}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{tiempoRelativo(n.enviadaAt)}</div>
                  </div>
                </div>
              );
            })}
            {notificaciones.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Sin notificaciones por ahora.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
