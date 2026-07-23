"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { FotoUploader } from "@/components/FotoUploader";
import { UbicacionInput } from "@/components/UbicacionInput";

type Lista = { id: string; nombre: string }[];

const CATEGORIAS = [
  "EDUCACION",
  "SALUD",
  "VIALIDAD",
  "VIVIENDA",
  "DEPORTE",
  "AGUA_SANEAMIENTO",
  "ELECTRICIDAD",
  "SEGURIDAD",
  "OTRA",
];

export type ObraExistente = {
  id: string;
  titulo: string;
  resena: string;
  categoria: string;
  provinciaId: string;
  municipioId: string;
  lat: number;
  lng: number;
  direccion: string | null;
  fechaInauguracion: string | null;
  inversion: string | null;
  beneficiarios: string | null;
  publicada: boolean;
  fotos: string[];
  fotosAntes: string[];
};

function aFechaInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ObraForm({
  obra,
  onSaved,
  onCancel,
}: {
  obra?: ObraExistente;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [form, setForm] = useState({
    titulo: obra?.titulo ?? "",
    resena: obra?.resena ?? "",
    categoria: obra?.categoria ?? "EDUCACION",
    provinciaId: obra?.provinciaId ?? "",
    municipioId: obra?.municipioId ?? "",
    direccion: obra?.direccion ?? "",
    lat: String(obra?.lat ?? "18.4861"),
    lng: String(obra?.lng ?? "-69.9312"),
    fechaInauguracion: aFechaInput(obra?.fechaInauguracion ?? null),
    inversion: obra?.inversion ?? "",
    beneficiarios: obra?.beneficiarios ?? "",
    publicada: obra?.publicada ?? false,
  });
  const [fotos, setFotos] = useState<string[]>(obra?.fotos ?? []);
  const [fotosAntes, setFotosAntes] = useState<string[]>(obra?.fotosAntes ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  useEffect(() => {
    if (!form.provinciaId) return setMunicipios([]);
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${form.provinciaId}`).then(setMunicipios);
  }, [form.provinciaId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        ...form,
        lat: Number(form.lat),
        lng: Number(form.lng),
        inversion: form.inversion ? Number(form.inversion) : undefined,
        fechaInauguracion: form.fechaInauguracion || undefined,
        direccion: form.direccion || undefined,
        beneficiarios: form.beneficiarios || undefined,
        fotos,
        fotosAntes,
      };
      if (obra) {
        await apiFetch(`/obras/${obra.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Obra actualizada");
      } else {
        await apiFetch("/obras", { method: "POST", body: JSON.stringify(body) });
        toast("Obra registrada");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la obra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
        <input required className="input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Reseña breve</span>
        <textarea required className="input" value={form.resena} onChange={(e) => setForm({ ...form, resena: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Categoría</span>
        <select className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c.toLowerCase().replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Provincia</span>
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
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Municipio</span>
          <select
            required
            className="input"
            disabled={!form.provinciaId}
            value={form.municipioId}
            onChange={(e) => setForm({ ...form, municipioId: e.target.value })}
          >
            <option value="">Seleccionar…</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Dirección / punto de referencia</span>
        <UbicacionInput
          value={form.direccion}
          lat={Number(form.lat) || null}
          lng={Number(form.lng) || null}
          onChange={({ ubicacion, lat, lng }) =>
            setForm({ ...form, direccion: ubicacion, lat: lat != null ? String(lat) : form.lat, lng: lng != null ? String(lng) : form.lng })
          }
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Latitud</span>
          <input required className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Longitud</span>
          <input required className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Fecha de inauguración</span>
          <input
            type="date"
            className="input"
            value={form.fechaInauguracion}
            onChange={(e) => setForm({ ...form, fechaInauguracion: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Inversión (RD$)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            placeholder="Sin definir"
            value={form.inversion}
            onChange={(e) => setForm({ ...form, inversion: e.target.value })}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Beneficiarios</span>
        <input
          className="input"
          placeholder="Ej. 500 familias del sector"
          value={form.beneficiarios}
          onChange={(e) => setForm({ ...form, beneficiarios: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Fotos: antes</span>
        <FotoUploader fotos={fotosAntes} onChange={setFotosAntes} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Fotos: después / actual</span>
        <FotoUploader fotos={fotos} onChange={setFotos} />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.publicada}
          onChange={(e) => setForm({ ...form, publicada: e.target.checked })}
        />
        Publicar en la app móvil
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : obra ? "Guardar cambios" : "Registrar obra"}
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
