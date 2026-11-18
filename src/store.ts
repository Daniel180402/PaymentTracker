import { create } from "zustand";
import type { AppData, InboxItem, LedgerEntry, Month, Row, Section } from "./types";
import { DATA_VERSION } from "./types";
import { loadData, saveData } from "./storage";
import type { ParsedStatement } from "./import/types";
import {
  INCOME_TARGET,
  cleanLabel,
  findLatestSalary,
  mergeStatement,
  monthRefs,
  normalizeDescription,
  txKeys,
} from "./import/merge";

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

/** "Novembre 2026" -> 2026 * 12 + 10, or null for custom names. */
function monthIndex(name: string): number | null {
  const m = /^(\p{L}+)\s+(\d{4})$/u.exec(name.trim());
  const i = m ? MONTHS_IT.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1;
  return m && i >= 0 ? Number(m[2]) * 12 + i : null;
}

const monthName = (idx: number) => `${MONTHS_IT[idx % 12]} ${Math.floor(idx / 12)}`;

/** Name for a new month: the one after the latest existing month, so that
 *  repeated clicks never produce two months with the same name. */
export function nextMonthName(months: Month[]): string {
  const indexes = months.map((m) => monthIndex(m.name)).filter((i): i is number => i != null);
  if (indexes.length === 0) return monthLabelFromDate();
  return monthName(Math.max(...indexes) + 1);
}

export interface PastMonthSlot {
  name: string;
  /** first and last day of the month, ISO */
  start: string;
  end: string;
}

function slot(idx: number): PastMonthSlot {
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  const mm = String(m + 1).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { name: monthName(idx), start: `${y}-${mm}-01`, end: `${y}-${mm}-${last}` };
}

/**
 * `count` months before the first tracked month, newest first, skipping the
 * ones already in the account (so a deleted month can be entered again).
 * Without any month it starts from the month before `today`.
 */
export function pastMonthSlots(data: AppData, count: number, today = new Date()): PastMonthSlot[] {
  const index = (names: string[]) =>
    names.map(monthIndex).filter((i): i is number => i != null);
  const tracked = index(data.months.map((m) => m.name));
  const entered = new Set(
    index(data.ledger.filter((e) => e.kind !== "manual").map((e) => e.label)),
  );
  let idx = (tracked.length ? Math.min(...tracked) : today.getFullYear() * 12 + today.getMonth()) - 1;
  const out: PastMonthSlot[] = [];
  for (; out.length < count; idx--) if (!entered.has(idx)) out.push(slot(idx));
  return out;
}

/** An open month with nothing in it yet (template rows at 0 don't count). */
export function isMonthEmpty(m: Month): boolean {
  const rows = [...m.income, ...m.sections.flatMap((s) => s.rows)];
  return !m.closed && !m.salaryTxKey && !m.inbox?.length && rows.every((r) => !r.amount);
}

const DEFAULT_SECTION_NAMES = ["Bisogni", "Sfizi", "Risparmi"];

function newMonth(name: string, template?: Month): Month {
  const sections: Section[] = template
    ? template.sections.map((s) => ({
        id: uid(),
        name: s.name,
        // carry the category labels as a template, reset amounts to 0
        // imported movements belong to their month only
        rows: s.rows
          .filter((r) => r.name.trim() !== "" && !r.tx)
          .map((r) => ({ id: uid(), name: r.name, amount: 0 })),
      }))
    : DEFAULT_SECTION_NAMES.map((n) => ({ id: uid(), name: n, rows: [] }));

  const income: Row[] = template
    ? template.income
        .filter((r) => r.name.trim() !== "" && !r.tx)
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

/** Unclassified imported movements still count: credits as income, debits as spending. */
export function inboxIncome(m: Month): number {
  return (m.inbox ?? []).reduce((acc, i) => acc + Math.max(0, i.tx.amount), 0);
}

export function inboxSpent(m: Month): number {
  return (m.inbox ?? []).reduce((acc, i) => acc + Math.max(0, -i.tx.amount), 0);
}

export function monthIncome(m: Month): number {
  return sumRows(m.income) + inboxIncome(m);
}

export function monthSpent(m: Month): number {
  return m.sections.reduce((acc, s) => acc + sumRows(s.rows), 0) + inboxSpent(m);
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
  /** Surplus/deficit of months before the app, plus an optional opening balance. */
  addPastMonths: (
    months: Array<{ slot: PastMonthSlot; amount: number }>,
    opening?: { amount: number; date: string },
  ) => void;
  updateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "date" | "label" | "amount" | "note">>,
  ) => void;
  deleteLedgerEntry: (id: string) => void;

  /**
   * Merge a parsed bank statement, starting from its latest salary. When that
   * salary is newer than the open month:
   * - "closing": movements up to it complete the open month, it opens a new one;
   * - "new": it just opens a new month;
   * - "extra": it is not a salary (13ª/14ª, bonus…): everything stays in the
   *   open month and it goes among the credits to classify.
   */
  importStatement: (s: ParsedStatement, opts?: { mode?: ImportMode }) => ImportOutcome;
  setInboxNote: (monthId: string, itemId: string, note: string) => void;
  /** Move an inbox item to the income table ("income") or to a section id. */
  classifyInbox: (monthId: string, itemId: string, target: string) => void;
  /** Classify every inbox item that has a suggestion. */
  applySuggestions: (monthId: string) => number;
  ignoreInbox: (monthId: string, itemId: string) => void;
}

