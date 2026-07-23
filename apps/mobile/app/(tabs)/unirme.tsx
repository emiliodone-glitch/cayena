import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, ApiError } from "@/api/client";
import { MI_MILITANTE_ID_KEY, MI_MILITANTE_NOMBRE_KEY } from "@/lib/carnet";
import { encolarRegistro } from "@/lib/offlineQueue";
import { useOffline } from "@/lib/offlineContext";
import { registrarDispositivoPush } from "@/hooks/usePushRegistration";

type Lista = { id: string; nombre: string }[];

export default function UnirmeScreen() {
  const { conectado, pendientes, refrescarPendientes } = useOffline();
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [provinciaId, setProvinciaId] = useState("");
  const [municipioId, setMunicipioId] = useState("");
  const [consiento, setConsiento] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicacionEstado, setUbicacionEstado] = useState("Detectando ubicación…");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [guardadoOffline, setGuardadoOffline] = useState(false);
  const [puntos, setPuntos] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias", {}, false).then(setProvincias);
    Location.requestForegroundPermissionsAsync().then(async ({ status }) => {
      if (status !== "granted") {
        setUbicacionEstado("Ubicación no disponible (permiso denegado)");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setUbicacionEstado("Ubicación detectada automáticamente");
    });
  }, []);

  useEffect(() => {
    if (!provinciaId) return setMunicipios([]);
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${provinciaId}`, {}, false).then(setMunicipios);
  }, [provinciaId]);

  async function registrarme() {
    if (!nombre || !cedula || !telefono || !provinciaId || !municipioId) {
      Alert.alert("Faltan datos", "Completa nombre, cédula, teléfono, provincia y municipio.");
      return;
    }
    if (!consiento) {
      Alert.alert("Consentimiento requerido", "Debes aceptar el uso de tus datos personales (Ley 172-13).");
      return;
    }
    const payload = {
      nombre,
      cedula,
      telefono,
      provinciaId,
      municipioId,
      lat: coords?.lat,
      lng: coords?.lng,
      consentimientoDatos: true as const,
    };

    // Fase 2 — modo offline: si ya sabemos que no hay conexión, encolamos directo.
    if (!conectado) {
      await encolarRegistro(payload);
      refrescarPendientes();
      setGuardadoOffline(true);
      setEnviado(true);
      return;
    }

    setEnviando(true);
    try {
      const militante = await apiFetch<{ id: string }>(
        "/militantes/registro-publico",
        { method: "POST", body: JSON.stringify(payload) },
        false,
      );
      await AsyncStorage.setItem(MI_MILITANTE_ID_KEY, militante.id);
      await AsyncStorage.setItem(MI_MILITANTE_NOMBRE_KEY, nombre);
      registrarDispositivoPush();
      setEnviado(true);
      apiFetch<{ puntos: number }>(`/militantes/mi-progreso/${cedula}`, {}, false)
        .then((p) => setPuntos(p.puntos))
        .catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) {
        Alert.alert("No se pudo registrar", err.message);
      } else {
        // Fallo de red aunque NetInfo reportara conexión: igual lo guardamos para reintentar.
        await encolarRegistro(payload);
        refrescarPendientes();
        setGuardadoOffline(true);
        setEnviado(true);
      }
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <View style={styles.center}>
        <Text style={styles.exitoTitulo}>¡Bienvenido a Fuerza del Pueblo!</Text>
        <Text style={styles.exitoTexto}>
          {guardadoOffline
            ? "No detectamos conexión: tu registro se guardó en el dispositivo y se enviará automáticamente en cuanto recuperes internet."
            : "Tu registro fue recibido correctamente."}
        </Text>
        {puntos !== null && (
          <View style={styles.insigniaBox}>
            <Text style={styles.insigniaTexto}>🏅 Insignia "Bienvenida" obtenida</Text>
            <Text style={styles.insigniaPuntos}>{puntos} puntos</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={styles.container}>
      {!conectado && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerTexto}>
            Sin conexión: tu registro se guardará y enviará automáticamente más tarde.
          </Text>
        </View>
      )}
      {conectado && pendientes > 0 && (
        <View style={styles.offlineBannerInfo}>
          <Text style={styles.offlineBannerInfoTexto}>
            Sincronizando {pendientes} registro{pendientes > 1 ? "s" : ""} pendiente{pendientes > 1 ? "s" : ""}…
          </Text>
        </View>
      )}
      <Text style={styles.header}>Únete a FP</Text>

      <TextInput style={styles.input} placeholder="Nombre completo" value={nombre} onChangeText={setNombre} />
      <TextInput
        style={styles.input}
        placeholder="Cédula"
        value={cedula}
        onChangeText={setCedula}
        keyboardType="number-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
      />

      <View style={styles.pickerRow}>
        {provincias.map((p) => (
          <TouchableOpacity
            key={p.id}
            onPress={() => {
              setProvinciaId(p.id);
              setMunicipioId("");
            }}
            style={[styles.chip, provinciaId === p.id && styles.chipActivo]}
          >
            <Text style={[styles.chipText, provinciaId === p.id && styles.chipTextActivo]}>{p.nombre}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!municipios.length && (
        <View style={styles.pickerRow}>
          {municipios.map((m) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => setMunicipioId(m.id)}
              style={[styles.chip, municipioId === m.id && styles.chipActivo]}
            >
              <Text style={[styles.chipText, municipioId === m.id && styles.chipTextActivo]}>{m.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.ubicacion}>📍 {ubicacionEstado}</Text>

      <View style={styles.consentimientoRow}>
        <Switch value={consiento} onValueChange={setConsiento} trackColor={{ true: "#1f7a34" }} />
        <Text style={styles.consentimientoTexto}>
          Autorizo el uso de mis datos personales conforme a la Ley 172-13.
        </Text>
      </View>

      <TouchableOpacity style={styles.boton} onPress={registrarme} disabled={enviando}>
        <Text style={styles.botonTexto}>{enviando ? "Enviando…" : "Registrarme"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { fontSize: 22, fontWeight: "700", color: "#123f1c", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: "#1f7a34", borderColor: "#1f7a34" },
  chipText: { fontSize: 12, color: "#374151" },
  chipTextActivo: { color: "white", fontWeight: "600" },
  ubicacion: { fontSize: 12, color: "#6b7280", marginBottom: 12 },
  consentimientoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  consentimientoTexto: { flex: 1, fontSize: 12, color: "#4b5563" },
  boton: { backgroundColor: "#1f7a34", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  botonTexto: { color: "white", fontWeight: "700", fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  exitoTitulo: { fontSize: 20, fontWeight: "700", color: "#123f1c", textAlign: "center" },
  exitoTexto: { marginTop: 8, fontSize: 14, color: "#4b5563", textAlign: "center" },
  insigniaBox: {
    marginTop: 20,
    backgroundColor: "#d6f5dd",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  insigniaTexto: { fontSize: 14, fontWeight: "600", color: "#123f1c" },
  insigniaPuntos: { fontSize: 12, color: "#1f7a34", marginTop: 2 },
  offlineBanner: { backgroundColor: "#fef3c7", borderRadius: 10, padding: 10, marginBottom: 14 },
  offlineBannerTexto: { fontSize: 12, color: "#92400e", textAlign: "center" },
  offlineBannerInfo: { backgroundColor: "#e0f2fe", borderRadius: 10, padding: 10, marginBottom: 14 },
  offlineBannerInfoTexto: { fontSize: 12, color: "#075985", textAlign: "center" },
});
