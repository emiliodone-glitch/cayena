"use client";

import { useRef, useState } from "react";
import { Download, Upload, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { uploadCsv, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

type FilaResultado = {
  fila: number;
  nombre?: string;
  estado: "creado" | "duplicado" | "error";
  mensaje?: string;
};

type Resultado = {
  total: number;
  creados: number;
  duplicados: number;
  errores: number;
  detalle: FilaResultado[];
};

const PLANTILLA =
  "nombre,cedula,telefono,direccion,provincia,municipio,localidad,recintoElectoral\n" +
  "Juan Pérez,00100000001,8095551234,Calle Duarte 12,Santiago,Santiago de los Caballeros,Los Jardines,Escuela Central\n";

function descargarPlantilla() {
  const blob = new Blob([PLANTILLA], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-militantes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportarMilitantesCSV({ onImportado }: { onImportado: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResultado(null);
    setSubiendo(true);
    try {
      const data = await uploadCsv<Resultado>("/militantes/importar", file);
      setResultado(data);
      if (data.creados > 0) {
        toast(`${data.creados} militante(s) importado(s) correctamente`);
        onImportado();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo procesar el archivo");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Sube un CSV con columnas: <code className="rounded bg-gray-100 px-1">nombre, cedula, telefono, direccion,
        provincia, municipio, localidad, recintoElectoral</code>. La provincia y el municipio se buscan por nombre.
      </p>

      <button
        onClick={descargarPlantilla}
        className="flex items-center gap-1.5 text-sm font-medium text-institucional-700 hover:underline"
      >
        <Download className="h-4 w-4" /> Descargar plantilla de ejemplo
      </button>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-institucional-600">
        <Upload className="h-6 w-6 text-gray-400" />
        <span className="text-sm text-gray-500">{subiendo ? "Procesando…" : "Selecciona o arrastra un archivo .csv"}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {resultado && (
        <div>
          <div className="mb-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-institucional-50 p-3">
              <div className="text-lg font-bold text-institucional-700">{resultado.creados}</div>
              <div className="text-xs text-gray-500">Creados</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-lg font-bold text-amber-600">{resultado.duplicados}</div>
              <div className="text-xs text-gray-500">Duplicados</div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <div className="text-lg font-bold text-red-600">{resultado.errores}</div>
              <div className="text-xs text-gray-500">Errores</div>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
            {resultado.detalle
              .filter((r) => r.estado !== "creado")
              .map((r, i) => (
                <div key={i} className="flex items-start gap-2 border-b border-gray-100 px-3 py-2 text-xs last:border-0">
                  {r.estado === "duplicado" ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                  )}
                  <span>
                    Fila {r.fila} {r.nombre ? `(${r.nombre})` : ""}: {r.mensaje}
                  </span>
                </div>
              ))}
            {resultado.errores === 0 && resultado.duplicados === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-institucional-700">
                <CheckCircle2 className="h-4 w-4" /> Todos los registros se importaron sin problemas.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
