import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, API_URL } from "@/api/client";
import { MI_MILITANTE_ID_KEY } from "@/lib/carnet";

function resolveUrl(url: string) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

function abrirComoLlegar(lat: number, lng: number, etiqueta: string) {
  const url = Platform.select({
    ios: `maps:0,0?q=${etiqueta}@${lat},${lng}`,
    android: `geo:0,0?q=${lat},${lng}(${etiqueta})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });
  Linking.openURL(url!).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
}

type Actividad = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  fotos: string[];
  confirmados: number;
  secretaria: { nombre: string };
};

export default function DetalleActividadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [militanteId, setMilitanteId] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch<Actividad>(`/actividades/publicas/${id}`, {}, false).then(setActividad);
  }, [id]);

  useEffect(() => {
    cargar();
    AsyncStorage.getItem(MI_MILITANTE_ID_KEY).then(setMilitanteId);
  }, [cargar]);

  useEffect(() => {
    if (!militanteId) return;
    apiFetch<{ confirmado: boolean | null }>(`/actividades/publicas/${id}/rsvp/${militanteId}`, {}, false).then((r) =>
      setConfirmado(r.confirmado),
    );
  }, [id, militanteId]);

  async function toggleRsvp() {
    if (!militanteId) return;
    setEnviando(true);
    const nuevoEstado = !confirmado;
    try {
      await apiFetch(`/actividades/publicas/${id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ militanteId, confirmado: nuevoEstado }),
      }, false);
      setConfirmado(nuevoEstado);
      cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (!actividad) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f7a34" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      {actividad.fotos[0] ? (
        <Image source={{ uri: resolveUrl(actividad.fotos[0]) }} style={styles.foto} />
      ) : (
        <View style={[styles.foto, styles.fotoPlaceholder]} />
      )}
      <View style={styles.body}>
        <Text style={styles.secretaria}>{actividad.secretaria.nombre}</Text>
        <Text style={styles.titulo}>{actividad.titulo}</Text>
        {actividad.descripcion && <Text style={styles.descripcion}>{actividad.descripcion}</Text>}
        <Text style={styles.meta}>
          {new Date(actividad.fecha).toLocaleString("es-DO", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
        {actividad.ubicacion && <Text style={styles.meta}>📍 {actividad.ubicacion}</Text>}
        {actividad.lat != null && actividad.lng != null && (
          <TouchableOpacity onPress={() => abrirComoLlegar(actividad.lat!, actividad.lng!, actividad.titulo)}>
            <Text style={styles.comoLlegar}>Cómo llegar →</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.confirmados}>{actividad.confirmados} personas confirmaron asistencia</Text>

        {militanteId ? (
          <TouchableOpacity
            style={[styles.boton, confirmado ? styles.botonCancelar : styles.botonConfirmar]}
            onPress={toggleRsvp}
            disabled={enviando}
          >
            <Text style={confirmado ? styles.botonCancelarTexto : styles.botonTexto}>
              {enviando ? "Guardando…" : confirmado ? "Ya no puedo asistir" : "Voy a asistir"}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.aviso}>Regístrate como militante desde la pestaña "Únete" para confirmar tu asistencia.</Text>
        )}

        {actividad.fotos.length > 1 && (
          <>
            <Text style={styles.seccion}>Galería</Text>
            <View style={styles.galeria}>
              {actividad.fotos.map((f) => (
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
  secretaria: { fontSize: 12, color: "#1f7a34", fontWeight: "700", textTransform: "uppercase" },
  titulo: { fontSize: 22, fontWeight: "700", marginTop: 4, color: "#123f1c" },
  descripcion: { fontSize: 15, color: "#374151", marginTop: 12, lineHeight: 22 },
  meta: { fontSize: 13, color: "#6b7280", marginTop: 8 },
  comoLlegar: { fontSize: 13, color: "#1f7a34", fontWeight: "700", marginTop: 6 },
  confirmados: { fontSize: 13, color: "#1f7a34", fontWeight: "600", marginTop: 12 },
  boton: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  botonConfirmar: { backgroundColor: "#1f7a34" },
  botonCancelar: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  botonTexto: { color: "white", fontWeight: "700", fontSize: 15 },
  botonCancelarTexto: { color: "#dc2626", fontWeight: "700", fontSize: 15 },
  aviso: { marginTop: 16, fontSize: 13, color: "#9ca3af", fontStyle: "italic" },
  seccion: { marginTop: 24, fontSize: 13, fontWeight: "700", color: "#374151", textTransform: "uppercase" },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  miniatura: { width: 96, height: 96, borderRadius: 8, backgroundColor: "#f3f4f6" },
});
