import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/api/client";

type Actividad = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ubicacion: string | null;
  secretaria: { nombre: string };
};

export default function FeedScreen() {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  function cargar() {
    return apiFetch<Actividad[]>("/actividades/publicas", {}, false).then(setActividades);
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      contentContainerStyle={{ padding: 16 }}
      data={actividades}
      keyExtractor={(a) => a.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            cargar().finally(() => setRefreshing(false));
          }}
        />
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.secretaria}>{item.secretaria.nombre}</Text>
          <Text style={styles.titulo}>{item.titulo}</Text>
          {item.descripcion && <Text style={styles.descripcion}>{item.descripcion}</Text>}
          <Text style={styles.meta}>
            {new Date(item.fecha).toLocaleDateString("es-DO", { weekday: "short", day: "numeric", month: "short" })}
            {item.ubicacion ? ` · ${item.ubicacion}` : ""}
          </Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.vacio}>No hay actividades publicadas todavía.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  secretaria: { fontSize: 11, color: "#1f7a34", fontWeight: "700", textTransform: "uppercase" },
  titulo: { fontSize: 16, fontWeight: "700", color: "#123f1c", marginTop: 2 },
  descripcion: { fontSize: 13, color: "#4b5563", marginTop: 4 },
  meta: { fontSize: 12, color: "#9ca3af", marginTop: 8 },
  vacio: { textAlign: "center", color: "#9ca3af", marginTop: 40 },
});
