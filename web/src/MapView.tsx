import L from "leaflet";
import { createEffect, onCleanup, onMount } from "solid-js";
import type { Entry } from "./api";

export default function MapView(props: { entries: Entry[]; selected?: number }) {
  let el!: HTMLDivElement;
  let map: L.Map;
  const layer = L.layerGroup();
  const markers = new Map<number, L.CircleMarker>();

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
    layer.clearLayers();
    markers.clear();
    const points: L.LatLngTuple[] = [];
    for (const e of props.entries) {
      if (e.lat == null || e.lon == null) continue;
      const color = e.kind === "trace" ? "#d9480f" : "#1c5d99";
      const m = L.circleMarker([e.lat, e.lon], { radius: 7, color, fillOpacity: 0.7 })
        .bindPopup(`<b>${e.kind === "trace" ? "GPS trace" : "Edit"}</b><br>${escapeHtml(e.name)}`);
      m.addTo(layer);
      markers.set(e.osm_id, m);
      points.push([e.lat, e.lon]);
    }
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
  });

  createEffect(() => {
    const m = props.selected !== undefined ? markers.get(props.selected) : undefined;
    if (m) { map.flyTo(m.getLatLng(), 13); m.openPopup(); }
  });

  return <div ref={el} class="map" />;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
