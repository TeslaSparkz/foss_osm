import { createEffect, createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import { getEntries, getMe, logout, sync } from "./api";
import EntriesTable from "./EntriesTable";
import MapView from "./MapView";
import OpenTable from "./OpenTable";

export default function App() {
  const [me, { refetch: refetchMe }] = createResource(() => getMe().catch(() => null));
  const [entries, { refetch }] = createResource(() => (me() ? getEntries() : null));
  const [view, setView] = createSignal<"map" | "table" | "open">("map");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [selected, setSelected] = createSignal<number>();
  const [refreshKey, setRefreshKey] = createSignal(0);
  let autoSynced = false;

  async function runSync() {
    setBusy(true);
    setMessage("");
    try {
      const { synced } = await sync();
      setMessage(`Saved ${synced} entries.`);
      await refetch();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // First sign-in: nothing stored yet, so import automatically once
  createEffect(() => {
    const list = entries();
    if (list && list.length === 0 && !autoSynced) { autoSynced = true; runSync(); }
  });

  const count = (kind: string) => entries()?.filter((e) => e.kind === kind).length ?? 0;
  const showOnMap = (id: number) => { setSelected(id); setView("map"); };

  return (
    <Switch>
      <Match when={me.loading}><p class="center">Loading…</p></Match>
      <Match when={!me()}>
        <div class="landing">
          <header class="landing-header">
            <div>
              <h1>Your OpenStreetMap, in one place</h1>
              <p>Sign in to save your GPS traces and edited areas to a database. Come back any time to see them on a map or in a table.</p>
              <a class="btn" href="/auth/login">Sign in with OpenStreetMap</a>
            </div>
          </header>
          <section class="landing-open-table">
            <OpenTable />
          </section>
        </div>
      </Match>
      <Match when={me()}>
        <div class="layout">
          <aside>
            <header>
              <h2>{me()!.display_name}</h2>
              <button class="link" onClick={async () => { await logout(); refetchMe(); }}>Sign out</button>
            </header>
            <p class="note">{count("trace")} GPS traces · {count("changeset")} edits saved</p>
            <button class="btn" disabled={busy()} onClick={runSync}>{busy() ? "Syncing…" : "Sync from OpenStreetMap"}</button>
            <Show when={message()}><p class="note" role="status">{message()}</p></Show>
            <Show when={view() === "map"}>
              <ul>
                <For each={entries()}>
                  {(e) => (
                    <li classList={{ trace: e.kind === "trace", edit: e.kind === "changeset" }}>
                      <button onClick={() => setSelected(e.osm_id)} disabled={e.lat == null}>
                        <strong>{e.name}</strong>
                        <small>{e.kind === "trace" ? "GPS trace" : "Edit"} · {e.created_at?.slice(0, 10)}</small>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </aside>

          <section class="stage">
            <div class="tabs" role="tablist">
              <button role="tab" aria-selected={view() === "map"} onClick={() => setView("map")}>Map</button>
              <button role="tab" aria-selected={view() === "table"} onClick={() => setView("table")}>Table</button>
              <button role="tab" aria-selected={view() === "open"} onClick={() => setView("open")}>Open Table</button>
            </div>
            <Switch>
              <Match when={view() === "map"}>
                <MapView entries={entries() ?? []} selected={selected()} />
              </Match>
              <Match when={view() === "table"}>
                <EntriesTable userName={me()!.display_name} refreshKey={refreshKey()} onShowOnMap={showOnMap} />
              </Match>
              <Match when={view() === "open"}>
                <OpenTable />
              </Match>
            </Switch>
          </section>
        </div>
      </Match>
    </Switch>
  );
}