export interface MonthOutcome {
  name: string;
  created: boolean;
  added: number;
  updated: number;
  skipped: number;
}

export type ImportOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      salaryDate: string;
      salaryAmount: number;
      mode: ImportMode | "normal";
      months: MonthOutcome[];
      /** movements before the period, left out on purpose */
      before: number;
    };

export type ImportAnalysis =
  | { ok: false; error: string }
  | {
      ok: true;
      salaryDate: string;
      salaryAmount: number;
      /** the open month the statement would close, when the salary is new */
      closable?: { name: string; salaryDate?: string };
    };

export type ImportMode = "closing" | "new" | "extra";

/** The latest open month started from an imported salary. */
function currentSalaryMonth(data: AppData): Month | undefined {
  return data.months.filter((m) => !m.closed && m.salaryTxKey).pop();
}

/** Latest salary of the statement, skipping credits the user already said
 *  are not a salary (e.g. a 13ª imported into a month as a normal credit). */
function pickSalary(data: AppData, txs: ParsedStatement["txs"]) {
  const salaryKeys = new Set(data.months.map((m) => m.salaryTxKey));
  const notSalary = new Set(
    data.months
      .flatMap((m) => [...monthRefs(m).map((r) => r.key), ...(m.ignoredTxKeys ?? [])])
      .filter((k) => !salaryKeys.has(k)),
  );
  const keys = txKeys(txs);
  return findLatestSalary(txs.filter((_, i) => !notSalary.has(keys[i])));
}

/** What an import would do, so the user can choose before applying it. */
export function analyzeStatement(data: AppData, statement: ParsedStatement): ImportAnalysis {
  const salary = pickSalary(data, statement.txs);
  if (!salary) {
    return {
      ok: false,
      error:
        statement.txs.length === 0
          ? "Nessun movimento trovato nel PDF. È un estratto conto Intesa Sanpaolo?"
          : "Nessun accredito di stipendio trovato nell'estratto conto.",
    };
  }
  const salaryKey = txKeys(statement.txs)[statement.txs.indexOf(salary)];
  const known = data.months.some((m) => m.salaryTxKey === salaryKey);
  const current = currentSalaryMonth(data);
  const currentSalary = current && monthRefs(current).find((r) => r.key === current.salaryTxKey);
  const isNewer = !currentSalary || currentSalary.date <= salary.date;
  return {
    ok: true,
    salaryDate: salary.date,
    salaryAmount: salary.amount,
    closable:
      !known && current && isNewer
        ? { name: current.name, salaryDate: currentSalary?.date }
        : undefined,
  };
}

