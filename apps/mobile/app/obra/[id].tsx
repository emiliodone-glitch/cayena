import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch, API_URL } from "@/api/client";
import { abrirComoLlegar } from "@/lib/mapas";

function resolveUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

type Obra = {
  id: string;
  titulo: string;
  resena: string;
  categoria: string;
  fotos: string[];
  fotosAntes: string[];
  lat: number;
  lng: number;
  fechaInauguracion: string | null;
  inversion: string | null;
  beneficiarios: string | null;
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

        <View style={styles.datos}>
          <Text style={styles.ubicacion}>
            📍 {obra.municipio.nombre}, {obra.provincia.nombre}
          </Text>
          {obra.fechaInauguracion && (
            <Text style={styles.dato}>
              Inaugurada: {new Date(obra.fechaInauguracion).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}
            </Text>
          )}
          {obra.inversion != null && (
            <Text style={styles.dato}>Inversión: {fmtMoney.format(Number(obra.inversion))}</Text>
          )}
          {obra.beneficiarios && <Text style={styles.dato}>Beneficiarios: {obra.beneficiarios}</Text>}
        </View>

        <TouchableOpacity onPress={() => abrirComoLlegar(obra.lat, obra.lng, obra.titulo)}>
          <Text style={styles.comoLlegar}>Cómo llegar →</Text>
        </TouchableOpacity>

        {obra.fotosAntes.length > 0 && (
          <>
            <Text style={styles.seccion}>Antes</Text>
            <View style={styles.galeria}>
              {obra.fotosAntes.map((f) => (
                <Image key={f} source={{ uri: resolveUrl(f) }} style={styles.miniatura} />
              ))}
            </View>
          </>
        )}

        {obra.fotos.length > 1 && (
          <>
            <Text style={styles.seccion}>Después</Text>
            <View style={styles.galeria}>
              {obra.fotos.slice(1).map((f) => (
                <Image key={f} source={{ uri: resolveUrl(f) }} style={styles.miniatura} />
              ))}
            </View>
          </>
        )}
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
  datos: { marginTop: 16, gap: 4 },
  ubicacion: { fontSize: 13, color: "#6b7280" },
  dato: { fontSize: 13, color: "#6b7280" },
  comoLlegar: { fontSize: 13, color: "#1f7a34", fontWeight: "700", marginTop: 10 },
  seccion: { marginTop: 24, fontSize: 13, fontWeight: "700", color: "#374151", textTransform: "uppercase" },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  miniatura: { width: 96, height: 96, borderRadius: 8, backgroundColor: "#f3f4f6" },
});
