"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { ScanLine, CheckCircle2, XCircle, Camera, CameraOff } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

type Evento = { id: string; nombre: string; activo: boolean };

type Resultado = { ok: boolean; mensaje: string; nombre?: string };

// Marcado de voto por fiscal de mesa/promotor (RF nuevo, Día Electoral): el
// fiscal escanea el carnet QR del militante (mismo esquema que el check-in
// de Actividades — el QR solo codifica el id) o pega su cédula a mano. Vive
// en el back office web (no en la app móvil pública) por la misma razón que
// el check-in de Actividades: la app pública no tiene sesión de staff.
export default function MarcarVotoPage() {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [codigoManual, setCodigoManual] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [totalRegistrados, setTotalRegistrados] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const ultimoCodigoRef = useRef<{ codigo: string; ts: number } | null>(null);

  useEffect(() => {
    apiFetch<Evento | null>("/dia-electoral/activo").then(setEvento);
  }, []);

  async function registrar(codigo: string) {
    if (!evento || procesando) return;
    setProcesando(true);
    try {
      const r = await apiFetch<{ militante: { nombre: string } }>("/dia-electoral/confirmar-mesa", {
        method: "POST",
        body: JSON.stringify({ eventoId: evento.id, codigo }),
      });
      setResultado({ ok: true, mensaje: "Voto registrado", nombre: r.militante.nombre });
      setTotalRegistrados((n) => n + 1);
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
      if (!ultimo || ultimo.codigo !== code.data || ahora - ultimo.ts > 4000) {
        ultimoCodigoRef.current = { codigo: code.data, ts: ahora };
        registrar(code.data);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => detenerCamara(), []);

  if (evento === null) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-400">No hay ninguna jornada electoral activa todavía.</p>
      </div>
    );
  }
  if (!evento) return null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-2 flex items-center gap-2">
        <ScanLine className="h-6 w-6 text-indigo-600" />
        <h1 className="text-xl font-bold text-institucional-900">Registrar votos</h1>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        {evento.nombre} · {totalRegistrados} registrados en esta sesión
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
        <video ref={videoRef} className={`w-full ${escaneando ? "block" : "hidden"}`} playsInline muted />
        {!escaneando && (
          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">Cámara apagada</div>
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
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
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
          disabled={procesando}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Registrar
        </button>
      </form>

      {resultado && (
        <div
          className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            resultado.ok ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-red-200 bg-red-50 text-red-700"
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
