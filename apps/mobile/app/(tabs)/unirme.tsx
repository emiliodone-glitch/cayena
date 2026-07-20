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
import { apiFetch, ApiError } from "@/api/client";

type Lista = { id: string; nombre: string }[];

export default function UnirmeScreen() {
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
    setEnviando(true);
    try {
      await apiFetch(
        "/militantes/registro-publico",
        {
          method: "POST",
          body: JSON.stringify({
            nombre,
            cedula,
            telefono,
            provinciaId,
            municipioId,
            lat: coords?.lat,
            lng: coords?.lng,
            consentimientoDatos: true,
          }),
        },
        false,
      );
      setEnviado(true);
    } catch (err) {
      Alert.alert("No se pudo registrar", err instanceof ApiError ? err.message : "Intenta de nuevo");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <View style={styles.center}>
        <Text style={styles.exitoTitulo}>¡Bienvenido a Fuerza del Pueblo!</Text>
        <Text style={styles.exitoTexto}>Tu registro fue recibido correctamente.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={styles.container}>
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
});
