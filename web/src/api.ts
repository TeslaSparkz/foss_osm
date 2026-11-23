export interface Entry {
  kind: "trace" | "changeset";
  osm_id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  created_at: string | null;
}
export interface Me { id: number; display_name: string }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (!res.ok) throw new Error(res.status === 401 ? "unauthenticated" : ((await res.json().catch(() => ({}))).error ?? "Request failed"));
  return res.json();
}

export const getMe = () => request<Me>("/api/me");
export const getEntries = () => request<Entry[]>("/api/entries");
export const sync = () => request<{ synced: number }>("/api/sync", { method: "POST" });
export const logout = () => request("/auth/logout", { method: "POST" });

export interface Page { rows: Entry[]; total: number; page: number; pageSize: number }
export interface TableQuery { search: string; kind: string; sort: string; dir: string; page: number }

export const queryEntries = (p: TableQuery, pageSize: number) =>
  request<Page>("/api/entries/table?" + new URLSearchParams({
    search: p.search, kind: p.kind, sort: p.sort, dir: p.dir, page: String(p.page), pageSize: String(pageSize),
  }));

export interface PublicUser {
  id: number;
  display_name: string;
  lat: number | null;
  lon: number | null;
  entry_count: number;
}

export const getPublicUsers = () => request<PublicUser[]>("/api/public/users");
