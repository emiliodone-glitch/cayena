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
  esCabecera?: boolean;
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
      esCabecera: p.esCabecera,
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
  tipo: "provinciaId" | "municipioId" | "distritoMunicipalId";
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

function TablaMetas({
  filas,
  tipo,
  onGuardado,
  columnaTitulo,
  vacio,
}: {
  filas: Fila[] | null;
  tipo: "provinciaId" | "municipioId" | "distritoMunicipalId";
  onGuardado: () => void;
  columnaTitulo: string;
  vacio?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-400">
          <tr>
            <th className="px-4 py-2">{columnaTitulo}</th>
            <th className="px-4 py-2">Captados</th>
            <th className="px-4 py-2">Meta</th>
            <th className="px-4 py-2">Avance</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas?.map((f) => (
            <FilaMeta key={f.id} fila={f} onGuardado={onGuardado} tipo={tipo} />
          ))}
          {filas && filas.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                {vacio ?? "Sin resultados."}
              </td>
            </tr>
          )}
          {!filas && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                Cargando…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MetasEditor() {
  const [provincias, setProvincias] = useState<Fila[] | null>(null);
  const [listaProvincias, setListaProvincias] = useState<Lista>([]);

  const [provinciaMunicipios, setProvinciaMunicipios] = useState("");
  const [municipios, setMunicipios] = useState<Fila[] | null>(null);

  // La sección de distritos municipales necesita su propia provincia + su
  // propio municipio (no comparte selección con la sección de municipios de
  // arriba: son controles independientes aunque se vean parecidos).
  const [provinciaDistritos, setProvinciaDistritos] = useState("");
  const [listaMunicipiosDistritos, setListaMunicipiosDistritos] = useState<Lista>([]);
  const [municipioDistritos, setMunicipioDistritos] = useState("");
  const [distritos, setDistritos] = useState<Fila[] | null>(null);

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
    cargarMunicipios(provinciaMunicipios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinciaMunicipios]);

  useEffect(() => {
    if (!provinciaDistritos) {
      setListaMunicipiosDistritos([]);
      setMunicipioDistritos("");
      return;
    }
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${provinciaDistritos}`).then(setListaMunicipiosDistritos);
    setMunicipioDistritos("");
  }, [provinciaDistritos]);

  function cargarDistritos(municipioId: string) {
    if (!municipioId) {
      setDistritos(null);
      return;
    }
    apiFetch<FeatureCollection>(`/geo/municipios/${municipioId}/distritos-municipales`).then((geo) =>
      // La cabecera (esCabecera: true) no es una fila real de DistritoMunicipal
      // — su meta es siempre 0 y se calcula sola contra el municipio (ver el
      // mapa), así que no tiene sentido editarla acá.
      setDistritos(extraerFilas(geo).filter((f) => !f.esCabecera)),
    );
  }

  useEffect(() => {
    cargarDistritos(municipioDistritos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipioDistritos]);

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-gray-500">
        Estas son las metas de <span className="font-medium text-gray-700">captación de militantes</span> por
        territorio — son las que colorean el mapa (rojo/amarillo/verde). No confundir con los objetivos del{" "}
        <span className="font-medium text-gray-700">POA</span> de cada secretaría, que se definen en la pantalla
        &quot;POA / Metas&quot; del menú.
      </p>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Metas por provincia</h2>
        <TablaMetas filas={provincias} tipo="provinciaId" onGuardado={cargarProvincias} columnaTitulo="Provincia" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Metas por municipio</h2>
          <select
            value={provinciaMunicipios}
            onChange={(e) => setProvinciaMunicipios(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Selecciona una provincia…</option>
            {listaProvincias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        {provinciaMunicipios && (
          <TablaMetas
            filas={municipios}
            tipo="municipioId"
            onGuardado={() => cargarMunicipios(provinciaMunicipios)}
            columnaTitulo="Municipio"
          />
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Metas por distrito municipal</h2>
          <div className="flex items-center gap-2">
            <select
              value={provinciaDistritos}
              onChange={(e) => setProvinciaDistritos(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Selecciona una provincia…</option>
              {listaProvincias.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select
              value={municipioDistritos}
              onChange={(e) => setMunicipioDistritos(e.target.value)}
              disabled={!provinciaDistritos}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">Selecciona un municipio…</option>
              {listaMunicipiosDistritos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        {municipioDistritos && (
          <TablaMetas
            filas={distritos}
            tipo="distritoMunicipalId"
            onGuardado={() => cargarDistritos(municipioDistritos)}
            columnaTitulo="Distrito municipal"
            vacio="Este municipio no tiene distritos municipales — solo tiene su propia cabecera."
          />
        )}
      </div>
    </div>
  );
}
