import { useEffect, useState } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { apiFetch } from "@/api/client";

type Obra = {
  id: string;
  titulo: string;
  categoria: string;
  lat: number;
  lng: number;
  municipio: { nombre: string };
};

const CATEGORIA_COLOR: Record<string, string> = {
  EDUCACION: "#2563eb",
  SALUD: "#dc2626",
  VIALIDAD: "#f59e0b",
  VIVIENDA: "#7c3aed",
  DEPORTE: "#0891b2",
  AGUA_SANEAMIENTO: "#0d9488",
  ELECTRICIDAD: "#ca8a04",
  SEGURIDAD: "#4b5563",
  OTRA: "#1f7a34",
};

export default function MapaObrasScreen() {
  const router = useRouter();
  const [obras, setObras] = useState<Obra[]>([]);
  const [region, setRegion] = useState({
    latitude: 18.7357,
    longitude: -70.1627,
    latitudeDelta: 3,
    longitudeDelta: 3,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Obra[]>("/obras/publicas", {}, false)
      .then(setObras)
      .finally(() => setLoading(false));

    Location.requestForegroundPermissionsAsync().then(async ({ status }) => {
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      setRegion((r) => ({ ...r, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
    });
  }, []);

  if (loading) {
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
        initialRegion={region}
      >
        {obras.map((o) => (
          <Marker
            key={o.id}
            coordinate={{ latitude: o.lat, longitude: o.lng }}
            pinColor={CATEGORIA_COLOR[o.categoria] ?? "#1f7a34"}
            title={o.titulo}
            description={o.municipio.nombre}
            onCalloutPress={() => router.push(`/obra/${o.id}`)}
          />
        ))}
      </MapView>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{obras.length} obras de gobierno registradas</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  footer: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footerText: { fontSize: 12, color: "#374151" },
});
