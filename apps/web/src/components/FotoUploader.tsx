"use client";

import { useRef, useState } from "react";
import { resolveFileUrl, uploadFile } from "@/lib/api";

export function FotoUploader({
  fotos,
  onChange,
}: {
  fotos: string[];
  onChange: (fotos: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      const { url } = await uploadFile(file);
      onChange([...fotos, url]);
    } catch {
      setError("No se pudo subir la foto (máx. 5MB, JPG/PNG/WEBP/GIF)");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function quitar(url: string) {
    onChange(fotos.filter((f) => f !== url));
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {fotos.map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
            <img src={resolveFileUrl(url)} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => quitar(url)}
              className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-black/60 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xl text-gray-400 hover:border-institucional-600 hover:text-institucional-600"
        >
          {subiendo ? "…" : "+"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
