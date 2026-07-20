import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch, API_URL } from "@/api/client";

function resolveUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

type Obra = {
  id: string;
  titulo: string;
  resena: string;
  categoria: string;
  fotos: string[];
  provincia: { nombre: string };
  municipio: { nombre: string };
};

export default function DetalleObraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [obra, setObra] = useState<Obra | null>(null);

  useEffect(() => {
    apiFetch<Obra>(`/obras/publicas/${id}`, {}, false).then(setObra);
  }, [id]);

  if (!obra) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f7a34" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      {obra.fotos[0] ? (
        <Image source={{ uri: resolveUrl(obra.fotos[0]) }} style={styles.foto} />
      ) : (
        <View style={[styles.foto, styles.fotoPlaceholder]} />
      )}
      <View style={styles.body}>
        <Text style={styles.categoria}>{obra.categoria.replace("_", " ")}</Text>
        <Text style={styles.titulo}>{obra.titulo}</Text>
        <Text style={styles.resena}>{obra.resena}</Text>
        <Text style={styles.ubicacion}>
          📍 {obra.municipio.nombre}, {obra.provincia.nombre}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  foto: { width: "100%", height: 220, backgroundColor: "#d6f5dd" },
  fotoPlaceholder: {},
  body: { padding: 20 },
  categoria: { fontSize: 12, color: "#1f7a34", fontWeight: "700", textTransform: "uppercase" },
  titulo: { fontSize: 22, fontWeight: "700", marginTop: 4, color: "#123f1c" },
  resena: { fontSize: 15, color: "#374151", marginTop: 12, lineHeight: 22 },
  ubicacion: { fontSize: 13, color: "#6b7280", marginTop: 16 },
});
