import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const ACCESS_KEY = "cayena_access_token";
const REFRESH_KEY = "cayena_refresh_token";

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.setItem(ACCESS_KEY, accessToken);
  await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tryRefresh(): Promise<string | null> {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await AsyncStorage.setItem(ACCESS_KEY, data.accessToken);
  return data.accessToken as string;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const { accessToken } = auth ? await getTokens() : { accessToken: null };

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...options, headers });
  };

  let res = await doFetch(accessToken);
  if (res.status === 401 && accessToken) {
    const newToken = await tryRefresh();
    if (newToken) res = await doFetch(newToken);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Error de red");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
