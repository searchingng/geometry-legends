import {
  ADMIN_API_PATH,
  type AdminLoginRequest,
  type AdminMatch,
  type AdminPage,
  type AdminUser,
} from "@moba/shared";

export class UnauthorizedError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(ADMIN_API_PATH + path, { credentials: "same-origin", ...init });
  if (response.status === 401) throw new UnauthorizedError("Not signed in");
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pageQuery(search: string, page: number): string {
  return `?${new URLSearchParams({ search, page: String(page) })}`;
}

export const adminApi = {
  session: () => request<{ username: string }>("/session"),
  login: (credentials: AdminLoginRequest) => post<{ username: string }>("/login", credentials),
  logout: () => post<{ ok: true }>("/logout", {}),
  users: (search: string, page: number) => request<AdminPage<AdminUser>>(`/users${pageQuery(search, page)}`),
  matches: (search: string, page: number) => request<AdminPage<AdminMatch>>(`/matches${pageQuery(search, page)}`),
};
