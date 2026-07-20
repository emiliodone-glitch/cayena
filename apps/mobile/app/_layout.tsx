import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/api/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#1f7a34" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: "#1f7a34" }, headerTintColor: "#fff" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="obra/[id]" options={{ title: "Detalle de obra" }} />
      </Stack>
    </AuthProvider>
  );
}
