import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import mkcert from "vite-plugin-mkcert";

// The dev server runs on https://localhost:5173 with a locally trusted certificate (mkcert),
// and proxies /api and /auth to the backend, so the OSM redirect URI can be HTTPS.
export default defineConfig({
  plugins: [solid(), mkcert()],
  server: {
    port: 5173,
    https: {},
    proxy: { "/api": "http://localhost:3001", "/auth": "http://localhost:3001" },
  },
});
