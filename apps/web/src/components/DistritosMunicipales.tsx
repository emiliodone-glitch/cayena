"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Pencil, Trash2, X } from "lucide-react";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Lista = { id: string; nombre: string }[];

type DistritoFila = {
  id: string;
  nombre: string;
  municipioId: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
};

function FilaDistrito({
  fila,
  puedeEditar,
  onGuardado,
  onEliminar,
}: {
  fila: DistritoFila;
  puedeEditar: boolean;
  onGuardado: () => void;
  onEliminar: (id: string, nombre: string) => void;
}) {
  const toast = useToast();
  const [valorMeta, setValorMeta] = useState(String(fila.meta));
  const [guardandoMeta, setGuardandoMeta] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(fila.nombre);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const metaCambiada = Number(valorMeta) !== fila.meta;

  async function guardarMeta() {
    setGuardandoMeta(true);
    try {
      await apiFetch("/militantes/metas", {
        method: "POST",
        body: JSON.stringify({ distritoMunicipalId: fila.id, meta: Number(valorMeta) }),
      });
      toast(`Meta de ${fila.nombre} actualizada a ${valorMeta}`);
      onGuardado();
    } catch {
      toast("No se pudo actualizar la meta", "error");
    } finally {
      setGuardandoMeta(false);
    }
  }

  async function guardarNombre() {
    setGuardandoNombre(true);
    try {
      await apiFetch(`/distritos/${fila.id}`, { method: "PATCH", body: JSON.stringify({ nombre }) });
      toast("Distrito municipal renombrado");
      setRenombrando(false);
      onGuardado();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo renombrar el distrito", "error");
    } finally {
      setGuardandoNombre(false);
    }
  }

  return (
    <tr>
      <td className="px-4 py-2 font-medium">
        {renombrando ? (
          <div className="flex items-center gap-1.5">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-sm"
              autoFocus
            />
            <button onClick={guardarNombre} disabled={guardandoNombre} className="text-institucional-600 hover:text-institucional-800">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => { setRenombrando(false); setNombre(fila.nombre); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          fila.nombre
        )}
      </td>
      <td className="px-4 py-2">{fila.militantesCaptados.toLocaleString("es-DO")}</td>
      <td className="px-4 py-2">
        {puedeEditar ? (
          <input
            type="number"
            min={0}
            value={valorMeta}
            onChange={(e) => setValorMeta(e.target.value)}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        ) : (
          fila.meta.toLocaleString("es-DO")
        )}
      </td>
      <td className="px-4 py-2 font-semibold" style={{ color: COLOR_ESTADO[fila.estado] }}>
        {fila.porcentaje}%
      </td>
      {puedeEditar && (
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            {metaCambiada && (
              <button
                onClick={guardarMeta}
                disabled={guardandoMeta}
                className="inline-flex items-center gap-1 rounded-lg bg-institucional-600 px-3 py-1 text-xs font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> {guardandoMeta ? "Guardando…" : "Guardar"}
              </button>
            )}
            {!renombrando && (
              <button onClick={() => setRenombrando(true)} className="text-gray-400 hover:text-institucional-700" title="Renombrar">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => onEliminar(fila.id, fila.nombre)} className="text-gray-400 hover:text-red-600" title="Eliminar">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export function DistritosMunicipales() {
  const { user } = useAuth();
  const toast = useToast();
  const puedeEditar = user?.role === "SUPERADMIN";

  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [provinciaId, setProvinciaId] = useState("");
  const [municipioId, setMunicipioId] = useState("");
  const [distritos, setDistritos] = useState<DistritoFila[] | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<{ id: string; nombre: string } | null>(null);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  useEffect(() => {
    setMunicipioId("");
    setDistritos(null);
    if (!provinciaId) {
      setMunicipios([]);
      return;
    }
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${provinciaId}`).then(setMunicipios);
  }, [provinciaId]);

  function cargarDistritos() {
    if (!municipioId) {
      setDistritos(null);
      return;
    }
    apiFetch<DistritoFila[]>(`/distritos?municipioId=${municipioId}`).then(setDistritos);
  }

  useEffect(cargarDistritos, [municipioId]);

  async function crearDistrito() {
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    try {
      await apiFetch("/distritos", {
        method: "POST",
        body: JSON.stringify({ municipioId, nombre: nuevoNombre.trim() }),
      });
      toast("Distrito municipal agregado");
      setNuevoNombre("");
      cargarDistritos();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo agregar el distrito", "error");
    } finally {
      setCreando(false);
    }
  }

  async function eliminarDistrito() {
    if (!aEliminar) return;
    try {
      await apiFetch(`/distritos/${aEliminar.id}`, { method: "DELETE" });
      toast(`Distrito "${aEliminar.nombre}" eliminado`);
      cargarDistritos();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo eliminar el distrito", "error");
    } finally {
      setAEliminar(null);
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-gray-500">
        Los distritos municipales no cuentan con límites geográficos reales
        disponibles para dibujarse en el mapa, así que se gestionan aquí como
        lista: selecciona una provincia y un municipio para ver o registrar
        sus distritos municipales y su nivel de avance.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={provinciaId}
          onChange={(e) => setProvinciaId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">Selecciona una provincia…</option>
          {provincias.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={municipioId}
          onChange={(e) => setMunicipioId(e.target.value)}
          disabled={!provinciaId}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="">Selecciona un municipio…</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
      </div>

      {!municipioId ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          Selecciona provincia y municipio para ver sus distritos municipales.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-2">Distrito municipal</th>
                  <th className="px-4 py-2">Militantes captados</th>
                  <th className="px-4 py-2">Meta</th>
                  <th className="px-4 py-2">Avance</th>
                  {puedeEditar && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {distritos === null && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Cargando…</td>
                  </tr>
                )}
                {distritos?.map((f) => (
                  <FilaDistrito
                    key={f.id}
                    fila={f}
                    puedeEditar={puedeEditar}
                    onGuardado={cargarDistritos}
                    onEliminar={(id, nombre) => setAEliminar({ id, nombre })}
                  />
                ))}
                {distritos?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      Este municipio todavía no tiene distritos municipales registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {puedeEditar && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearDistrito()}
                placeholder="Nombre del nuevo distrito municipal…"
                className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                onClick={crearDistrito}
                disabled={creando || !nuevoNombre.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Agregar
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.rojo }} /> Lejos de meta
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.amarillo }} /> En curso
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.verde }} /> Meta cumplida
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        title="Eliminar distrito municipal"
        mensaje={`¿Eliminar "${aEliminar?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={eliminarDistrito}
        onCancel={() => setAEliminar(null)}
      />
    </div>
  );
}
