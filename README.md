# OSM Map Sync
Sign in with OpenStreetMap, pull your GPS traces and edit areas (changesets) from the OSM API, store them in SQLite, and see them on a map.

## Setup
1. Register an OAuth2 app at https://www.openstreetmap.org/oauth2/applications/new
   - Redirect URI: `https://localhost:5173/auth/callback` (the Vite dev server serves HTTPS and proxies `/auth` and `/api` to the backend)
   - Confidential application, permissions: `read_prefs`, `read_gpx`
2. `cd server && cp .env.example .env` and fill in the client id/secret.
3. `cd server && npm i && npm run dev`
4. `cd web && npm i && npm run dev` → open https://localhost:5173 (the first run downloads mkcert and installs a local certificate; accept the prompt)

## Using it
Sign in with OpenStreetMap; the first sign-in imports your data automatically. Everything is stored in the database, so on later visits
you can open the **Table** tab (search, filter by type, sort, paginate, jump to an entry on the map or on openstreetmap.org),
the **Map** tab without syncing again, or the **Open Table** tab to see every person who has logged in — with their locations
plotted on an OSM map and direct links to their OpenStreetMap profiles for verification. Use "Sync from OpenStreetMap" to pull new entries.

## Production (PostgreSQL)
Development uses a local SQLite file. Setting `DATABASE_URL` switches the server to PostgreSQL; tables are created on startup.

1. `cp .env.example .env` and fill it in (redirect URI must be your HTTPS URL, registered in your OSM app).
2. `npm run install:all && npm run build`
3. Set `NODE_ENV=production`, `TOKEN_ENC_KEY` (`openssl rand -base64 32`), and `DATABASE_URL` to your Postgres connection string.
4. `npm start` (serves the API and the built site on port 3001)
5. Put an HTTPS reverse proxy (Caddy, nginx, or your host's router) in front of port 3001.

For a managed database (Neon, Supabase, RDS, Azure Database for PostgreSQL), set `DATABASE_URL`
to its connection string (usually with `?sslmode=require`).
Access tokens are AES-256-GCM encrypted before they are stored.

## Production without Docker
You need Node.js 22+ and, for PostgreSQL, any Postgres 14+ (local install or a managed service).

1. `npm run install:all && npm run build`
2. Set environment variables: `OSM_CLIENT_ID`, `OSM_CLIENT_SECRET`, `REDIRECT_URI`, `WEB_ORIGIN`,
   `TOKEN_ENC_KEY`, `NODE_ENV=production`, and `DATABASE_URL` (omit it to use a local SQLite file).
   Locally you can create a `.env` file; on platforms like Render these are set through the dashboard.
3. `npm start` (serves the API and the built site on port 3001)
4. Keep it running with a process manager (`pm2 start "npm start" --name osm-sync` or a systemd unit) and
   put an HTTPS reverse proxy (Caddy, nginx, or your host's router) in front of port 3001.

## Deploy to Render
The repo includes a [`render.yaml`](render.yaml) blueprint for one-click deployment.

1. Push this repo to GitHub/GitLab.
2. In the [Render dashboard](https://dashboard.render.com), click **New → Blueprint** and select this repo.
3. Render creates a **web service** (Node.js) and a **PostgreSQL database** automatically.
4. Fill in the five env vars marked `sync: false` in the dashboard:
   - `OSM_CLIENT_ID` / `OSM_CLIENT_SECRET` — from your [OSM OAuth2 app](https://www.openstreetmap.org/oauth2/applications/new)
   - `REDIRECT_URI` — `https://<your-service>.onrender.com/auth/callback`
   - `WEB_ORIGIN` — `https://<your-service>.onrender.com`
   - `TOKEN_ENC_KEY` — run `openssl rand -base64 32` and paste the output
5. Update the redirect URI in your OSM OAuth2 app to match.
6. Trigger a deploy — the site is live.
