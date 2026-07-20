"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

type Lista = { id: string; nombre: string }[];

export default function NuevoMilitantePage() {
  const router = useRouter();
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [form, setForm] = useState({
    nombre: "",
    cedula: "",
    telefono: "",
    direccion: "",
    provinciaId: "",
    municipioId: "",
    localidad: "",
    recintoElectoral: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  useEffect(() => {
    if (!form.provinciaId) {
      setMunicipios([]);
      return;
    }
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${form.provinciaId}`).then(setMunicipios);
  }, [form.provinciaId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/militantes", {
        method: "POST",
        body: JSON.stringify({ ...form, consentimientoDatos: true }),
      });
      router.push("/militantes");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el militante");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Registrar militante</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <Field label="Nombre completo">
          <input required className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cédula">
            <input required className="input" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
        </div>
        <Field label="Dirección">
          <input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Provincia">
            <select
              required
              className="input"
              value={form.provinciaId}
              onChange={(e) => setForm({ ...form, provinciaId: e.target.value, municipioId: "" })}
            >
              <option value="">Seleccionar…</option>
              {provincias.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Municipio">
            <select
              required
              className="input"
              value={form.municipioId}
              disabled={!form.provinciaId}
              onChange={(e) => setForm({ ...form, municipioId: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Localidad">
            <input className="input" value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} />
          </Field>
          <Field label="Mesa / recinto electoral">
            <input className="input" value={form.recintoElectoral} onChange={(e) => setForm({ ...form, recintoElectoral: e.target.value })} />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: #1f7a34;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
