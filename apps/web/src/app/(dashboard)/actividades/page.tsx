"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FotoUploader } from "@/components/FotoUploader";

type Actividad = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ubicacion: string | null;
  publicadaApp: boolean;
  secretaria: { nombre: string };
  secretariaId: string;
};

type Secretaria = { id: string; nombre: string };

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ActividadesPage() {
  const { user } = useAuth();
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [mesActual, setMesActual] = useState(() => new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha: "", ubicacion: "", secretariaId: "" });
  const [fotos, setFotos] = useState<string[]>([]);

  function cargar() {
    apiFetch<Actividad[]>("/actividades").then(setActividades);
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  const diasDelMes = useMemo(() => {
    const year = mesActual.getFullYear();
    const month = mesActual.getMonth();
    const primerDia = new Date(year, month, 1);
    const inicioOffset = primerDia.getDay();
    const dias: (Date | null)[] = Array(inicioOffset).fill(null);
    const totalDias = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= totalDias; d++) dias.push(new Date(year, month, d));
    return dias;
  }, [mesActual]);

  const actividadesVisibles = diaSeleccionado
    ? actividades.filter((a) => sameDay(new Date(a.fecha), diaSeleccionado))
    : actividades;

  async function crear(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/actividades", {
      method: "POST",
      body: JSON.stringify({ ...form, fotos, publicadaApp: false }),
    });
    setForm({ titulo: "", descripcion: "", fecha: "", ubicacion: "", secretariaId: "" });
    setFotos([]);
    cargar();
  }

  async function togglePublicar(a: Actividad) {
    await apiFetch(`/actividades/${a.id}/publicar`, {
      method: "PATCH",
      body: JSON.stringify({ publicadaApp: !a.publicadaApp }),
    });
    cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Actividades</h1>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          <button
            onClick={() => setVista("lista")}
            className={`rounded-md px-3 py-1 ${vista === "lista" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
          >
            Lista
          </button>
          <button
            onClick={() => setVista("calendario")}
            className={`rounded-md px-3 py-1 ${vista === "calendario" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
          >
            Calendario
          </button>
        </div>
      </div>

      {vista === "calendario" && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}>‹</button>
            <span>{mesActual.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}</span>
            <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {diasDelMes.map((d, i) => {
              const tieneActividad = d && actividades.some((a) => sameDay(new Date(a.fecha), d));
              const seleccionado = d && diaSeleccionado && sameDay(d, diaSeleccionado);
              return (
                <button
                  key={i}
                  disabled={!d}
                  onClick={() => d && setDiaSeleccionado(seleccionado ? null : d)}
                  className={`h-14 rounded-lg border text-sm ${
                    !d
                      ? "border-transparent"
                      : seleccionado
                        ? "border-institucional-600 bg-institucional-600 text-white"
                        : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  {d?.getDate()}
                  {tieneActividad && !seleccionado && (
                    <div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-institucional-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Ubicación</th>
              <th className="px-4 py-2">Secretaría</th>
              <th className="px-4 py-2">Publicada en app</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {actividadesVisibles.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 font-medium">{a.titulo}</td>
                <td className="px-4 py-2">{new Date(a.fecha).toLocaleString("es-DO")}</td>
                <td className="px-4 py-2">{a.ubicacion ?? "—"}</td>
                <td className="px-4 py-2">{a.secretaria.nombre}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => togglePublicar(a)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      a.publicadaApp ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.publicadaApp ? "Publicada" : "No publicada"}
                  </button>
                </td>
              </tr>
            ))}
            {actividadesVisibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Sin actividades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {user?.role !== "AUDITOR" && (
        <form onSubmit={crear} className="mt-8 max-w-xl space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Nueva actividad</h2>
          <input
            required
            placeholder="Título"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="datetime-local"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Ubicación"
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <select
            required
            value={form.secretariaId}
            onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Secretaría responsable…</option>
            {secretarias.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <FotoUploader fotos={fotos} onChange={setFotos} />
          <button className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700">
            Crear actividad
          </button>
        </form>
      )}
    </div>
  );
}
