"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

type Sugerencia = { label: string; lat: number; lng: number };

// Autocompletado de direcciones sobre Nominatim (OpenStreetMap) — la misma
// fuente de datos que ya usa el mapa de Cayena, gratis y sin API key. Nunca
// bloquea texto libre: si el usuario escribe algo que no coincide con
// ninguna sugerencia, o edita el texto después de elegir una, el campo se
// guarda igual como texto plano, solo que sin coordenadas asociadas.
async function buscarLugares(query: string): Promise<Sugerencia[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "do");
  url.searchParams.set("limit", "5");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data: { display_name: string; lat: string; lon: string }[] = await res.json();
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}

export function UbicacionInput({
  value,
  lat,
  lng,
  onChange,
}: {
  value: string;
  lat: number | null;
  lng: number | null;
  onChange: (v: { ubicacion: string; lat: number | null; lng: number | null }) => void;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const ultimaSeleccionLabel = useRef<string | null>(value && lat != null ? value : null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  function onInputChange(texto: string) {
    // Si el usuario edita el texto después de haber elegido una sugerencia
    // con coordenadas, esas coordenadas ya no corresponden — se limpian para
    // no guardar un pin desactualizado con una etiqueta distinta.
    const seSigueRefiriendoALaSeleccion = ultimaSeleccionLabel.current === texto;
    onChange({ ubicacion: texto, lat: seSigueRefiriendoALaSeleccion ? lat : null, lng: seSigueRefiriendoALaSeleccion ? lng : null });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 3) {
      setSugerencias([]);
      setAbierto(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const resultados = await buscarLugares(texto);
        setSugerencias(resultados);
        setAbierto(resultados.length > 0);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 500);
  }

  function elegir(s: Sugerencia) {
    ultimaSeleccionLabel.current = s.label;
    onChange({ ubicacion: s.label, lat: s.lat, lng: s.lng });
    // Limpiar sugerencias (no solo cerrar) importa: el campo vive dentro de
    // un <label>, así que el click nativo del navegador vuelve a enfocar el
    // input (comportamiento de accesibilidad de <label>) y el onFocus de
    // abajo reabriría el dropdown si sugerencias siguiera teniendo datos.
    setSugerencias([]);
    setAbierto(false);
  }

  return (
    <div ref={contenedorRef} className="relative">
      <input
        className="input"
        value={value}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        placeholder="Escribe una dirección o lugar…"
        autoComplete="off"
      />
      <div className="mt-1 flex items-center gap-1 text-xs">
        {buscando ? (
          <span className="flex items-center gap-1 text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
          </span>
        ) : lat != null && lng != null ? (
          <span className="flex items-center gap-1 text-institucional-600">
            <MapPin className="h-3 w-3" /> Coordenadas guardadas — se podrá ver en el mapa
          </span>
        ) : (
          <span className="text-gray-400">Sin coordenadas — solo se guardará como texto</span>
        )}
      </div>

      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {sugerencias.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => elegir(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-institucional-50"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institucional-600" />
                <span className="text-gray-700">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
