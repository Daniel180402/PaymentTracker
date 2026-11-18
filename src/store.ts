import { create } from "zustand";
import type { AppData, LedgerEntry, Month, Row, Section } from "./types";
import { DATA_VERSION } from "./types";
import { loadData, saveData } from "./storage";

const uid = () =>
  (crypto.randomUUID?.() ??
    Date.now().toString(36) + Math.random().toString(36).slice(2)) as string;

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function monthLabelFromDate(d = new Date()): string {
  return `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
}

const DEFAULT_SECTION_NAMES = ["Bisogni", "Sfizi", "Risparmi"];

function newMonth(name: string, template?: Month): Month {
  const sections: Section[] = template
    ? template.sections.map((s) => ({
        id: uid(),
        name: s.name,
        // carry the category labels as a template, reset amounts to 0
        rows: s.rows
          .filter((r) => r.name.trim() !== "")
          .map((r) => ({ id: uid(), name: r.name, amount: 0 })),
      }))
    : DEFAULT_SECTION_NAMES.map((n) => ({ id: uid(), name: n, rows: [] }));

  const income: Row[] = template
    ? template.income
        .filter((r) => r.name.trim() !== "")
        .map((r) => ({ id: uid(), name: r.name, amount: 0 }))
    : [];

  return {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    income,
    sections,
    closed: false,
  };
}

function seed(): AppData {
  const m = newMonth(monthLabelFromDate());
  return {
    version: DATA_VERSION,
    months: [m],
    ledger: [],
    activeMonthId: m.id,
  };
}

// ---- derived totals (pure) -------------------------------------------------

export function sumRows(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + (r.amount || 0), 0);
}

export function monthIncome(m: Month): number {
  return sumRows(m.income);
}

export function monthSpent(m: Month): number {
  return m.sections.reduce((acc, s) => acc + sumRows(s.rows), 0);
}

/** income - spent (positive = surplus, negative = deficit) */
export function monthResult(m: Month): number {
  return monthIncome(m) - monthSpent(m);
}

export function accountTotal(ledger: LedgerEntry[]): number {
  return ledger.reduce((acc, e) => acc + e.amount, 0);
}

/** Ledger sorted by date asc, then by insertion — with running balance. */
export function ledgerWithRunning(
  ledger: LedgerEntry[],
): Array<LedgerEntry & { running: number }> {
  const sorted = [...ledger].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let run = 0;
  return sorted.map((e) => {
    run += e.amount;
    return { ...e, running: run };
  });
}

// ---- store -----------------------------------------------------------------

type View = "month" | "summary" | "account";
type RowTarget = { kind: "income" } | { kind: "section"; sectionId: string };

interface State {
  data: AppData;
  loaded: boolean;
  view: View;

  init: () => Promise<void>;
  setView: (v: View) => void;

  setActiveMonth: (id: string) => void;
  addMonth: (name?: string) => void;
  renameMonth: (id: string, name: string) => void;
  deleteMonth: (id: string) => void;

  addSection: (monthId: string, name: string) => void;
  renameSection: (monthId: string, sectionId: string, name: string) => void;
  deleteSection: (monthId: string, sectionId: string) => void;

  /** Upsert a row. Pass rowId=null to create. Patch with name and/or amount. */
  upsertRow: (
    monthId: string,
    target: RowTarget,
    rowId: string | null,
    patch: { name?: string; amount?: number },
  ) => void;
  deleteRow: (monthId: string, target: RowTarget, rowId: string) => void;

  closeMonth: (
    monthId: string,
    amount: number,
    note: string,
    date: string,
  ) => void;
  reopenMonth: (monthId: string) => void;

  addManualEntry: (e: Omit<LedgerEntry, "id" | "kind">) => void;
  updateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "date" | "label" | "amount" | "note">>,
  ) => void;
  deleteLedgerEntry: (id: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveData(data), 250);
}

/** Apply a transform to a month and return new AppData; auto-persists. */
function withMonth(
  data: AppData,
  monthId: string,
  fn: (m: Month) => Month,
): AppData {
  const months = data.months.map((m) => (m.id === monthId ? fn(m) : m));
  const next = { ...data, months };
  persist(next);
  return next;
}

function mapTarget(m: Month, target: RowTarget, fn: (rows: Row[]) => Row[]): Month {
  if (target.kind === "income") return { ...m, income: fn(m.income) };
  return {
    ...m,
    sections: m.sections.map((s) =>
      s.id === target.sectionId ? { ...s, rows: fn(s.rows) } : s,
    ),
  };
}

export const useStore = create<State>((set, get) => ({
  data: seed(),
  loaded: false,
  view: "month",

  init: async () => {
    const loaded = await loadData();
    const data = loaded && loaded.months?.length ? loaded : seed();
    if (!loaded) persist(data);
    set({ data, loaded: true });
  },

  setView: (view) => set({ view }),

  setActiveMonth: (id) => {
    const data = { ...get().data, activeMonthId: id };
    persist(data);
    set({ data, view: "month" });
  },

  addMonth: (name) => {
    const cur = get().data;
    const template = cur.months.find((m) => m.id === cur.activeMonthId);
    const m = newMonth(name?.trim() || monthLabelFromDate(), template);
    const data = { ...cur, months: [...cur.months, m], activeMonthId: m.id };
    persist(data);
    set({ data, view: "month" });
  },

  renameMonth: (id, name) =>
    set((s) => ({ data: withMonth(s.data, id, (m) => ({ ...m, name })) })),

  deleteMonth: (id) =>
    set((s) => {
      const months = s.data.months.filter((m) => m.id !== id);
      // unlink any ledger entries tied to the deleted month
      const ledger = s.data.ledger.filter((e) => e.monthId !== id);
      const activeMonthId =
        s.data.activeMonthId === id
          ? months[months.length - 1]?.id ?? null
          : s.data.activeMonthId;
      const data = { ...s.data, months, ledger, activeMonthId };
      persist(data);
      return { data };
    }),

  addSection: (monthId, name) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) => ({
        ...m,
        sections: [...m.sections, { id: uid(), name: name.trim() || "Nuova categoria", rows: [] }],
      })),
    })),

  renameSection: (monthId, sectionId, name) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) => ({
        ...m,
        sections: m.sections.map((sec) =>
          sec.id === sectionId ? { ...sec, name } : sec,
        ),
      })),
    })),

  deleteSection: (monthId, sectionId) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) => ({
        ...m,
        sections: m.sections.filter((sec) => sec.id !== sectionId),
      })),
    })),

  upsertRow: (monthId, target, rowId, patch) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) =>
        mapTarget(m, target, (rows) => {
          if (rowId == null) {
            return [...rows, { id: uid(), name: "", amount: 0, ...patch }];
          }
          return rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
        }),
      ),
    })),

  deleteRow: (monthId, target, rowId) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) =>
        mapTarget(m, target, (rows) => rows.filter((r) => r.id !== rowId)),
      ),
    })),

  closeMonth: (monthId, amount, note, date) =>
    set((s) => {
      const months = s.data.months.map((m) =>
        m.id === monthId
          ? { ...m, closed: true, closedAt: new Date().toISOString(), result: amount }
          : m,
      );
      const closed = months.find((m) => m.id === monthId)!;
      const entry: LedgerEntry = {
        id: uid(),
        date,
        kind: "month",
        label: closed.name,
        amount,
        note: note.trim() || undefined,
        monthId,
      };
      // start a fresh month from the just-closed one as a template
      const next = newMonth(monthLabelFromDate(), closed);
      const data: AppData = {
        ...s.data,
        months: [...months, next],
        ledger: [...s.data.ledger, entry],
        activeMonthId: next.id,
      };
      persist(data);
      return { data, view: "account" };
    }),

  reopenMonth: (monthId) =>
    set((s) => {
      const months = s.data.months.map((m) =>
        m.id === monthId ? { ...m, closed: false, closedAt: undefined, result: undefined } : m,
      );
      const ledger = s.data.ledger.filter((e) => e.monthId !== monthId);
      const data = { ...s.data, months, ledger, activeMonthId: monthId };
      persist(data);
      return { data, view: "month" };
    }),

  addManualEntry: (e) =>
    set((s) => {
      const entry: LedgerEntry = { id: uid(), kind: "manual", ...e };
      const data = { ...s.data, ledger: [...s.data.ledger, entry] };
      persist(data);
      return { data };
    }),

  updateLedgerEntry: (id, patch) =>
    set((s) => {
      const ledger = s.data.ledger.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      );
      const data = { ...s.data, ledger };
      persist(data);
      return { data };
    }),

  deleteLedgerEntry: (id) =>
    set((s) => {
      const ledger = s.data.ledger.filter((e) => e.id !== id);
      const data = { ...s.data, ledger };
      persist(data);
      return { data };
    }),
}));

export const selectActiveMonth = (s: State): Month | undefined =>
  s.data.months.find((m) => m.id === s.data.activeMonthId);
