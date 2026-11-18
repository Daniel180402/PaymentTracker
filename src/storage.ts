import { isTauri } from "@tauri-apps/api/core";
import type { Store } from "@tauri-apps/plugin-store";
import type { AppData } from "./types";

const STORE_FILE = "paymenttracker.json";
const STORE_KEY = "app";
const LS_KEY = "paymenttracker";

let storePromise: Promise<Store> | null = null;
async function getStore(): Promise<Store> {
  if (!storePromise) {
    const { load } = await import("@tauri-apps/plugin-store");
    storePromise = load(STORE_FILE, { autoSave: false, defaults: {} });
  }
  return storePromise;
}

/** Load persisted data, or null on first run. Works in Tauri (JSON file) and
 *  falls back to localStorage when running in a plain browser (dev). */
export async function loadData(): Promise<AppData | null> {
  try {
    if (isTauri()) {
      const store = await getStore();
      const val = await store.get<AppData>(STORE_KEY);
      return val ?? null;
    }
  } catch (e) {
    console.error("loadData (tauri) failed, falling back:", e);
  }
  const raw = localStorage.getItem(LS_KEY);
  return raw ? (JSON.parse(raw) as AppData) : null;
}

export async function saveData(data: AppData): Promise<void> {
  try {
    if (isTauri()) {
      const store = await getStore();
      await store.set(STORE_KEY, data);
      await store.save();
      return;
    }
  } catch (e) {
    console.error("saveData (tauri) failed, falling back:", e);
  }
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}
