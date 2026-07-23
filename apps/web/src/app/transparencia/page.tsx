"use client";

import { useEffect, useState } from "react";
import { API_URL, resolveFileUrl } from "@/lib/api";
import { CATEGORIAS_OBRA, formatearCategoriaObra, ANIOS_OBRA_GOBIERNO } from "@/lib/obrasGobierno";

type Resumen = {
  militantesTotales: number;
  metaNacional: number;
  porcentajeNacional: number;
  estadoNacional: "rojo" | "amarillo" | "verde";
  obrasPorCategoria: { categoria: string; total: number }[];
  inversionTotalObras: number;
  actividadesRealizadas: number;
  finanzas: { categoria: string; tipo: "INGRESO" | "GASTO"; total: number }[];
};

type Lista = { id: string; nombre: string }[];

type ObraPublica = {
  id: string;
  titulo: string;
  resena: string;
  categoria: string;
  fotos: string[];
  inversion: string | null;
  fechaInauguracion: string | null;
  beneficiarios: string | null;
  lat: number;
  lng: number;
  provincia: { nombre: string };
  municipio: { nombre: string };
};


type ProvinciaResumen = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: "rojo" | "amarillo" | "verde";
};

type SecretariaResumen = {
  id: string;
  nombre: string;
  descripcion: string | null;
  titular: string | null;
  actividadesPublicas: number;
  objetivosTotales: number;
  avancePromedioObjetivos: number | null;
};

