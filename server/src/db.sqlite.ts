import Database from "better-sqlite3";
import type { Entry, Store } from "./db.js";

export function sqliteStore(file: string): Store {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const upsertEntry = db.prepare(`
    INSERT INTO entries (user_id, kind, osm_id, name, lat, lon, created_at, raw)
    VALUES (@user_id, @kind, @osm_id, @name, @lat, @lon, @created_at, @raw)
    ON CONFLICT (user_id, kind, osm_id) DO UPDATE SET
      name = excluded.name, lat = excluded.lat, lon = excluded.lon, raw = excluded.raw`);
  const saveAll = db.transaction((userId: number, entries: Entry[]) => {
    for (const e of entries) upsertEntry.run({ ...e, user_id: userId, raw: JSON.stringify(e.raw) });
  });

  return {
    async init() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, access_token TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, osm_id INTEGER NOT NULL, name TEXT NOT NULL,
          lat REAL, lon REAL, created_at TEXT, raw TEXT NOT NULL,
          UNIQUE (user_id, kind, osm_id));`);
      // Databases created by an earlier version have a sessions table without created_at
      const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
      if (!cols.some((c) => c.name === "created_at")) {
        db.exec("ALTER TABLE sessions ADD COLUMN created_at TEXT");
        db.exec("UPDATE sessions SET created_at = datetime('now')");
      }
    },
    async upsertUser(id, displayName, token) {
      db.prepare(`INSERT INTO users (id, display_name, access_token) VALUES (?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, access_token = excluded.access_token`)
        .run(id, displayName, token);
    },
    async getUser(id) {
      return db.prepare("SELECT id, display_name FROM users WHERE id = ?").get(id) as any;
    },
    async createSession(sid, userId) {
      db.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, datetime('now'))").run(sid, userId);
    },
    async getSession(sid) {
      return db.prepare(`SELECT u.id, u.access_token FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.created_at > datetime('now', '-7 days')`).get(sid) as any;
    },
    async deleteSession(sid) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    },
    async saveEntries(userId, entries) { saveAll(userId, entries); },
    async queryEntries(userId, q) {
      const where = ["user_id = @userId"];
      const p: Record<string, unknown> = { userId };
      if (q.kind) { where.push("kind = @kind"); p.kind = q.kind; }
      if (q.search) { where.push("instr(lower(name), lower(@search)) > 0"); p.search = q.search; }
      const w = where.join(" AND ");
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${w}`).get(p) as { n: number }).n;
      // q.sort and q.dir are whitelisted by the route, never raw user input
      const rows = db.prepare(`SELECT kind, osm_id, name, lat, lon, created_at FROM entries WHERE ${w}
        ORDER BY ${q.sort} ${q.dir === "asc" ? "ASC" : "DESC"}, id DESC LIMIT @limit OFFSET @offset`)
        .all({ ...p, limit: q.limit, offset: q.offset });
      return { rows, total };
    },
    async listEntries(userId) {
      return db.prepare(`SELECT kind, osm_id, name, lat, lon, created_at FROM entries
        WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
    },
    async listPublicUsers() {
      return db.prepare(`
        SELECT u.id, u.display_name,
               e.lat, e.lon,
               cnt.entry_count
        FROM users u
        JOIN (SELECT user_id, COUNT(*) AS entry_count FROM entries GROUP BY user_id) cnt
          ON cnt.user_id = u.id
        LEFT JOIN entries e ON e.user_id = u.id AND e.lat IS NOT NULL
          AND e.id = (SELECT id FROM entries WHERE user_id = u.id AND lat IS NOT NULL ORDER BY created_at DESC LIMIT 1)
        ORDER BY u.display_name COLLATE NOCASE
      `).all() as any[];
    },
  };
}
