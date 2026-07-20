"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Gasto = {
  id: string;
  tipo: "INGRESO" | "GASTO";
  monto: string;
  categoria: string;
  fecha: string;
  secretaria: { nombre: string } | null;
};

type Secretaria = { id: string; nombre: string };

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" });

export default function GastosPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{ gastos: Gasto[]; totales: { ingresos: number; gastos: number } }>({
    gastos: [],
    totales: { ingresos: 0, gastos: 0 },
  });
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [form, setForm] = useState({
    tipo: "GASTO",
    monto: "",
    categoria: "",
    fecha: "",
    secretariaId: "",
  });

  function cargar() {
    apiFetch<typeof data>("/gastos").then(setData);
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/gastos", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        monto: Number(form.monto),
        secretariaId: form.secretariaId || undefined,
      }),
    });
    setForm({ tipo: "GASTO", monto: "", categoria: "", fecha: "", secretariaId: "" });
    cargar();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Finanzas</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-institucional-700">{fmtMoney.format(data.totales.ingresos)}</div>
          <div className="mt-1 text-sm text-gray-500">Ingresos</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-red-600">{fmtMoney.format(data.totales.gastos)}</div>
          <div className="mt-1 text-sm text-gray-500">Gastos</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold text-institucional-900">
            {fmtMoney.format(data.totales.ingresos - data.totales.gastos)}
          </div>
          <div className="mt-1 text-sm text-gray-500">Balance</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Monto</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Secretaría</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.gastos.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-2">
                  <span className={g.tipo === "INGRESO" ? "text-institucional-700" : "text-red-600"}>{g.tipo}</span>
                </td>
                <td className="px-4 py-2">{g.categoria}</td>
                <td className="px-4 py-2">{fmtMoney.format(Number(g.monto))}</td>
                <td className="px-4 py-2">{new Date(g.fecha).toLocaleDateString("es-DO")}</td>
                <td className="px-4 py-2">{g.secretaria?.nombre ?? "General"}</td>
              </tr>
            ))}
            {data.gastos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin movimientos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {user?.role !== "AUDITOR" && (
        <form onSubmit={crear} className="mt-8 max-w-lg space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Nuevo movimiento</h2>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="GASTO">Gasto</option>
              <option value="INGRESO">Ingreso</option>
            </select>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Monto"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            required
            placeholder="Categoría"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={form.secretariaId}
              onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">General (sin secretaría)</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          <button className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700">
            Registrar
          </button>
        </form>
      )}
    </div>
  );
}