/** Put an imported row back among the movements to classify. */
function rowToInbox(r: Row): InboxItem[] {
  return r.tx ? [{ id: r.id, tx: r.tx, note: r.name === cleanLabel(r.tx.description) ? "" : r.name }] : [];
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
    // an empty month is already waiting: go there instead of stacking another
    const empty = cur.months.find(isMonthEmpty);
    if (empty && !name?.trim()) {
      set({ data: { ...cur, activeMonthId: empty.id }, view: "month" });
      return;
    }
    const template = cur.months.find((m) => m.id === cur.activeMonthId);
    const m = newMonth(name?.trim() || nextMonthName(cur.months), template);
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
      data: withMonth(s.data, monthId, (m) => {
        const removed = m.sections.find((sec) => sec.id === sectionId);
        return {
          ...m,
          sections: m.sections.filter((sec) => sec.id !== sectionId),
          inbox: [...(m.inbox ?? []), ...(removed?.rows.flatMap(rowToInbox) ?? [])],
        };
      }),
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
      data: withMonth(s.data, monthId, (m) => {
        let back: InboxItem[] = [];
        const next = mapTarget(m, target, (rows) => {
          back = rows.filter((r) => r.id === rowId).flatMap(rowToInbox);
          return rows.filter((r) => r.id !== rowId);
        });
        // imported rows are not lost: they go back to "Da classificare"
        return back.length ? { ...next, inbox: [...(next.inbox ?? []), ...back] } : next;
      }),
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
      // continue on a month already opened (e.g. by a closing import),
      // otherwise start a fresh one from the just-closed month as a template
      const open = months.filter((m) => !m.closed).pop();
      const next = open ?? newMonth(nextMonthName(months), closed);
      const data: AppData = {
        ...s.data,
        months: open ? months : [...months, next],
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

  addPastMonths: (months, opening) =>
    set((s) => {
      const entries: LedgerEntry[] = months.map(({ slot, amount }) => ({
        id: uid(),
        kind: "past",
        date: slot.end,
        label: slot.name,
        amount,
      }));
      if (opening && opening.amount !== 0) {
        entries.push({
          id: uid(),
          kind: "manual",
          date: opening.date,
          label: "Saldo di partenza",
          amount: opening.amount,
        });
      }
      const data = { ...s.data, ledger: [...s.data.ledger, ...entries] };
      persist(data);
      return { data };
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

  importStatement: (statement, opts = {}) => {
    const cur = get().data;
    const analysis = analyzeStatement(cur, statement);
    if (!analysis.ok) return analysis;
    const salary = pickSalary(cur, statement.txs)!;
    const keys = txKeys(statement.txs);
    const salaryKey = keys[statement.txs.indexOf(salary)];
    const active = cur.months.find((m) => m.id === cur.activeMonthId);
    const rules = cur.rules ?? {};
    const mode = analysis.closable ? (opts.mode ?? "new") : "normal";

    // the open month and its own salary (in the file or only remembered by date)
    const old = currentSalaryMonth(cur);
    const oldIdx = old ? keys.indexOf(old.salaryTxKey!) : -1;
    const oldTx = oldIdx >= 0 ? statement.txs[oldIdx] : null;
    const afterDate = analysis.closable?.salaryDate;

    if (mode === "extra" && old) {
      // not a new salary: everything after the open month's salary stays there
      const r = mergeStatement(old, statement.txs, oldTx, rules, uid, { afterDate });
      const data = {
        ...cur,
        months: cur.months.map((m) => (m.id === old.id ? r.month : m)),
        activeMonthId: old.id,
      };
      persist(data);
      set({ data, view: "month" });
      return {
        ok: true,
        salaryDate: salary.date,
        salaryAmount: salary.amount,
        mode,
        before: statement.txs.filter((t) =>
          oldTx ? t.seq <= oldTx.seq : afterDate == null || t.date <= afterDate,
        ).length,
        months: [{ name: old.name, created: false, added: r.added, updated: r.updated, skipped: r.skipped }],
      };
    }

    if (mode === "closing" && old) {
      // 1) complete the current month with what happened before the new salary
      const r1 = mergeStatement(old, statement.txs, oldTx, rules, uid, {
        afterDate,
        untilSeq: salary.seq,
      });
      // 2) the new salary opens the next month
      const fresh = newMonth(monthLabelFromDate(new Date(`${salary.date}T12:00:00`)), old);
      const r2 = mergeStatement(fresh, statement.txs, salary, rules, uid);

      const inOld = (t: (typeof statement.txs)[number]) =>
        oldTx ? t.seq > oldTx.seq : afterDate != null && t.date > afterDate;
      const before = statement.txs.filter(
        (t) => t.seq < salary.seq && t !== oldTx && !inOld(t),
      ).length;

      const months = [...cur.months.map((m) => (m.id === old.id ? r1.month : m)), r2.month];
      // stay on the old month while it still has movements to classify
      const activeMonthId = r1.month.inbox?.length ? old.id : r2.month.id;
      const data = { ...cur, months, activeMonthId };
      persist(data);
      set({ data, view: "month" });
      return {
        ok: true,
        salaryDate: salary.date,
        salaryAmount: salary.amount,
        mode,
        before,
        months: [
          { name: r1.month.name, created: false, added: r1.added, updated: r1.updated, skipped: r1.skipped },
          { name: r2.month.name, created: true, added: r2.added, updated: r2.updated, skipped: r2.skipped },
        ],
      };
    }

    let target =
      cur.months.find((m) => m.salaryTxKey === salaryKey) ??
      (active && !active.closed && !active.salaryTxKey ? active : undefined);
    if (target?.closed) {
      return {
        ok: false,
        error: `Il mese "${target.name}" è già chiuso: riaprilo per importare di nuovo.`,
      };
    }
    const created = !target;
    if (!target) {
      target = newMonth(monthLabelFromDate(new Date(`${salary.date}T12:00:00`)), active);
    }

    const r = mergeStatement(target, statement.txs, salary, rules, uid);
    const months = created
      ? [...cur.months, r.month]
      : cur.months.map((m) => (m.id === r.month.id ? r.month : m));
    const data = { ...cur, months, activeMonthId: r.month.id };
    persist(data);
    set({ data, view: "month" });

    return {
      ok: true,
      salaryDate: salary.date,
      salaryAmount: salary.amount,
      mode,
      before: statement.txs.filter((t) => t.seq < salary.seq).length,
      months: [
        { name: r.month.name, created, added: r.added, updated: r.updated, skipped: r.skipped },
      ],
    };
  },

  setInboxNote: (monthId, itemId, note) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) => ({
        ...m,
        inbox: (m.inbox ?? []).map((i) => (i.id === itemId ? { ...i, note } : i)),
      })),
    })),

  classifyInbox: (monthId, itemId, target) =>
    set((s) => {
      const month = s.data.months.find((m) => m.id === monthId);
      const item = month?.inbox?.find((i) => i.id === itemId);
      if (!month || !item) return {};
      const r = classify(month, item, target);
      if (!r) return {};
      const data = {
        ...withMonth(s.data, monthId, () => r.month),
        rules: { ...(s.data.rules ?? {}), ...r.rule },
      };
      persist(data);
      return { data };
    }),

  applySuggestions: (monthId) => {
    const cur = get().data;
    let month = cur.months.find((m) => m.id === monthId);
    if (!month) return 0;
    let rules = cur.rules ?? {};
    let count = 0;
    for (const item of month.inbox ?? []) {
      if (!item.suggestion) continue;
      const r = classify(month, item, item.suggestion);
      if (!r) continue;
      month = r.month;
      rules = { ...rules, ...r.rule };
      count++;
    }
    const data = { ...withMonth(cur, monthId, () => month!), rules };
    persist(data);
    set({ data });
    return count;
  },

  ignoreInbox: (monthId, itemId) =>
    set((s) => ({
      data: withMonth(s.data, monthId, (m) => {
        const item = m.inbox?.find((i) => i.id === itemId);
        if (!item) return m;
        return {
          ...m,
          inbox: m.inbox!.filter((i) => i !== item),
          ignoredTxKeys: [...(m.ignoredTxKeys ?? []), item.tx.key],
        };
      }),
    })),
}));

