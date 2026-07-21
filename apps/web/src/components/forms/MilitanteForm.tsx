"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Lista = { id: string; nombre: string }[];
type Duplicado = { nombre: string; cedula: string; telefono: string | null };

export function MilitanteForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
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
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
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

  // RF-15: detectar posibles duplicados mientras se escribe cédula/teléfono.
  useEffect(() => {
    if (form.cedula.length < 5 && form.telefono.length < 6) {
      setDuplicados([]);
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (form.cedula.length >= 5) params.set("cedula", form.cedula);
      if (form.telefono.length >= 6) params.set("telefono", form.telefono);
      apiFetch<Duplicado[]>(`/militantes/duplicados?${params.toString()}`)
        .then(setDuplicados)
        .catch(() => setDuplicados([]));
    }, 400);
    return () => clearTimeout(t);
  }, [form.cedula, form.telefono]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/militantes", {
        method: "POST",
        body: JSON.stringify({ ...form, consentimientoDatos: true }),
      });
      toast("Militante registrado");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el militante");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {duplicados.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold">Posible registro duplicado:</p>
            {duplicados.map((d, i) => (
              <p key={i}>{d.nombre} · cédula {d.cedula} {d.telefono ? `· tel. ${d.telefono}` : ""}</p>
            ))}
          </div>
        </div>
      )}

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

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Registrar militante"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>

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
    </form>
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
