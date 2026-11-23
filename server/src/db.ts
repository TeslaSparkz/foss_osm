export interface Entry {
  kind: "trace" | "changeset";
  osm_id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  created_at: string | null;
  raw: unknown;
}

export interface EntryQuery {
  kind?: "trace" | "changeset";
  search?: string;
  sort: "created_at" | "name" | "kind";
  dir: "asc" | "desc";
  limit: number;
  offset: number;
}

/** Every database backend implements this, so the rest of the app never touches SQL. */
export interface Store {
  init(): Promise<void>;
  upsertUser(id: number, displayName: string, encryptedToken: string): Promise<void>;
  getUser(id: number): Promise<{ id: number; display_name: string } | undefined>;
  createSession(sid: string, userId: number): Promise<void>;
  getSession(sid: string): Promise<{ id: number; access_token: string } | undefined>;
  deleteSession(sid: string): Promise<void>;
  saveEntries(userId: number, entries: Entry[]): Promise<void>;
  listEntries(userId: number): Promise<unknown[]>;
  /** Filtered, sorted, paginated rows for the table view. */
  queryEntries(userId: number, q: EntryQuery): Promise<{ rows: unknown[]; total: number }>;
  /** Public: all users who have synced, with representative lat/lon from their latest entry. */
  listPublicUsers(): Promise<{ id: number; display_name: string; lat: number | null; lon: number | null; entry_count: number }[]>;
}

/** DATABASE_URL set → PostgreSQL (production). Otherwise a local SQLite file (development). */
export async function createStore(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) return (await import("./db.postgres.js")).postgresStore(url);
  return (await import("./db.sqlite.js")).sqliteStore(process.env.SQLITE_PATH ?? "osm.db");
}
