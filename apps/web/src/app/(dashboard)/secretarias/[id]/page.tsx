"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText, History, Download } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { TableSkeleton } from "@/components/Skeleton";

type Titular = { id: string; nombre: string; email: string; active: boolean };
type Secretaria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  titularId: string | null;
  titular: Titular | null;
  presupuestoAsignado: string | null;
};

type Actividad = { id: string; titulo: string; fecha: string; ubicacion: string | null };
type Documento = { id: string; titulo: string; url: string; createdAt: string };
type Historial = { actividades: Actividad[]; documentos: Documento[] };

type Miembro = { id: string; nombre: string; email: string; role: string; cargoSecretaria: string | null; active: boolean };
type HistorialTitular = { id: string; nombreTitular: string; desde: string; hasta: string | null };
type MetaPoa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  indicadorObjetivo: number;
  fechaLimite: string;
  totalAvance: number;
  porcentaje: number;
};
type Presupuesto = { presupuestoAsignado: number | null; ejecutado: number; disponible: number | null; porcentaje: number | null };
type Informe = { id: string; periodo: string; resumen: string; archivoUrl: string | null; createdAt: string; subidoPor: { nombre: string } | null };

const TABS = [
  { id: "equipo", label: "Equipo" },
  { id: "objetivos", label: "Objetivos" },
  { id: "presupuesto", label: "Presupuesto" },
  { id: "informes", label: "Informes de gestión" },
  { id: "historial", label: "Historial de actividades" },
  { id: "documentos", label: "Documentos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

function periodoActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

export default function SecretariaDetallePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const toast = useToast();
  const puedeGestionar = user?.role === "SUPERADMIN" || user?.secretariaId === id;
  const esSuperadmin = user?.role === "SUPERADMIN";

  const [secretaria, setSecretaria] = useState<Secretaria | null>(null);
  const [tab, setTab] = useState<TabId>("equipo");

  // Historial de actividades / documentos (RF-03 / RF-02, ya existentes)
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [docTitulo, setDocTitulo] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Equipo + historial de titulares
  const [equipo, setEquipo] = useState<Miembro[] | null>(null);
  const [historialTitulares, setHistorialTitulares] = useState<HistorialTitular[] | null>(null);
  const [verHistorialTitulares, setVerHistorialTitulares] = useState(false);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string; role: string }[]>([]);
  const [nuevoTitularId, setNuevoTitularId] = useState("");
  const [cambiandoTitular, setCambiandoTitular] = useState(false);

  // Objetivos (POA)
  const [objetivos, setObjetivos] = useState<MetaPoa[] | null>(null);
  const [avance, setAvance] = useState<Record<string, string>>({});
  const [drawerObjetivo, setDrawerObjetivo] = useState(false);
  const [formObjetivo, setFormObjetivo] = useState({ nombre: "", descripcion: "", indicadorObjetivo: "", fechaLimite: "" });

  // Presupuesto
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [editandoPresupuesto, setEditandoPresupuesto] = useState(false);
  const [presupuestoInput, setPresupuestoInput] = useState("");

  // Informes de gestión
  const [informes, setInformes] = useState<Informe[] | null>(null);
  const [drawerInforme, setDrawerInforme] = useState(false);
  const [formInforme, setFormInforme] = useState({ periodo: periodoActual(), resumen: "", archivoUrl: "" });

  useEffect(() => {
    apiFetch<Secretaria>(`/secretarias/${id}`).then(setSecretaria).catch(() => setSecretaria(null));
    if (esSuperadmin) apiFetch<{ id: string; nombre: string; role: string }[]>("/usuarios").then(setUsuarios).catch(() => setUsuarios([]));
  }, [id, esSuperadmin]);

  function cargarEquipo() {
    apiFetch<Miembro[]>(`/secretarias/${id}/equipo`).then(setEquipo).catch(() => setEquipo([]));
  }
  function cargarHistorialTitulares() {
    apiFetch<HistorialTitular[]>(`/secretarias/${id}/historial-titulares`).then(setHistorialTitulares).catch(() => setHistorialTitulares([]));
  }
  function cargarObjetivos() {
    apiFetch<MetaPoa[]>(`/poa?secretariaId=${id}`).then(setObjetivos).catch(() => setObjetivos([]));
  }
  function cargarPresupuesto() {
    apiFetch<Presupuesto>(`/secretarias/${id}/presupuesto`).then(setPresupuesto).catch(() => setPresupuesto(null));
  }
  function cargarInformes() {
    apiFetch<Informe[]>(`/secretarias/${id}/informes`).then(setInformes).catch(() => setInformes([]));
  }
  function cargarHistorial() {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    apiFetch<Historial>(`/secretarias/${id}/historial?${qs.toString()}`)
      .then(setHistorial)
      .catch(() => setHistorial({ actividades: [], documentos: [] }));
  }

  useEffect(() => {
    cargarEquipo();
    cargarHistorialTitulares();
    cargarObjetivos();
    cargarPresupuesto();
    cargarInformes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(cargarHistorial, [id, desde, hasta]);

  async function cambiarTitular(e: FormEvent) {
    e.preventDefault();
    setCambiandoTitular(true);
    try {
      await apiFetch(`/secretarias/${id}`, { method: "PATCH", body: JSON.stringify({ titularId: nuevoTitularId || null }) });
      toast("Titular actualizado");
      setNuevoTitularId("");
      apiFetch<Secretaria>(`/secretarias/${id}`).then(setSecretaria);
      cargarEquipo();
      cargarHistorialTitulares();
    } catch {
      toast("No se pudo cambiar el titular", "error");
    } finally {
      setCambiandoTitular(false);
    }
  }

  async function agregarDocumento(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/secretarias/${id}/documentos`, { method: "POST", body: JSON.stringify({ titulo: docTitulo, url: docUrl }) });
      toast("Documento agregado");
      setDocTitulo("");
      setDocUrl("");
      setDrawerAbierto(false);
      cargarHistorial();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el documento");
    } finally {
      setSubmitting(false);
    }
  }

  async function crearObjetivo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/poa", {
        method: "POST",
        body: JSON.stringify({ ...formObjetivo, secretariaId: id, indicadorObjetivo: Number(formObjetivo.indicadorObjetivo) }),
      });
      toast("Objetivo creado");
      setFormObjetivo({ nombre: "", descripcion: "", indicadorObjetivo: "", fechaLimite: "" });
      setDrawerObjetivo(false);
      cargarObjetivos();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el objetivo");
    } finally {
      setSubmitting(false);
    }
  }

  async function registrarAvance(metaId: string) {
    const valor = Number(avance[metaId] ?? 0);
    if (!valor) return;
    try {
      await apiFetch(`/poa/${metaId}/avances`, { method: "POST", body: JSON.stringify({ valor }) });
      toast("Avance registrado");
      setAvance({ ...avance, [metaId]: "" });
      cargarObjetivos();
    } catch {
      toast("No se pudo registrar el avance", "error");
    }
  }

  async function guardarPresupuesto(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch(`/secretarias/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ presupuestoAsignado: presupuestoInput ? Number(presupuestoInput) : null }),
      });
      toast("Presupuesto actualizado");
      setEditandoPresupuesto(false);
      cargarPresupuesto();
    } catch {
      toast("No se pudo actualizar el presupuesto", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function crearInforme(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/secretarias/${id}/informes`, {
        method: "POST",
        body: JSON.stringify({ ...formInforme, archivoUrl: formInforme.archivoUrl || undefined }),
      });
      toast("Informe registrado");
      setFormInforme({ periodo: periodoActual(), resumen: "", archivoUrl: "" });
      setDrawerInforme(false);
      cargarInformes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el informe (¿ya existe uno para ese período?)");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportarInformePDF() {
    if (!secretaria) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;

    doc.setFontSize(16);
    doc.setTextColor(20, 83, 45);
    doc.text(`Informe de gestión — ${secretaria.nombre}`, M, y);
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Titular: ${secretaria.titular?.nombre ?? "Vacante"} · Generado el ${new Date().toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}`,
      M,
      y,
    );
    y += 28;

    function titulo(texto: string) {
      if (y > pageH - 60) {
        doc.addPage();
        y = M;
      }
      doc.setFontSize(12);
      doc.setTextColor(20, 83, 45);
      doc.text(texto, M, y);
      y += 6;
      doc.setDrawColor(229, 231, 235);
      doc.line(M, y, pageW - M, y);
      y += 18;
    }

    titulo("Objetivos");
    doc.setFontSize(10);
    if (objetivos && objetivos.length > 0) {
      for (const o of objetivos) {
        if (y > pageH - 40) {
          doc.addPage();
          y = M;
        }
        doc.setTextColor(31, 41, 55);
        doc.text(`${o.nombre} — ${o.totalAvance}/${o.indicadorObjetivo} (${o.porcentaje}%)`, M, y);
        y += 16;
      }
    } else {
      doc.setTextColor(156, 163, 175);
      doc.text("Sin objetivos registrados.", M, y);
      y += 16;
    }
    y += 12;

    titulo("Presupuesto");
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    if (presupuesto?.presupuestoAsignado != null) {
      doc.text(
        `Asignado: ${fmtMoney.format(presupuesto.presupuestoAsignado)} · Ejecutado: ${fmtMoney.format(presupuesto.ejecutado)} (${presupuesto.porcentaje}%)`,
        M,
        y,
      );
    } else {
      doc.setTextColor(156, 163, 175);
      doc.text("Sin presupuesto asignado.", M, y);
    }
    y += 28;

    titulo("Informes de gestión");
    doc.setFontSize(10);
    if (informes && informes.length > 0) {
      for (const inf of informes) {
        if (y > pageH - 60) {
          doc.addPage();
          y = M;
        }
        doc.setTextColor(20, 83, 45);
        doc.setFont("helvetica", "bold");
        doc.text(inf.periodo, M, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
        const lineas = doc.splitTextToSize(inf.resumen, pageW - 2 * M);
        for (const linea of lineas) {
          if (y > pageH - 40) {
            doc.addPage();
            y = M;
          }
          doc.text(linea, M, y);
          y += 14;
        }
        y += 10;
      }
    } else {
      doc.setTextColor(156, 163, 175);
      doc.text("Sin informes registrados.", M, y);
    }

    doc.save(`informe-gestion-${secretaria.nombre.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  }

  const periodoPendiente = (() => {
    if (!informes) return null;
    const ahora = new Date();
    const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
    return informes.some((i) => i.periodo === periodo) ? null : periodo;
  })();

  return (
    <div>
      <Link href="/secretarias" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-institucional-700">
        <ArrowLeft className="h-4 w-4" /> Volver a secretarías
      </Link>

      <h1 className="text-xl font-bold text-institucional-900">{secretaria?.nombre ?? "Cargando…"}</h1>
      {secretaria?.descripcion && <p className="mt-1 text-sm text-gray-500">{secretaria.descripcion}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-xs uppercase text-gray-400">Titular</div>
          {secretaria?.titular ? (
            <div className={secretaria.titular.active ? "font-semibold text-institucional-900" : "font-semibold text-amber-600"}>
              {secretaria.titular.nombre}
              {!secretaria.titular.active && <span className="ml-1.5 text-xs font-normal">(pendiente de activar)</span>}
            </div>
          ) : (
            <div className="font-semibold text-gray-400">Vacante / sin titular</div>
          )}
        </div>
        <button
          onClick={() => {
            setVerHistorialTitulares(!verHistorialTitulares);
          }}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-institucional-700"
        >
          <History className="h-3.5 w-3.5" /> Historial de titulares
        </button>
        {esSuperadmin && (
          <form onSubmit={cambiarTitular} className="flex items-center gap-2">
            <select
              value={nuevoTitularId}
              onChange={(e) => setNuevoTitularId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Vacante / sin titular</option>
              {usuarios
                .slice()
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.role})
                  </option>
                ))}
            </select>
            <button
              disabled={cambiandoTitular}
              className="rounded-lg bg-institucional-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              Cambiar
            </button>
          </form>
        )}
      </div>

      {verHistorialTitulares && (
        <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
          {historialTitulares === null ? (
            <p className="text-gray-400">Cargando…</p>
          ) : historialTitulares.length === 0 ? (
            <p className="text-gray-400">Sin historial registrado.</p>
          ) : (
            <ul className="space-y-1">
              {historialTitulares.map((h) => (
                <li key={h.id} className="flex items-center justify-between text-gray-600">
                  <span className="font-medium text-gray-800">{h.nombreTitular}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.desde).toLocaleDateString("es-DO")} –{" "}
                    {h.hasta ? new Date(h.hasta).toLocaleDateString("es-DO") : "actualidad"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-6 mt-4 flex flex-wrap rounded-lg border border-gray-200 bg-white p-1 text-sm w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1 ${tab === t.id ? "bg-institucional-600 text-white" : "text-gray-500"}`}
          >
            {t.label}
            {t.id === "informes" && periodoPendiente && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" title="Informe pendiente" />
            )}
          </button>
        ))}
      </div>

      {tab === "equipo" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <span className="text-xs text-gray-400">Todo usuario vinculado a esta secretaría.</span>
            <Link href="/usuarios" className="text-xs font-medium text-institucional-700 hover:underline">
              Gestionar en Usuarios →
            </Link>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Cargo</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Correo</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {equipo === null ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Cargando…</td>
                </tr>
              ) : equipo.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin miembros vinculados aún.</td>
                </tr>
              ) : (
                equipo.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-medium">{m.nombre}</td>
                    <td className="px-4 py-2 text-gray-600">{m.cargoSecretaria ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{m.role}</td>
                    <td className="px-4 py-2 text-gray-500">{m.email}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.active ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"}`}>
                        {m.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "objetivos" && (
        <div>
          {puedeGestionar && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setDrawerObjetivo(true)}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
              >
                <Plus className="h-4 w-4" /> Nuevo objetivo
              </button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {objetivos === null && Array.from({ length: 2 }).map((_, i) => <CardPlaceholder key={i} />)}
            {objetivos?.map((o) => (
              <div key={o.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="font-semibold text-institucional-900">{o.nombre}</div>
                {o.descripcion && <div className="mt-1 text-xs text-gray-500">{o.descripcion}</div>}
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-institucional-600" style={{ width: `${Math.min(100, o.porcentaje)}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {o.totalAvance} / {o.indicadorObjetivo} ({o.porcentaje}%) · límite {new Date(o.fechaLimite).toLocaleDateString("es-DO")}
                </div>
                {puedeGestionar && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="number"
                      placeholder="Avance"
                      value={avance[o.id] ?? ""}
                      onChange={(e) => setAvance({ ...avance, [o.id]: e.target.value })}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => registrarAvance(o.id)}
                      className="rounded-lg bg-institucional-600 px-3 py-1 text-xs font-semibold text-white hover:bg-institucional-700"
                    >
                      Registrar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {objetivos?.length === 0 && <p className="col-span-full py-6 text-center text-gray-400">Sin objetivos registrados.</p>}
          </div>
        </div>
      )}

      {tab === "presupuesto" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {presupuesto === null ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : presupuesto.presupuestoAsignado == null ? (
            <p className="text-sm text-gray-400">Sin presupuesto asignado todavía.</p>
          ) : (
            <div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-institucional-900">{fmtMoney.format(presupuesto.presupuestoAsignado)}</div>
                  <div className="text-xs text-gray-500">Asignado</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{fmtMoney.format(presupuesto.ejecutado)}</div>
                  <div className="text-xs text-gray-500">Ejecutado</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-institucional-700">{fmtMoney.format(presupuesto.disponible ?? 0)}</div>
                  <div className="text-xs text-gray-500">Disponible</div>
                </div>
              </div>
              <div className="mt-4 h-2.5 w-full rounded-full bg-gray-100">
                <div
                  className={`h-2.5 rounded-full ${(presupuesto.porcentaje ?? 0) > 100 ? "bg-red-600" : "bg-institucional-600"}`}
                  style={{ width: `${Math.min(100, presupuesto.porcentaje ?? 0)}%` }}
                />
              </div>
              <div className="mt-1 text-center text-xs text-gray-500">{presupuesto.porcentaje}% ejecutado</div>
            </div>
          )}
          {esSuperadmin && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              {editandoPresupuesto ? (
                <form onSubmit={guardarPresupuesto} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    autoFocus
                    defaultValue={presupuesto?.presupuestoAsignado ?? ""}
                    onChange={(e) => setPresupuestoInput(e.target.value)}
                    placeholder="Monto asignado"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button disabled={submitting} className="rounded-lg bg-institucional-600 px-3 py-2 text-xs font-semibold text-white hover:bg-institucional-700">
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditandoPresupuesto(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
                    Cancelar
                  </button>
                </form>
              ) : (
                <button onClick={() => setEditandoPresupuesto(true)} className="text-xs font-medium text-institucional-700 hover:underline">
                  {presupuesto?.presupuestoAsignado == null ? "Asignar presupuesto" : "Editar presupuesto asignado"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "informes" && (
        <div>
          {periodoPendiente && (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
              Falta el informe de gestión de <strong>{periodoPendiente}</strong>.
            </div>
          )}
          <div className="mb-4 flex justify-end gap-2">
            <button
              onClick={exportarInformePDF}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Exportar PDF
            </button>
            {puedeGestionar && (
              <button
                onClick={() => setDrawerInforme(true)}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
              >
                <Plus className="h-4 w-4" /> Nuevo informe
              </button>
            )}
          </div>
          <div className="space-y-3">
            {informes === null && <p className="py-6 text-center text-gray-400">Cargando…</p>}
            {informes?.map((i) => (
              <div key={i.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-institucional-900">{i.periodo}</span>
                  <span className="text-xs text-gray-400">{new Date(i.createdAt).toLocaleDateString("es-DO")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{i.resumen}</p>
                {i.archivoUrl && (
                  <a href={i.archivoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-institucional-700 hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Ver archivo adjunto
                  </a>
                )}
                {i.subidoPor && <div className="mt-1 text-xs text-gray-400">Subido por {i.subidoPor.nombre}</div>}
              </div>
            ))}
            {informes?.length === 0 && <p className="py-6 text-center text-gray-400">Sin informes registrados.</p>}
          </div>
        </div>
      )}

      {tab === "historial" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Hasta
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
            {(desde || hasta) && (
              <button onClick={() => { setDesde(""); setHasta(""); }} className="text-xs font-medium text-gray-400 hover:text-gray-600">
                Limpiar filtro
              </button>
            )}
          </div>

          {historial === null ? (
            <TableSkeleton cols={3} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Título</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Ubicación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.actividades.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2 font-medium">{a.titulo}</td>
                      <td className="px-4 py-2">{new Date(a.fecha).toLocaleString("es-DO")}</td>
                      <td className="px-4 py-2 text-gray-500">{a.ubicacion ?? "—"}</td>
                    </tr>
                  ))}
                  {historial.actividades.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin actividades en este rango.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "documentos" && (
        <div>
          {puedeGestionar && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setDrawerAbierto(true)}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
              >
                <Plus className="h-4 w-4" /> Agregar documento
              </button>
            </div>
          )}

          {historial === null ? (
            <TableSkeleton cols={2} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Documento</th>
                    <th className="px-4 py-2">Agregado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.documentos.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2">
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium text-institucional-700 hover:underline">
                          <FileText className="h-4 w-4" /> {d.titulo}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-gray-400">{new Date(d.createdAt).toLocaleDateString("es-DO")}</td>
                    </tr>
                  ))}
                  {historial.documentos.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-gray-400">Sin documentos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title="Agregar documento">
        <form onSubmit={agregarDocumento} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
            <input required value={docTitulo} onChange={(e) => setDocTitulo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Enlace del documento</span>
            <input required type="url" placeholder="https://…" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button disabled={submitting} className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60">
              {submitting ? "Guardando…" : "Agregar"}
            </button>
            <button type="button" onClick={() => setDrawerAbierto(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer open={drawerObjetivo} onClose={() => setDrawerObjetivo(false)} title="Nuevo objetivo">
        <form onSubmit={crearObjetivo} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nombre del objetivo</span>
            <input required value={formObjetivo.nombre} onChange={(e) => setFormObjetivo({ ...formObjetivo, nombre: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <textarea value={formObjetivo.descripcion} onChange={(e) => setFormObjetivo({ ...formObjetivo, descripcion: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Indicador objetivo</span>
              <input required type="number" value={formObjetivo.indicadorObjetivo} onChange={(e) => setFormObjetivo({ ...formObjetivo, indicadorObjetivo: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Fecha límite</span>
              <input required type="date" value={formObjetivo.fechaLimite} onChange={(e) => setFormObjetivo({ ...formObjetivo, fechaLimite: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button disabled={submitting} className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60">
              {submitting ? "Guardando…" : "Crear objetivo"}
            </button>
            <button type="button" onClick={() => setDrawerObjetivo(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer open={drawerInforme} onClose={() => setDrawerInforme(false)} title="Nuevo informe de gestión">
        <form onSubmit={crearInforme} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Período (AAAA-MM)</span>
            <input required pattern="\d{4}-\d{2}" value={formInforme.periodo} onChange={(e) => setFormInforme({ ...formInforme, periodo: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Resumen de gestión</span>
            <textarea required minLength={10} rows={5} value={formInforme.resumen} onChange={(e) => setFormInforme({ ...formInforme, resumen: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Enlace a archivo adjunto (opcional)</span>
            <input type="url" placeholder="https://…" value={formInforme.archivoUrl} onChange={(e) => setFormInforme({ ...formInforme, archivoUrl: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button disabled={submitting} className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60">
              {submitting ? "Guardando…" : "Registrar informe"}
            </button>
            <button type="button" onClick={() => setDrawerInforme(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

function CardPlaceholder() {
  return <div className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />;
}
