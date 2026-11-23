import pg from "pg";
import type { Entry, Store } from "./db.js";

// Connection strings for managed databases usually need ?sslmode=require
export function postgresStore(url: string): Store {
  let connectionString = url;
  try {
    const u = new URL(url);
    if (u.searchParams.get("sslmode") === "require") {
      u.searchParams.set("sslmode", "no-verify");
      connectionString = u.toString();
    }
  } catch {}

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  return {
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGINT PRIMARY KEY,
          display_name TEXT NOT NULL,
          access_token TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS entries (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('trace', 'changeset')),
          osm_id BIGINT NOT NULL,
          name TEXT NOT NULL,
          lat DOUBLE PRECISION,
          lon DOUBLE PRECISION,
          created_at TIMESTAMPTZ,
          raw JSONB NOT NULL,
          UNIQUE (user_id, kind, osm_id)
        );
        CREATE INDEX IF NOT EXISTS entries_user_created ON entries (user_id, created_at DESC);`);
    },

    async upsertUser(id, displayName, token) {
      await pool.query(
        `INSERT INTO users (id, display_name, access_token) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, access_token = EXCLUDED.access_token`,
        [id, displayName, token]);
    },

    async getUser(id) {
      const { rows } = await pool.query("SELECT id, display_name FROM users WHERE id = $1", [id]);
      return rows[0] && { id: Number(rows[0].id), display_name: rows[0].display_name };
    },

    async createSession(sid, userId) {
      await pool.query("INSERT INTO sessions (id, user_id) VALUES ($1, $2)", [sid, userId]);
    },

    async getSession(sid) {
      const { rows } = await pool.query(
        `SELECT u.id, u.access_token FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.created_at > now() - interval '7 days'`, [sid]);
      return rows[0] && { id: Number(rows[0].id), access_token: rows[0].access_token };
    },

    async deleteSession(sid) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [sid]);
    },

    async saveEntries(userId, entries: Entry[]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const e of entries) {
          await client.query(
            `INSERT INTO entries (user_id, kind, osm_id, name, lat, lon, created_at, raw)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id, kind, osm_id) DO UPDATE SET
               name = EXCLUDED.name, lat = EXCLUDED.lat, lon = EXCLUDED.lon, raw = EXCLUDED.raw`,
            [userId, e.kind, e.osm_id, e.name, e.lat, e.lon, e.created_at, JSON.stringify(e.raw)]);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },

    async queryEntries(userId, q) {
      const params: unknown[] = [userId];
      const where = ["user_id = $1"];
      if (q.kind) { params.push(q.kind); where.push(`kind = $${params.length}`); }
      if (q.search) { params.push(q.search); where.push(`strpos(lower(name), lower($${params.length})) > 0`); }
      const w = where.join(" AND ");
      const count = await pool.query(`SELECT COUNT(*) AS n FROM entries WHERE ${w}`, params);
      params.push(q.limit, q.offset);
      // q.sort and q.dir are whitelisted by the route, never raw user input
      const { rows } = await pool.query(
        `SELECT kind, osm_id::float8 AS osm_id, name, lat, lon, created_at FROM entries WHERE ${w}
         ORDER BY ${q.sort} ${q.dir === "asc" ? "ASC" : "DESC"} NULLS LAST, id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { rows, total: Number(count.rows[0].n) };
    },
    async listEntries(userId) {
      // osm_id is cast because node-postgres returns BIGINT as a string
      const { rows } = await pool.query(
        `SELECT kind, osm_id::float8 AS osm_id, name, lat, lon, created_at FROM entries
         WHERE user_id = $1 ORDER BY created_at DESC NULLS LAST`, [userId]);
      return rows;
    },
    async listPublicUsers() {
      const { rows } = await pool.query(`
        SELECT u.id, u.display_name,
               e.lat, e.lon,
               cnt.entry_count::int
        FROM users u
        JOIN (SELECT user_id, COUNT(*) AS entry_count FROM entries GROUP BY user_id) cnt
          ON cnt.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT lat, lon FROM entries
          WHERE user_id = u.id AND lat IS NOT NULL
          ORDER BY created_at DESC NULLS LAST LIMIT 1
        ) e ON true
        ORDER BY u.display_name
      `);
      return rows.map(r => ({
        id: Number(r.id),
        display_name: r.display_name,
        lat: r.lat,
        lon: r.lon,
        entry_count: r.entry_count,
      }));
    },
  };
}