/**
 * Turn an inbox item into a row. `target` is "income", a section id or a
 * section name (suggestions remember names, since ids change every month).
 * Returns the updated month and the rule to remember for this description.
 */
function classify(m: Month, item: InboxItem, target: string) {
  const name = item.note.trim() || cleanLabel(item.tx.description);
  const inbox = (m.inbox ?? []).filter((i) => i.id !== item.id);
  const ruleKey = normalizeDescription(item.tx.description);

  if (target === INCOME_TARGET) {
    const row: Row = { id: item.id, name, amount: item.tx.amount, tx: item.tx };
    return {
      month: { ...m, inbox, income: [...m.income, row] },
      rule: { [ruleKey]: { note: item.note.trim(), target: INCOME_TARGET } },
    };
  }
  const section =
    m.sections.find((s) => s.id === target) ?? m.sections.find((s) => s.name === target);
  if (!section) return null;
  // expenses are stored as positive amounts; a refund lowers the total
  const row: Row = { id: item.id, name, amount: -item.tx.amount, tx: item.tx };
  return {
    month: {
      ...m,
      inbox,
      sections: m.sections.map((s) =>
        s.id === section.id ? { ...s, rows: [...s.rows, row] } : s,
      ),
    },
    rule: { [ruleKey]: { note: item.note.trim(), target: section.name } },
  };
}

export const selectActiveMonth = (s: State): Month | undefined =>
  s.data.months.find((m) => m.id === s.data.activeMonthId);
