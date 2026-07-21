"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { FeatureCollection } from "geojson";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Fila = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
};

type Lista = { id: string; nombre: string }[];

function extraerFilas(geo: FeatureCollection): Fila[] {
  return geo.features.map((f) => {
    const p = f.properties as Fila;
    return {
      id: p.id,
      nombre: p.nombre,
      militantesCaptados: p.militantesCaptados,
      meta: p.meta,
      porcentaje: p.porcentaje,
      estado: p.estado,
    };
  });
}

function FilaMeta({
  fila,
  onGuardado,
  tipo,
}: {
  fila: Fila;
  onGuardado: () => void;
  tipo: "provinciaId" | "municipioId";
}) {
  const toast = useToast();
  const [valor, setValor] = useState(String(fila.meta));
  const [guardando, setGuardando] = useState(false);
  const cambiado = Number(valor) !== fila.meta;

  async function guardar() {
    setGuardando(true);
    try {
      await apiFetch("/militantes/metas", {
        method: "POST",
        body: JSON.stringify({ [tipo]: fila.id, meta: Number(valor) }),
      });
      toast(`Meta de ${fila.nombre} actualizada a ${valor}`);
      onGuardado();
    } catch {
      toast("No se pudo actualizar la meta", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr>
      <td className="px-4 py-2 font-medium">{fila.nombre}</td>
      <td className="px-4 py-2">{fila.militantesCaptados.toLocaleString("es-DO")}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2 font-semibold" style={{ color: COLOR_ESTADO[fila.estado] }}>
        {fila.porcentaje}%
      </td>
      <td className="px-4 py-2 text-right">
        {cambiado && (
          <button
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-1 rounded-lg bg-institucional-600 px-3 py-1 text-xs font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
          >
            <Check className="h-3 w-3" /> {guardando ? "Guardando…" : "Guardar"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function MetasEditor() {
  const [provincias, setProvincias] = useState<Fila[] | null>(null);
  const [provinciaSeleccionada, setProvinciaSeleccionada] = useState("");
  const [listaProvincias, setListaProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Fila[] | null>(null);

  function cargarProvincias() {
    apiFetch<FeatureCollection>("/geo/provincias").then((geo) => setProvincias(extraerFilas(geo)));
  }

  useEffect(() => {
    cargarProvincias();
    apiFetch<Lista>("/geo/lista/provincias").then(setListaProvincias);
  }, []);

  function cargarMunicipios(provinciaId: string) {
    if (!provinciaId) {
      setMunicipios(null);
      return;
    }
    apiFetch<FeatureCollection>(`/geo/provincias/${provinciaId}/municipios`).then((geo) =>
      setMunicipios(extraerFilas(geo)),
    );
  }

  useEffect(() => {
    cargarMunicipios(provinciaSeleccionada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinciaSeleccionada]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Metas por provincia</h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Provincia</th>
                <th className="px-4 py-2">Captados</th>
                <th className="px-4 py-2">Meta</th>
                <th className="px-4 py-2">Avance</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {provincias?.map((f) => (
                <FilaMeta key={f.id} fila={f} onGuardado={cargarProvincias} tipo="provinciaId" />
              ))}
              {!provincias && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Cargando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Metas por municipio</h2>
          <select
            value={provinciaSeleccionada}
            onChange={(e) => setProvinciaSeleccionada(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona una provincia…</option>
            {listaProvincias.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        {provinciaSeleccionada && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-2">Municipio</th>
                  <th className="px-4 py-2">Captados</th>
                  <th className="px-4 py-2">Meta</th>
                  <th className="px-4 py-2">Avance</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {municipios?.map((f) => (
                  <FilaMeta
                    key={f.id}
                    fila={f}
                    onGuardado={() => cargarMunicipios(provinciaSeleccionada)}
                    tipo="municipioId"
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
