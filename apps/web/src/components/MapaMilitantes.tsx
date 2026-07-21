"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, GeoJSON, TileLayer } from "react-leaflet";
import type { Map as LeafletMap, Layer, LeafletMouseEvent } from "leaflet";
import * as L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { apiFetch } from "@/lib/api";

type Propiedades = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
  provinciaId?: string;
};

type PanelInfo = Propiedades | null;

export function MapaMilitantes({ compacto = false, alto }: { compacto?: boolean; alto?: string }) {
  const [nivel, setNivel] = useState<"nacional" | "municipios">("nacional");
  const [provinciaSeleccionada, setProvinciaSeleccionada] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [panel, setPanel] = useState<PanelInfo>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    setLoading(true);
    // Importante: el layer de <GeoJSON> de react-leaflet es inmutable una vez
    // creado — cambiar solo el prop `data` no redibuja la geometría, hace
    // falta que cambie el `key`. Limpiamos `geo` aquí para que el layer viejo
    // se desmonte de inmediato y el nuevo se monte fresco cuando llegue el fetch.
    setGeo(null);
    const path =
      nivel === "nacional" ? "/geo/provincias" : `/geo/provincias/${provinciaSeleccionada?.id}/municipios`;
    apiFetch<FeatureCollection>(path)
      .then((data) => {
        setGeo(data);
        setPanel(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, provinciaSeleccionada?.id]);

  function estiloFeature(feature?: Feature) {
    const estado = (feature?.properties as Propiedades | undefined)?.estado ?? "rojo";
    return {
      fillColor: COLOR_ESTADO[estado],
      fillOpacity: 0.75,
      color: "#ffffff",
      weight: 1.2,
    };
  }

  function onEachFeature(feature: Feature, layer: Layer) {
    const props = feature.properties as Propiedades;
    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        setPanel(props);
        (e.target as L.Path).setStyle({ weight: 3, color: "#123f1c" });
      },
      mouseout: (e: LeafletMouseEvent) => {
        (e.target as L.Path).setStyle({ weight: 1.2, color: "#ffffff" });
      },
      click: () => {
        if (nivel === "nacional") {
          setProvinciaSeleccionada({ id: props.id, nombre: props.nombre });
          setNivel("municipios");
        } else {
          setPanel(props);
        }
      },
    });
  }

  function volverANacional() {
    setNivel("nacional");
    setProvinciaSeleccionada(null);
    setPanel(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {nivel === "nacional" ? (
            "Vista nacional por provincia"
          ) : (
            <>Municipios de <span className="font-semibold text-institucional-900">{provinciaSeleccionada?.nombre}</span></>
          )}
        </div>
        {nivel === "municipios" && (
          <button
            onClick={volverANacional}
            className="rounded-lg border border-institucional-600 px-3 py-1.5 text-sm font-medium text-institucional-700 hover:bg-institucional-50"
          >
            ← Volver al mapa nacional
          </button>
        )}
      </div>

      <div className={`${alto ?? (compacto ? "h-[380px]" : "h-[520px]")} overflow-hidden rounded-xl border border-gray-200`}>
        <MapContainer
          center={[18.89, -70.16]}
          zoom={8}
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={!compacto}
          dragging={!compacto}
          doubleClickZoom={!compacto}
          touchZoom={!compacto}
          boxZoom={!compacto}
          keyboard={!compacto}
          zoomControl={!compacto}
          attributionControl={!compacto}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geo && (
            <GeoJSON
              key={nivel + (provinciaSeleccionada?.id ?? "")}
              data={geo}
              style={estiloFeature}
              onEachFeature={onEachFeature}
              eventHandlers={{
                add: (e) => {
                  const layer = e.target as L.GeoJSON;
                  const bounds = layer.getBounds();
                  if (!bounds.isValid()) return;
                  const map = mapRef.current;
                  if (!map) return;
                  map.fitBounds(bounds, { padding: [16, 16], animate: false });
                  // En contenedores muy anchos y bajos (ej. el mapa compacto del
                  // dashboard dentro de una grilla de 2 columnas), fitBounds
                  // puede alejar demasiado el zoom para cubrir el ancho y termina
                  // mostrando países vecinos. Forzamos un zoom mínimo razonable
                  // centrado en el propio territorio.
                  const zoomMinimo = compacto ? 9 : 6.8;
                  if (map.getZoom() < zoomMinimo) {
                    map.setView(bounds.getCenter(), zoomMinimo, { animate: false });
                  }
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.rojo }} /> Lejos de meta
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.amarillo }} /> En curso
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ESTADO.verde }} /> Meta cumplida
        </span>
        {loading && <span className="ml-auto animate-pulse">Cargando…</span>}
      </div>

      {/* Panel fijo debajo del mapa (RF-13.3): no es un tooltip flotante. */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {panel ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-gray-400">Demarcación</div>
              <div className="text-base font-semibold text-institucional-900">{panel.nombre}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Militantes captados</div>
              <div className="text-base font-semibold">{panel.militantesCaptados.toLocaleString("es-DO")}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Meta</div>
              <div className="text-base font-semibold">{panel.meta.toLocaleString("es-DO")}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Avance</div>
              <div className="text-base font-semibold" style={{ color: COLOR_ESTADO[panel.estado] }}>
                {panel.porcentaje}%
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Pasa el cursor sobre una demarcación del mapa para ver su detalle aquí.
          </p>
        )}
      </div>
    </div>
  );
}
