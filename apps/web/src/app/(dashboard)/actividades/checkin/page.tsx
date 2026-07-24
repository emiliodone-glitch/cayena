"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { ScanLine, CheckCircle2, XCircle, Camera, CameraOff, UserRound, Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

type Actividad = { id: string; titulo: string; fecha: string };

type Resultado = { ok: boolean; mensaje: string; nombre?: string };

type MilitantePreview = { id: string; nombre: string; cedula: string; telefono: string | null };

// Check-in con QR (RF nuevo): el organizador abre esta pantalla (funciona
// igual desde el navegador de un celular) y escanea el carnet QR del
// militante en la puerta del evento — el QR solo codifica su id, mismo
// esquema que la verificación de carnet en /militantes/carnet.
export default function CheckinActividadPage() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [actividadId, setActividadId] = useState("");
  const [codigoManual, setCodigoManual] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [preview, setPreview] = useState<MilitantePreview | null>(null);
  const [buscandoPreview, setBuscandoPreview] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const ultimoCodigoRef = useRef<{ codigo: string; ts: number } | null>(null);

  useEffect(() => {
    const hoy = new Date();
    const enUnMes = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
    apiFetch<Actividad[]>(`/actividades?desde=${hoy.toISOString()}&hasta=${enUnMes.toISOString()}`)
      .then((lista) => {
        setActividades(lista);
        if (lista.length > 0) setActividadId(lista[0].id);
      })
      .catch(() => setActividades([]));
  }, []);

  // Vista previa por cédula (RF nuevo): mientras se escribe a mano, busca al
  // militante y muestra su nombre antes de confirmar — así el organizador
  // detecta un typo o una persona equivocada antes de darle "Registrar", en
  // vez de enterarse recién con el error. Con debounce para no pegarle a la
  // API en cada tecla. Reusa /militantes/duplicados (mismo endpoint de la
  // detección de duplicados al crear un militante); códigos de QR (el id
  // interno, no la cédula) simplemente no hacen match acá y no muestran nada.
  useEffect(() => {
    const codigo = codigoManual.trim();
    if (codigo.length < 5) {
      setPreview(null);
      setBuscandoPreview(false);
      return;
    }
    setBuscandoPreview(true);
    const timer = setTimeout(() => {
      apiFetch<MilitantePreview[]>(`/militantes/duplicados?cedula=${encodeURIComponent(codigo)}`)
        .then((resultados) => setPreview(resultados[0] ?? null))
        .catch(() => setPreview(null))
        .finally(() => setBuscandoPreview(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [codigoManual]);

  async function registrar(codigo: string) {
    if (!actividadId || procesando) return;
    setProcesando(true);
    try {
      const r = await apiFetch<{ militante: { nombre: string } }>(`/actividades/${actividadId}/checkin`, {
        method: "POST",
        body: JSON.stringify({ codigo }),
      });
      setResultado({ ok: true, mensaje: "Asistencia registrada", nombre: r.militante.nombre });
    } catch (err) {
      setResultado({ ok: false, mensaje: err instanceof ApiError ? err.message : "No se pudo registrar" });
    } finally {
      setProcesando(false);
    }
  }

  function onManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codigoManual.trim()) return;
    registrar(codigoManual.trim());
    setCodigoManual("");
  }

  function detenerCamara() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEscaneando(false);
  }

  async function iniciarCamara() {
    setErrorCamara(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEscaneando(true);
      loop();
    } catch {
      setErrorCamara("No se pudo acceder a la cámara. Usa el código manual abajo.");
    }
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      const ahora = Date.now();
      const ultimo = ultimoCodigoRef.current;
      // Evita reprocesar el mismo QR frame tras frame mientras sigue frente
      // a la cámara — solo se re-envía si cambió el código o pasaron 4s.
      if (!ultimo || ultimo.codigo !== code.data || ahora - ultimo.ts > 4000) {
        ultimoCodigoRef.current = { codigo: code.data, ts: ahora };
        registrar(code.data);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => detenerCamara(), []);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-2">
        <ScanLine className="h-6 w-6 text-institucional-600" />
        <h1 className="text-xl font-bold text-institucional-900">Registrar asistencia</h1>
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Actividad</span>
        <select
          value={actividadId}
          onChange={(e) => setActividadId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {actividades.length === 0 && <option value="">Sin actividades en los próximos 30 días</option>}
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo} — {new Date(a.fecha).toLocaleDateString("es-DO")}
            </option>
          ))}
        </select>
      </label>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
        <video ref={videoRef} className={`w-full ${escaneando ? "block" : "hidden"}`} playsInline muted />
        {!escaneando && (
          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
            Cámara apagada
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-3 flex justify-center">
        {escaneando ? (
          <button
            onClick={detenerCamara}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <CameraOff className="h-4 w-4" /> Apagar cámara
          </button>
        ) : (
          <button
            onClick={iniciarCamara}
            disabled={!actividadId}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" /> Escanear con la cámara
          </button>
        )}
      </div>
      {errorCamara && <p className="mt-2 text-center text-sm text-red-600">{errorCamara}</p>}

      <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        o pega el código a mano
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={onManualSubmit} className="flex gap-2">
        <input
          value={codigoManual}
          onChange={(e) => setCodigoManual(e.target.value)}
          placeholder="Código del carnet o cédula"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          disabled={!actividadId || procesando}
          className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          Registrar
        </button>
      </form>

      {buscandoPreview && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
        </div>
      )}
      {!buscandoPreview && codigoManual.trim().length >= 5 && (
        <div
          className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            preview ? "border-institucional-200 bg-institucional-50 text-institucional-700" : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <UserRound className="h-4 w-4 shrink-0" />
          {preview ? (
            <span>
              {preview.nombre} — cédula {preview.cedula}
              {preview.telefono && <span className="text-institucional-600/70"> · {preview.telefono}</span>}
            </span>
          ) : (
            <span>Sin coincidencias por cédula — si es un código de carnet (QR), sigue de largo.</span>
          )}
        </div>
      )}

      {resultado && (
        <div
          className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            resultado.ok ? "border-institucional-200 bg-institucional-50 text-institucional-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {resultado.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
          <span>
            {resultado.nombre ? `${resultado.nombre} — ` : ""}
            {resultado.mensaje}
          </span>
        </div>
      )}
    </div>
  );
}
