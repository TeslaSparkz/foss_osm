import { XMLParser } from "fast-xml-parser";
import type { Entry } from "./db.js";

const BASE = process.env.OSM_BASE ?? "https://www.openstreetmap.org";
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function osmGet(path: string, token: string): Promise<Response> {
  const res = await fetch(`${BASE}/api/0.6/${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "osm-sync/1.0" },
  });
  if (!res.ok) throw new Error(`OSM ${path} failed: ${res.status}`);
  return res;
}

export async function exchangeCode(code: string) {
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI!,
      client_id: process.env.OSM_CLIENT_ID!,
      client_secret: process.env.OSM_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return (await res.json()) as { access_token: string };
}

export async function fetchUser(token: string) {
  const data = (await (await osmGet("user/details.json", token)).json()) as any;
  return { id: data.user.id as number, displayName: data.user.display_name as string };
}

/** GPS traces uploaded by the user (needs read_gpx). The API returns the first page of traces. */
async function fetchTraces(token: string): Promise<Entry[]> {
  const doc = xml.parse(await (await osmGet("user/gpx_files", token)).text());
  return asArray<any>(doc.osm?.gpx_file).map((f) => ({
    kind: "trace" as const,
    osm_id: Number(f.id),
    name: String(f.name),
    lat: f.lat !== undefined ? Number(f.lat) : null,
    lon: f.lon !== undefined ? Number(f.lon) : null,
    created_at: f.timestamp ?? null,
    raw: f,
  }));
}

/** Areas the user has edited. Pages backwards through changesets, 100 at a time. */
async function fetchChangesets(token: string, userId: number): Promise<Entry[]> {
  const out: Entry[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = `changesets.json?user=${userId}&limit=100` + (before ? `&time=2000-01-01,${before}` : "");
    const { changesets } = (await (await osmGet(q, token)).json()) as { changesets: any[] };
    if (!changesets.length) break;
    for (const c of changesets) {
      const hasBox = c.min_lat !== undefined;
      out.push({
        kind: "changeset",
        osm_id: c.id,
        name: c.tags?.comment ?? `Changeset ${c.id}`,
        lat: hasBox ? (c.min_lat + c.max_lat) / 2 : null,
        lon: hasBox ? (c.min_lon + c.max_lon) / 2 : null,
        created_at: c.created_at,
        raw: c,
      });
    }
    if (changesets.length < 100) break;
    // Walk back in time; the API orders newest first. Duplicates are harmless (upsert).
    before = changesets[changesets.length - 1].created_at;
  }
  return out;
}

export async function fetchAllEntries(token: string, userId: number): Promise<Entry[]> {
  const [traces, changesets] = await Promise.all([fetchTraces(token), fetchChangesets(token, userId)]);
  return [...traces, ...changesets];
}
