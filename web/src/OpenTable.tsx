import L from "leaflet";
import { createEffect, createResource, For, onCleanup, onMount, Show } from "solid-js";
import { getPublicUsers, type PublicUser } from "./api";

const osmProfileUrl = (name: string) =>
  `https://www.openstreetmap.org/user/${encodeURIComponent(name)}`;

export default function OpenTable() {
  const [users] = createResource(() => getPublicUsers());
  let el!: HTMLDivElement;
  let map: L.Map;
  const layer = L.layerGroup();

  onMount(() => {
    map = L.map(el).setView([20, 0], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    layer.addTo(map);
  });
  onCleanup(() => map?.remove());

  createEffect(() => {
    const data = users();
    if (!data) return;
    layer.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const u of data) {
      if (u.lat == null || u.lon == null) continue;
      const m = L.circleMarker([u.lat, u.lon], { radius: 9, color: "#2d6a4f", fillColor: "#52b788", fillOpacity: 0.85 })
        .bindPopup(
          `<b>${escapeHtml(u.display_name)}</b><br>${u.entry_count} entries<br>` +
          `<a href="${osmProfileUrl(u.display_name)}" target="_blank" rel="noopener noreferrer">Verify on OSM ↗</a>`
        );
      m.addTo(layer);
      points.push([u.lat, u.lon]);
    }
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
  });

  return (
    <div class="open-table-view">
      <div ref={el} class="open-table-map" />
      <div class="open-table-list">
        <h3>All Logged-in Contributors</h3>
        <Show when={users.loading}><p class="note">Loading…</p></Show>
        <Show when={users.error}><p class="note" role="alert">Couldn't load users.</p></Show>
        <Show when={users() && users()!.length === 0}><p class="note">No users have synced yet.</p></Show>
        <Show when={users() && users()!.length > 0}>
          <p class="note">{users()!.length} contributor{users()!.length !== 1 ? "s" : ""}</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Entries</th>
                  <th>Location</th>
                  <th>Verify</th>
                </tr>
              </thead>
              <tbody>
                <For each={users()}>
                  {(u: PublicUser) => (
                    <tr>
                      <td><strong>{u.display_name}</strong></td>
                      <td>{u.entry_count}</td>
                      <td>{u.lat != null && u.lon != null ? `${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}` : "—"}</td>
                      <td>
                        <a href={osmProfileUrl(u.display_name)} target="_blank" rel="noopener noreferrer" class="verify-link">
                          View on OSM ↗
                        </a>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
