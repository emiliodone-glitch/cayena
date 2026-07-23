"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { apiFetch, API_URL, getAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const MapaDiaElectoral = dynamic(() => import("@/components/MapaDiaElectoral").then((m) => m.MapaDiaElectoral), {
  ssr: false,
  loading: () => <div className="aspect-[1000/850] w-full animate-pulse rounded-xl bg-slate-800" />,
});

type Evento = { id: string; nombre: string; fecha: string; activo: boolean };
type Resumen = {
  evento: Evento;
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  electoresNacional: number;
  porcentajePadron: number | null;
  proyeccionFinal: number | null;
};

const fmtNum = new Intl.NumberFormat("es-DO");

// Modo "sala de situación" (RF nuevo): pantalla completa sin sidebar, texto
// grande, pensada para proyectar en TV el día de la jornada — vive fuera del
// grupo (dashboard) a propósito, para no heredar el sidebar/header del back
// office normal. Repite su propio chequeo de sesión (el layout de
// (dashboard) no aplica acá) porque igual es data sensible, no pública.
export default function SalaDeSituacionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [eventoId, setEventoId] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [refreshTicker, setRefreshTicker] = useState(0);
  const [horaActualizado, setHoraActualizado] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    apiFetch<Evento | null>("/dia-electoral/activo").then((activo) => {
      if (activo) setEventoId(activo.id);
    });
  }, []);

  useEffect(() => {
    if (!eventoId) return;
    apiFetch<Resumen>(`/dia-electoral/resumen/${eventoId}`).then((r) => {
      setResumen(r);
      setHoraActualizado(new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" }));
    });
  }, [eventoId, refreshTicker]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const fuente = new EventSource(`${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`);
    fuente.addEventListener("cambio-votos", () => setRefreshTicker((t) => t + 1));
    return () => fuente.close();
  }, []);

  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">Cargando…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">{resumen?.evento.nombre ?? "Día Electoral"}</h1>
          {resumen && (
            <p className="mt-1 text-sm text-slate-400">
              {new Date(resumen.evento.fecha).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}
              {horaActualizado && ` · actualizado ${horaActualizado}`}
            </p>
          )}
        </div>
        <Link href="/dia-electoral" className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">
          <X className="h-4 w-4" /> Salir de pantalla completa
        </Link>
      </div>

      {!eventoId ? (
        <p className="text-slate-400">No hay ninguna jornada electoral activa.</p>
      ) : (
        <>
          {resumen && (
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              <KpiGrande label="Militantes registrados" value={fmtNum.format(resumen.militantesRegistrados)} />
              <KpiGrande label="Votos confirmados" value={fmtNum.format(resumen.votosConfirmados)} destacado />
              <KpiGrande label="% de la propia base" value={`${resumen.porcentajePropia}%`} />
              <KpiGrande label="% del padrón electoral" value={resumen.porcentajePadron != null ? `${resumen.porcentajePadron}%` : "—"} />
              {resumen.proyeccionFinal != null && <KpiGrande label="Proyección al cierre" value={`${resumen.proyeccionFinal}%`} />}
            </div>
          )}

          <div className="rounded-2xl bg-white p-4 text-gray-900 shadow-2xl md:p-6">
            <MapaDiaElectoral eventoId={eventoId} aspecto="aspect-[1000/700]" />
          </div>
        </>
      )}
    </div>
  );
}

function KpiGrande({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${destacado ? "border-institucional-600 bg-institucional-900/40" : "border-slate-800 bg-slate-900"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-4xl font-bold md:text-5xl ${destacado ? "text-institucional-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
