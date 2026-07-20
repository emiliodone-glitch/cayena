"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type MetaPoa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  indicadorObjetivo: number;
  fechaLimite: string;
  totalAvance: number;
  porcentaje: number;
  secretaria: { nombre: string };
};

type Secretaria = { id: string; nombre: string };

export default function PoaPage() {
  const { user } = useAuth();
  const [metas, setMetas] = useState<MetaPoa[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [form, setForm] = useState({ secretariaId: "", nombre: "", descripcion: "", indicadorObjetivo: "", fechaLimite: "" });
  const [avance, setAvance] = useState<Record<string, string>>({});

  function cargar() {
    apiFetch<MetaPoa[]>("/poa").then(setMetas);
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  async function crearMeta(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/poa", {
      method: "POST",
      body: JSON.stringify({ ...form, indicadorObjetivo: Number(form.indicadorObjetivo) }),
    });
    setForm({ secretariaId: "", nombre: "", descripcion: "", indicadorObjetivo: "", fechaLimite: "" });
    cargar();
  }

  async function registrarAvance(id: string) {
    const valor = Number(avance[id] ?? 0);
    if (!valor) return;
    await apiFetch(`/poa/${id}/avances`, { method: "POST", body: JSON.stringify({ valor }) });
    setAvance({ ...avance, [id]: "" });
    cargar();
  }

  const chartData = metas.map((m) => ({
    nombre: m.nombre.length > 18 ? `${m.nombre.slice(0, 18)}…` : m.nombre,
    logrado: m.totalAvance,
    objetivo: m.indicadorObjetivo,
  }));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">POA — Plan Operativo Anual</h1>

      {chartData.length > 0 && (
        <div className="mb-8 h-72 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nombre" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="objetivo" fill="#d6f5dd" name="Objetivo" />
              <Bar dataKey="logrado" fill="#1f7a34" name="Logrado" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metas.map((m) => (
          <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase text-gray-400">{m.secretaria.nombre}</div>
            <div className="mt-1 font-semibold text-institucional-900">{m.nombre}</div>
            <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-institucional-600"
                style={{ width: `${Math.min(100, m.porcentaje)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {m.totalAvance} / {m.indicadorObjetivo} ({m.porcentaje}%)
            </div>
            {user?.role !== "AUDITOR" && (
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  placeholder="Avance"
                  value={avance[m.id] ?? ""}
                  onChange={(e) => setAvance({ ...avance, [m.id]: e.target.value })}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => registrarAvance(m.id)}
                  className="rounded-lg bg-institucional-600 px-3 py-1 text-xs font-semibold text-white hover:bg-institucional-700"
                >
                  Registrar
                </button>
              </div>
            )}
          </div>
        ))}
        {metas.length === 0 && <p className="text-gray-400">Sin metas registradas.</p>}
      </div>

      {user?.role !== "AUDITOR" && (
        <form onSubmit={crearMeta} className="mt-8 max-w-lg space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Nueva meta POA</h2>
          <select
            required
            value={form.secretariaId}
            onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Secretaría…</option>
            {secretarias.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <input
            required
            placeholder="Nombre de la meta"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
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
              type="number"
              placeholder="Indicador objetivo"
              value={form.indicadorObjetivo}
              onChange={(e) => setForm({ ...form, indicadorObjetivo: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="date"
              value={form.fechaLimite}
              onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700">
            Crear meta
          </button>
        </form>
      )}
    </div>
  );
}
