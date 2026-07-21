"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Send, AlertTriangle, Landmark, CalendarDays, Megaphone } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { TableSkeleton } from "@/components/Skeleton";

type Notificacion = {
  id: string;
  titulo: string;
  cuerpo: string;
  tipo: string;
  enviadaAt: string;
  destinatarios: number;
};

const ICONO: Record<string, typeof AlertTriangle> = {
  ALERTA_META: AlertTriangle,
  OBRA: Landmark,
  ACTIVIDAD: CalendarDays,
  CONVOCATORIA: Megaphone,
};

const ETIQUETA: Record<string, string> = {
  ALERTA_META: "Alerta de meta",
  OBRA: "Obra",
  ACTIVIDAD: "Actividad",
  CONVOCATORIA: "Convocatoria",
};

export default function ConvocatoriasPage() {
  const toast = useToast();
  const [historial, setHistorial] = useState<Notificacion[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    apiFetch<Notificacion[]>("/notificaciones").then(setHistorial).catch(() => setHistorial([]));
  }

  useEffect(cargar, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch("/notificaciones", { method: "POST", body: JSON.stringify({ titulo, cuerpo }) });
      toast("Convocatoria enviada a todos los dispositivos registrados");
      setTitulo("");
      setCuerpo("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar la convocatoria");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-institucional-900">Convocatorias</h1>
      <p className="mb-6 text-sm text-gray-500">
        Envía un anuncio push a todos los militantes con la app instalada. Las obras y actividades
        publicadas ya notifican automáticamente — usa esto solo para avisos que no encajan en esos módulos.
      </p>

      <form onSubmit={enviar} className="mb-8 max-w-lg space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">Nueva convocatoria</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
          <input
            required
            maxLength={80}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Mensaje</span>
          <textarea
            required
            maxLength={200}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={enviando}
          className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" /> {enviando ? "Enviando…" : "Enviar a todos"}
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Historial de notificaciones enviadas</h2>
      {historial === null ? (
        <TableSkeleton cols={5} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Mensaje</th>
                <th className="px-4 py-2">Destinatarios</th>
                <th className="px-4 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historial.map((n) => {
                const Icon = ICONO[n.tipo] ?? Megaphone;
                return (
                  <tr key={n.id}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                        <Icon className="h-3.5 w-3.5" /> {ETIQUETA[n.tipo] ?? n.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{n.titulo}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-gray-500">{n.cuerpo}</td>
                    <td className="px-4 py-2">{n.destinatarios}</td>
                    <td className="px-4 py-2 text-gray-400">{new Date(n.enviadaAt).toLocaleString("es-DO")}</td>
                  </tr>
                );
              })}
              {historial.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Sin notificaciones enviadas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
