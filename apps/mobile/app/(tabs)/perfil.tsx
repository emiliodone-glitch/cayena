import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/api/auth";
import { apiFetch, ApiError } from "@/api/client";

type Dirigente = {
  id: string;
  nombre: string;
  telefono: string | null;
  role: string;
  secretaria: { nombre: string } | null;
};

export default function PerfilScreen() {
  const { user, login, logout, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dirigentes, setDirigentes] = useState<Dirigente[]>([]);

  useEffect(() => {
    apiFetch<Dirigente[]>("/usuarios/directorio", {}, false).then(setDirigentes);
  }, []);

  async function handleLogin() {
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    }
  }

  if (loading) return null;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ padding: 20 }}
      data={dirigentes}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 20 }}>
          {user ? (
            <View style={styles.perfilCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{user.nombre.charAt(0)}</Text>
              </View>
              <Text style={styles.nombre}>{user.nombre}</Text>
              <Text style={styles.rol}>{user.role}</Text>
              <TouchableOpacity style={styles.botonSecundario} onPress={logout}>
                <Text style={styles.botonSecundarioTexto}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.perfilCard}>
              <Text style={styles.tituloLogin}>Acceso de dirigencia / equipo</Text>
              <TextInput
                style={styles.input}
                placeholder="Correo"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity style={styles.boton} onPress={handleLogin}>
                <Text style={styles.botonTexto}>Ingresar</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.seccion}>Directorio de dirigentes</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.dirigenteRow}>
          <Text style={styles.dirigenteNombre}>{item.nombre}</Text>
          <Text style={styles.dirigenteMeta}>
            {item.secretaria?.nombre ?? "—"} · {item.telefono ?? "sin teléfono"}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  perfilCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1f7a34",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarTexto: { color: "white", fontSize: 22, fontWeight: "700" },
  nombre: { fontSize: 17, fontWeight: "700", color: "#123f1c" },
  rol: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  tituloLogin: { fontSize: 15, fontWeight: "700", color: "#123f1c", marginBottom: 12, alignSelf: "flex-start" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 15,
  },
  error: { color: "#dc2626", fontSize: 12, marginBottom: 8, alignSelf: "flex-start" },
  boton: { width: "100%", backgroundColor: "#1f7a34", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  botonTexto: { color: "white", fontWeight: "700" },
  botonSecundario: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 },
  botonSecundarioTexto: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  seccion: { marginTop: 24, fontSize: 13, fontWeight: "700", color: "#374151", textTransform: "uppercase" },
  dirigenteRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  dirigenteNombre: { fontSize: 14, fontWeight: "600", color: "#123f1c" },
  dirigenteMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
});
