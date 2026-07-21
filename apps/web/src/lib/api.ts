export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getTokens() {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem("cayena_access_token"),
    refreshToken: localStorage.getItem("cayena_refresh_token"),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("cayena_access_token", accessToken);
  localStorage.setItem("cayena_refresh_token", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("cayena_access_token");
  localStorage.removeItem("cayena_refresh_token");
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
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem("cayena_access_token", data.accessToken);
  return data.accessToken as string;
}

export async function uploadFile(file: File): Promise<{ url: string }> {
  const { accessToken } = getTokens();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "No se pudo subir el archivo");
  }
  return res.json();
}

export function resolveFileUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export async function uploadCsv<T = unknown>(path: string, file: File): Promise<T> {
  const { accessToken } = getTokens();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "No se pudo subir el archivo");
  }
  return res.json();
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken } = getTokens();
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