const ESTADO_COLOR: Record<string, string> = { rojo: "#dc2626", amarillo: "#f59e0b", verde: "#16a34a" };
const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export default function TransparenciaPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [provincias, setProvincias] = useState<ProvinciaResumen[]>([]);
  const [secretarias, setSecretarias] = useState<SecretariaResumen[]>([]);
  const [listaProvincias, setListaProvincias] = useState<Lista>([]);
  const [obras, setObras] = useState<ObraPublica[] | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/transparencia/resumen`).then((r) => r.json()).then(setResumen);
    fetch(`${API_URL}/transparencia/provincias`).then((r) => r.json()).then(setProvincias);
    fetch(`${API_URL}/transparencia/secretarias`).then((r) => r.json()).then(setSecretarias);
    fetch(`${API_URL}/geo/lista/provincias`).then((r) => r.json()).then(setListaProvincias);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (categoriaFiltro) params.set("categoria", categoriaFiltro);
    if (provinciaFiltro) params.set("provinciaId", provinciaFiltro);
    if (anioFiltro) params.set("anio", anioFiltro);
    const qs = params.toString();
    fetch(`${API_URL}/obras/publicas${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then(setObras)
      .catch(() => setObras([]));
  }, [categoriaFiltro, provinciaFiltro, anioFiltro]);

  const gastoTotal = resumen?.finanzas.filter((f) => f.tipo === "GASTO").reduce((s, f) => s + f.total, 0) ?? 0;
  const ingresoTotal = resumen?.finanzas.filter((f) => f.tipo === "INGRESO").reduce((s, f) => s + f.total, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-institucional-600 text-2xl text-white">
            ✻
          </div>
          <h1 className="text-2xl font-bold text-institucional-900">Panel de transparencia</h1>
          <p className="text-sm text-gray-500">Fuerza del Pueblo · Datos públicos, actualizados en tiempo real</p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Militantes captados" value={resumen?.militantesTotales.toLocaleString("es-DO") ?? "—"} />
          <Kpi label="Avance meta nacional" value={resumen ? `${resumen.porcentajeNacional}%` : "—"} />
          <Kpi label="Actividades realizadas" value={resumen?.actividadesRealizadas.toLocaleString("es-DO") ?? "—"} />
          <Kpi label="Obras registradas" value={resumen?.obrasPorCategoria.reduce((s, o) => s + o.total, 0).toString() ?? "—"} />
        </div>

        {!!resumen?.inversionTotalObras && (
          <div className="mb-8 rounded-xl border border-institucional-200 bg-institucional-50 p-5 text-center">
            <div className="text-2xl font-bold text-institucional-800">{fmtMoney.format(resumen.inversionTotalObras)}</div>
            <div className="text-xs text-institucional-700">Inversión total en obras de gobierno realizadas</div>
          </div>
        )}

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Avance por provincia</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {provincias.map((p) => (
              <div key={p.id} className="rounded-lg border border-gray-100 p-3 text-center">
                <div className="text-xs text-gray-500">{p.nombre}</div>
                <div className="mt-1 text-lg font-bold" style={{ color: ESTADO_COLOR[p.estado] }}>
                  {p.porcentaje}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Obras por categoría</h2>
          <div className="mb-4 space-y-2">
            {resumen?.obrasPorCategoria.map((o) => (
              <div key={o.categoria} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{formatearCategoriaObra(o.categoria)}</span>
                <span className="font-semibold text-institucional-900">{o.total}</span>
              </div>
            ))}
            {resumen && resumen.obrasPorCategoria.length === 0 && (
              <p className="text-sm text-gray-400">Aún no hay obras publicadas.</p>
            )}
          </div>

          <h3 className="mb-3 text-sm font-semibold text-gray-700">Catálogo de obras realizadas</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-institucional-600 focus:outline-none"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS_OBRA.map((c) => (
                <option key={c} value={c}>{formatearCategoriaObra(c)}</option>
              ))}
            </select>
            <select
              value={provinciaFiltro}
              onChange={(e) => setProvinciaFiltro(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-institucional-600 focus:outline-none"
            >
              <option value="">Todas las provincias</option>
              {listaProvincias.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <select
              value={anioFiltro}
              onChange={(e) => setAnioFiltro(e.target.value)}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-institucional-600 focus:outline-none"
            >
              <option value="">Todos los años</option>
              {ANIOS_OBRA_GOBIERNO.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {obras?.map((o) => (
              <div key={o.id} className="overflow-hidden rounded-lg border border-gray-100">
                {o.fotos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveFileUrl(o.fotos[0])} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="h-36 w-full bg-institucional-50" />
                )}
                <div className="p-3">
                  <span className="text-xs font-semibold uppercase text-institucional-600">
                    {formatearCategoriaObra(o.categoria)}
                  </span>
                  <div className="font-semibold text-institucional-900">{o.titulo}</div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{o.resena}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>📍 {o.municipio.nombre}, {o.provincia.nombre}</span>
                    {o.fechaInauguracion && <span>{new Date(o.fechaInauguracion).toLocaleDateString("es-DO")}</span>}
                  </div>
                  {o.inversion != null && (
                    <div className="mt-1 text-xs font-semibold text-institucional-700">
                      Inversión: {fmtMoney.format(Number(o.inversion))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {obras && obras.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">No hay obras que coincidan con estos filtros.</p>
            )}
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Secretarías y su gestión</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {secretarias.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-100 p-3">
                <div className="font-semibold text-institucional-900">{s.nombre}</div>
                <div className="text-xs text-gray-500">{s.titular ? `Titular: ${s.titular}` : "Vacante"}</div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span>{s.actividadesPublicas} actividades</span>
                  {s.avancePromedioObjetivos != null && (
                    <span className="font-semibold text-institucional-700">{s.avancePromedioObjetivos}% de objetivos</span>
                  )}
                </div>
              </div>
            ))}
            {secretarias.length === 0 && <p className="col-span-full text-sm text-gray-400">Aún no hay secretarías registradas.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Finanzas agregadas</h2>
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            <div>
              <div className="text-lg font-bold text-institucional-700">{fmtMoney.format(ingresoTotal)}</div>
              <div className="text-xs text-gray-500">Ingresos totales</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{fmtMoney.format(gastoTotal)}</div>
              <div className="text-xs text-gray-500">Gastos totales</div>
            </div>
            <div>
              <div className="text-lg font-bold text-institucional-900">{fmtMoney.format(ingresoTotal - gastoTotal)}</div>
              <div className="text-xs text-gray-500">Balance</div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Cifras agregadas sin datos personales, conforme a la Ley 172-13 de Protección de Datos Personales.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
      <div className="text-2xl font-bold text-institucional-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}
