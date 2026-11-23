import { createResource, createSignal, For, Show } from "solid-js";
import { queryEntries, type Entry } from "./api";

type Sort = "created_at" | "name" | "kind";
const PAGE_SIZE = 25;

const osmUrl = (e: Entry, user: string) =>
  e.kind === "trace"
    ? `https://www.openstreetmap.org/user/${encodeURIComponent(user)}/traces/${e.osm_id}`
    : `https://www.openstreetmap.org/changeset/${e.osm_id}`;

export default function EntriesTable(props: { userName: string; refreshKey: number; onShowOnMap: (id: number) => void }) {
  const [search, setSearch] = createSignal("");
  const [kind, setKind] = createSignal("");
  const [sort, setSort] = createSignal<Sort>("created_at");
  const [dir, setDir] = createSignal<"asc" | "desc">("desc");
  const [page, setPage] = createSignal(1);
  let timer: number | undefined;

  // Loaded only when this component is mounted, i.e. when the user opens the Table tab
  const [data] = createResource(
    () => ({ search: search(), kind: kind(), sort: sort(), dir: dir(), page: page(), _: props.refreshKey }),
    (q) => queryEntries(q, PAGE_SIZE),
  );

  const pages = () => Math.max(1, Math.ceil((data.latest?.total ?? 0) / PAGE_SIZE));
  const toggle = (col: Sort) => {
    if (sort() === col) setDir(dir() === "asc" ? "desc" : "asc");
    else { setSort(col); setDir(col === "name" ? "asc" : "desc"); }
    setPage(1);
  };
  const ariaSort = (col: Sort) => (sort() === col ? (dir() === "asc" ? "ascending" : "descending") : "none");

  return (
    <div class="table-view">
      <div class="filters">
        <input type="search" placeholder="Search names…" aria-label="Search entries"
          onInput={(e) => {
            const v = e.currentTarget.value;
            clearTimeout(timer);
            timer = window.setTimeout(() => { setSearch(v); setPage(1); }, 300);
          }} />
        <select aria-label="Filter by type" onChange={(e) => { setKind(e.currentTarget.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="trace">GPS traces</option>
          <option value="changeset">Edits</option>
        </select>
        <span class="note">{data.latest?.total ?? 0} entries</span>
      </div>

      <Show when={data.error}><p class="note" role="alert">Couldn’t load entries. Try again.</p></Show>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th aria-sort={ariaSort("kind")}><button onClick={() => toggle("kind")}>Type</button></th>
              <th aria-sort={ariaSort("name")}><button onClick={() => toggle("name")}>Name</button></th>
              <th aria-sort={ariaSort("created_at")}><button onClick={() => toggle("created_at")}>Date</button></th>
              <th>Location</th>
              <th>Map</th>
            </tr>
          </thead>
          <tbody>
            <For each={data.latest?.rows} fallback={<tr><td colspan="5" class="note">No entries match.</td></tr>}>
              {(e) => (
                <tr>
                  <td><span class={`tag ${e.kind}`}>{e.kind === "trace" ? "GPS trace" : "Edit"}</span></td>
                  <td>{e.name}</td>
                  <td>{e.created_at?.slice(0, 10) ?? "—"}</td>
                  <td>{e.lat != null && e.lon != null ? `${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}` : "—"}</td>
                  <td class="actions">
                    <button class="link" disabled={e.lat == null} onClick={() => props.onShowOnMap(e.osm_id)}>Show on map</button>
                    <a href={osmUrl(e, props.userName)} target="_blank" rel="noopener noreferrer">Open on OSM</a>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <nav class="pager" aria-label="Pagination">
        <button class="link" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>Previous</button>
        <span class="note">Page {page()} of {pages()}</span>
        <button class="link" disabled={page() >= pages()} onClick={() => setPage(page() + 1)}>Next</button>
      </nav>
    </div>
  );
}
