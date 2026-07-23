import { useEffect, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator, ScrollView } from "react-native";
import MapView, { Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";
import { useAuth } from "@/api/auth";
import { apiFetch } from "@/api/client";

type Propiedades = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: EstadoAvance;
  estancada?: boolean;
};

type Feature = {
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  properties: Propiedades;
};

type FeatureCollection = { features: Feature[] };

// Un municipio/distrito con varias partes separadas (islas, penínsulas) es
// un MultiPolygon; el resto son Polygon simples. Se ignoran los huecos (RD
// no tiene provincias con huecos reales) y solo se usa el anillo exterior
// de cada parte — suficiente para el choropleth, no hace falta la precisión
// que sí necesita el mapa web con sus etiquetas.
function partesDe(geometry: Feature["geometry"]): number[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates[0] as number[][]];
  return (geometry.coordinates as number[][][][]).map((parte) => parte[0]);
}

// RF: mapa interno de militantes por provincia (Cayena) — vista de solo
// lectura para el coordinador de zona en el campo, con el mismo semáforo y
// datos que el back office. No repite el drill-down completo del mapa web
// (municipio/distrito) por ahora: la vista nacional por provincia es la que
// más falta hace para consultar el propio territorio desde el teléfono.
export default function MapaMilitantesScreen() {
  const { user } = useAuth();
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState(false);
  const [seleccion, setSeleccion] = useState<Propiedades | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<FeatureCollection>("/geo/provincias")
      .then(setGeo)
      .catch(() => setError(true));
  }, [user]);

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.mensaje}>Inicia sesión desde la pestaña Perfil para ver el mapa de militantes.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.mensaje}>No se pudo cargar el mapa. Verifica tu conexión e inténtalo de nuevo.</Text>
      </View>
    );
  }

  if (!geo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f7a34" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={{ latitude: 18.89, longitude: -70.35, latitudeDelta: 3.4, longitudeDelta: 3.4 }}
      >
        {geo.features.flatMap((f) => {
          const props = f.properties;
          const color = COLOR_ESTADO[props.estado] ?? COLOR_ESTADO.rojo;
          return partesDe(f.geometry).map((anillo, i) => (
            <Polygon
              key={`${props.id}-${i}`}
              coordinates={anillo.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
              fillColor={`${color}b3`}
              strokeColor={props.estancada ? "#991b1b" : "#ffffff"}
              strokeWidth={1.5}
              tappable
              onPress={() => setSeleccion(props)}
            />
          ));
        })}
      </MapView>

      {seleccion && (
        <ScrollView style={styles.panel} contentContainerStyle={{ padding: 14 }}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitulo}>{seleccion.nombre}</Text>
            {seleccion.estancada && <Text style={styles.badgeEstancada}>ESTANCADA</Text>}
          </View>
          <View style={styles.panelFila}>
            <View style={styles.panelDato}>
              <Text style={styles.panelLabel}>Captados</Text>
              <Text style={styles.panelValor}>{seleccion.militantesCaptados.toLocaleString("es-DO")}</Text>
            </View>
            <View style={styles.panelDato}>
              <Text style={styles.panelLabel}>Meta</Text>
              <Text style={styles.panelValor}>{seleccion.meta.toLocaleString("es-DO")}</Text>
            </View>
            <View style={styles.panelDato}>
              <Text style={styles.panelLabel}>Avance</Text>
              <Text style={[styles.panelValor, { color: COLOR_ESTADO[seleccion.estado] }]}>
                {seleccion.porcentaje}%
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  mensaje: { textAlign: "center", color: "#6b7280" },
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: 140,
    backgroundColor: "white",
    borderRadius: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitulo: { fontSize: 16, fontWeight: "700", color: "#123f1c" },
  badgeEstancada: {
    fontSize: 10,
    fontWeight: "700",
    color: "#991b1b",
    backgroundColor: "#fef2f2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  panelFila: { flexDirection: "row", gap: 20, marginTop: 8 },
  panelDato: { alignItems: "flex-start" },
  panelLabel: { fontSize: 10, color: "#9ca3af", textTransform: "uppercase" },
  panelValor: { fontSize: 15, fontWeight: "700", color: "#123f1c", marginTop: 2 },
});
