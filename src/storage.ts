// Persistence with three backends, picked at start-up:
// - "tauri":  desktop app, JSON file through the Tauri store plugin;
// - "server": web app served by the home server (Docker), shared by every
//             device in the house, with ETag checks so a device holding stale
//             data can never overwrite newer changes;
// - "local":  plain browser without a server (vite dev), localStorage.

import { isTauri } from "@tauri-apps/api/core";
import type { Store } from "@tauri-apps/plugin-store";
import type { AppData } from "./types";

const STORE_FILE = "paymenttracker.json";
const STORE_KEY = "app";
const LS_KEY = "paymenttracker";
const API = "/api/data";
const SAVE_DELAY = 250;
const POLL_EVERY = 30_000;

type Backend = "tauri" | "server" | "local";

export type SyncEvent =
  /** another device changed the data: the new data replaces the local copy */
  | { kind: "remote"; data: AppData }
  /** a local change hit newer data from another device and was discarded */
  | { kind: "conflict"; data: AppData }
  /** the server cannot be reached; changes are kept and retried */
  | { kind: "offline" }
  | { kind: "online" };

let backend: Backend = "local";
let etag: string | null = null;
let listener: (e: SyncEvent) => void = () => {};

/** Receive data changed elsewhere and connection state (server mode only). */
export function onSync(cb: (e: SyncEvent) => void) {
  listener = cb;
}

let storePromise: Promise<Store> | null = null;
async function getStore(): Promise<Store> {
  if (!storePromise) {
    const { load } = await import("@tauri-apps/plugin-store");
    storePromise = load(STORE_FILE, { autoSave: false, defaults: {} });
  }
  return storePromise;
}

function readLocal(): AppData | null {
  const raw = localStorage.getItem(LS_KEY);
  return raw ? (JSON.parse(raw) as AppData) : null;
}

/** GET from the server; undefined when no PaymentTracker server answers. */
async function fetchServer(): Promise<{ data: AppData | null; etag: string } | undefined> {
  try {
    const res = await fetch(API, { cache: "no-store" });
    const tag = res.headers.get("ETag");
    const json = res.headers.get("Content-Type")?.includes("application/json");
    if (!tag || !(res.status === 204 || (res.ok && json))) return undefined;
    return { data: res.status === 204 ? null : ((await res.json()) as AppData), etag: tag };
  } catch {
    return undefined;
  }
}

/** Load persisted data, or null on first run. */
export async function loadData(): Promise<AppData | null> {
  if (isTauri()) {
    try {
      backend = "tauri";
      const store = await getStore();
      return (await store.get<AppData>(STORE_KEY)) ?? null;
    } catch (e) {
      console.error("loadData (tauri) failed, falling back:", e);
      backend = "local";
      return readLocal();
    }
  }

  const remote = await fetchServer();
  if (!remote) {
    backend = "local";
    return readLocal();
  }
  backend = "server";
  etag = remote.etag;
  startWatching();
  if (remote.data) return remote.data;
  // empty server: bring along what this browser had stored before
  const local = readLocal();
  if (local) saveData(local);
  return local;
}

// ---- saving: debounced, one request at a time, latest data wins locally ----

let pending: AppData | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;

export function saveData(data: AppData): void {
  pending = data;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), SAVE_DELAY);
}

async function flush() {
  timer = null;
  if (saving) return;
  saving = true;
  try {
    while (pending) {
      const data = pending;
      pending = null;
      const ok = await write(data);
      if (!ok) {
        // server unreachable: keep the newest data and retry later
        pending ??= data;
        timer = setTimeout(() => void flush(), 5_000);
        break;
      }
    }
  } finally {
    saving = false;
  }
}

let offline = false;
function setOffline(v: boolean) {
  if (v !== offline) {
    offline = v;
    listener({ kind: v ? "offline" : "online" });
  }
}

async function write(data: AppData): Promise<boolean> {
  if (backend === "tauri") {
    try {
      const store = await getStore();
      await store.set(STORE_KEY, data);
      await store.save();
    } catch (e) {
      console.error("saveData (tauri) failed:", e);
    }
    return true;
  }
  if (backend === "local") {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return true;
  }

  let res: Response;
  try {
    res = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": etag ?? '"0"' },
      body: JSON.stringify(data),
    });
  } catch {
    setOffline(true);
    return false;
  }
  setOffline(false);
  if (res.status === 412) {
    etag = res.headers.get("ETag");
    pending = null; // based on old data: drop it
    listener({ kind: "conflict", data: (await res.json()) as AppData });
    return true;
  }
  if (!res.ok) {
    console.error("save failed:", res.status, await res.text());
    return true;
  }
  etag = res.headers.get("ETag");
  return true;
}

// ---- watching: pick up changes made on other devices ----

async function refresh() {
  if (saving || pending || timer || document.visibilityState !== "visible") return;
  try {
    const res = await fetch(API, {
      cache: "no-store",
      headers: etag ? { "If-None-Match": etag } : {},
    });
    setOffline(false);
    // a local change may have started while the request was in flight
    if (res.status !== 200 || saving || pending || timer) return;
    etag = res.headers.get("ETag");
    listener({ kind: "remote", data: (await res.json()) as AppData });
  } catch {
    setOffline(true);
  }
}

function startWatching() {
  document.addEventListener("visibilitychange", () => void refresh());
  window.addEventListener("focus", () => void refresh());
  window.addEventListener("online", () => {
    void flush();
    void refresh();
  });
  setInterval(() => void refresh(), POLL_EVERY);
}
