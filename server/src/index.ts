import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { createStore } from "./db.js";
import { decrypt, encrypt, hasEncryptionKey } from "./crypto.js";
import { exchangeCode, fetchAllEntries, fetchUser } from "./osm.js";

const {
  OSM_CLIENT_ID, REDIRECT_URI, PORT = "3001", STATIC_DIR,
  WEB_ORIGIN = "https://localhost:5173", NODE_ENV,
} = process.env;
const BASE = process.env.OSM_BASE ?? "https://www.openstreetmap.org";

if (NODE_ENV === "production" && !hasEncryptionKey) throw new Error("Set TOKEN_ENC_KEY in production");
if (NODE_ENV === "production" && !process.env.DATABASE_URL) console.warn("DATABASE_URL not set: using SQLite");

const store = await createStore();
await store.init();

interface Authed extends Request { userId: number; token: string }

const app = express();
app.set("trust proxy", 1); // running behind an HTTPS reverse proxy / platform router
app.use(express.json(), cookieParser());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Public endpoint: all users who have synced data (no auth required)
app.get("/api/public/users", async (_req, res) => {
  try { res.json(await store.listPublicUsers()); }
  catch (e) { console.error(e); res.status(500).json({ error: "Failed to load users" }); }
});

app.get("/auth/login", (_req, res) => {
  const url = new URL(`${BASE}/oauth2/authorize`);
  url.search = new URLSearchParams({
    client_id: OSM_CLIENT_ID!, redirect_uri: REDIRECT_URI!,
    response_type: "code", scope: "read_prefs read_gpx",
  }).toString();
  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  try {
    const { access_token } = await exchangeCode(String(req.query.code));
    const user = await fetchUser(access_token);
    await store.upsertUser(user.id, user.displayName, encrypt(access_token));
    const sid = crypto.randomBytes(32).toString("hex");
    await store.createSession(sid, user.id);
    res.cookie("sid", sid, { httpOnly: true, sameSite: "lax", secure: WEB_ORIGIN.startsWith("https://"), maxAge: 7 * 864e5 });
    res.redirect(WEB_ORIGIN);
  } catch (e) {
    console.error(e);
    res.status(500).send("Sign-in failed. Close this tab and try again.");
  }
});

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await store.getSession(req.cookies.sid ?? "");
    if (!row) return void res.status(401).json({ error: "Not signed in" });
    Object.assign(req, { userId: row.id, token: decrypt(row.access_token) });
    next();
  } catch (e) { next(e); }
}

app.get("/api/me", requireAuth, async (req, res) => res.json(await store.getUser((req as Authed).userId)));
app.get("/api/entries", requireAuth, async (req, res) => res.json(await store.listEntries((req as Authed).userId)));

app.get("/api/entries/table", requireAuth, async (req, res) => {
  const q = req.query;
  const sorts = ["created_at", "name", "kind"] as const;
  const sort = sorts.find((s) => s === q.sort) ?? "created_at";
  const kind = q.kind === "trace" || q.kind === "changeset" ? q.kind : undefined;
  const pageSize = Math.min(Math.max(Number(q.pageSize) || 25, 1), 100);
  const page = Math.max(Number(q.page) || 1, 1);
  const result = await store.queryEntries((req as Authed).userId, {
    kind, sort, dir: q.dir === "asc" ? "asc" : "desc",
    search: String(q.search ?? "").trim().slice(0, 100) || undefined,
    limit: pageSize, offset: (page - 1) * pageSize,
  });
  res.json({ ...result, page, pageSize });
});

app.post("/api/sync", requireAuth, async (req, res) => {
  const { userId, token } = req as Authed;
  try {
    const entries = await fetchAllEntries(token, userId);
    await store.saveEntries(userId, entries);
    res.json({ synced: entries.length });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Sync failed. Try again in a moment." });
  }
});

app.post("/auth/logout", async (req, res) => {
  await store.deleteSession(req.cookies.sid ?? "");
  res.clearCookie("sid").json({ ok: true });
});

// Production: the built Solid app is served by this same server (one origin, one HTTPS domain)
// Without Docker, `npm run build` puts the site in web/dist, which is picked up automatically in production.
const builtWeb = path.resolve(import.meta.dirname, "../../web/dist");
const staticDir = STATIC_DIR ?? (NODE_ENV === "production" && existsSync(builtWeb) ? builtWeb : undefined);
if (staticDir) {
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => res.sendFile(path.resolve(staticDir, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
});

app.listen(Number(PORT), "0.0.0.0", () => console.log(`Listening on :${PORT}`));
