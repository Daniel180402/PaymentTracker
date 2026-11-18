// Pure logic that turns a parsed statement into changes for a month:
// find the latest salary, pick the movements that came after it and add them
// to the month without duplicating what was already imported.

import type { ClassifyRule, InboxItem, Month, Row, TxRef } from "../types";
import type { BankTx } from "./types";

export const INCOME_TARGET = "income";

const SALARY_RE = /stipend|pension|emolument/i;

export function isSalary(tx: BankTx): boolean {
  return tx.amount > 0 && (SALARY_RE.test(tx.bankCategory) || SALARY_RE.test(tx.description));
}

/** The most recent salary credit of the statement, if any. */
export function findLatestSalary(txs: BankTx[]): BankTx | null {
  return txs.filter(isSalary).reduce<BankTx | null>(
    (best, tx) => (!best || tx.seq > best.seq ? tx : best),
    null,
  );
}

/** Lower-case description without long numeric ids, used for keys and rules. */
export function normalizeDescription(d: string): string {
  return d
    .toLowerCase()
    .replace(/\bmandato\b.*$/, "")
    .replace(/\S*\d{6,}\S*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A readable default name for a movement ("Addebito diretto disposto a
 *  favore di FASTWEB S.p.A. MANDATO …" -> "FASTWEB S.p.A."). */
export function cleanLabel(d: string): string {
  return d
    .replace(/\s+MANDATO\b.*$/i, "")
    .replace(/^addebito diretto disposto a favore di\s+/i, "")
    .replace(/^bonifico( istantaneo)? disposto (a favore di|da)\s+/i, "")
    .trim();
}

/** Stable keys: date|description|amount, plus an index for identical twins. */
export function txKeys(txs: BankTx[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    const base = `${tx.date}|${normalizeDescription(tx.description)}|${tx.amount}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

export function toRef(tx: BankTx, key: string): TxRef {
  return {
    key,
    date: tx.date,
    description: tx.description,
    bankCategory: tx.bankCategory,
    booked: tx.booked,
    amount: tx.amount,
  };
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** Every imported movement already attached to the month. */
export function monthRefs(m: Month): TxRef[] {
  const fromRows = (rows: Row[]) => rows.flatMap((r) => (r.tx ? [r.tx] : []));
  return [
    ...fromRows(m.income),
    ...m.sections.flatMap((s) => fromRows(s.rows)),
    ...(m.inbox ?? []).map((i) => i.tx),
  ];
}

function mapRefs(m: Month, fn: (ref: TxRef) => TxRef): Month {
  const rows = (rs: Row[]) => rs.map((r) => (r.tx ? { ...r, tx: fn(r.tx) } : r));
  return {
    ...m,
    income: rows(m.income),
    sections: m.sections.map((s) => ({ ...s, rows: rows(s.rows) })),
    inbox: (m.inbox ?? []).map((i) => ({ ...i, tx: fn(i.tx) })),
  };
}

export interface MergeResult {
  month: Month;
  /** new movements put in the inbox */
  added: number;
  /** pending movements updated with their booked version */
  updated: number;
  /** movements already present or ignored */
  skipped: number;
}

export interface MergeRange {
  /** used when the month's salary is not in the file: take movements after this date */
  afterDate?: string;
  /** exclusive upper bound (seq of the next salary) for a closing import */
  untilSeq?: number;
}

/** The salary row a month was started from, if it came from an import. */
export function monthSalaryRef(m: Month): TxRef | undefined {
  return m.income.find((r) => r.tx && r.tx.key === m.salaryTxKey)?.tx;
}

/**
 * Merge the movements that follow `salary` into `month`.
 * - the salary itself becomes an income row (once);
 * - new movements go to the inbox, pre-filled from remembered rules;
 * - a "non contabilizzato" movement that later shows up booked (with a new
 *   description) is updated in place, keeping the user's classification.
 * Without `salary` (closing a month whose salary is older than the file)
 * the lower bound is `range.afterDate`.
 */
export function mergeStatement(
  month: Month,
  txs: BankTx[],
  salary: BankTx | null,
  rules: Record<string, ClassifyRule>,
  newId: () => string,
  range: MergeRange = {},
): MergeResult {
  const keys = txKeys(txs);
  const keyOf = new Map(txs.map((tx, i) => [tx, keys[i]]));
  const fileKeys = new Set(keys);

  let m: Month = { ...month, inbox: [...(month.inbox ?? [])] };
  const ignored = new Set(month.ignoredTxKeys ?? []);
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const known = () => new Set(monthRefs(m).map((r) => r.key));

  if (salary) {
    const salaryKey = keyOf.get(salary)!;
    m.salaryTxKey = salaryKey;
    if (!known().has(salaryKey)) {
      m.income = [
        ...m.income,
        { id: newId(), name: "Stipendio", amount: salary.amount, tx: toRef(salary, salaryKey) },
      ];
    }
  }

  const inRange = (tx: BankTx) =>
    (salary ? tx.seq > salary.seq : range.afterDate != null && tx.date > range.afterDate) &&
    (range.untilSeq == null || tx.seq < range.untilSeq);
  const after = txs.filter(inRange).sort((a, b) => a.seq - b.seq);
  const present = known();
  // pending movements that disappeared from the new file: candidates for reconciliation
  const orphans = monthRefs(m).filter((r) => !r.booked && !fileKeys.has(r.key));
  const reconciled = new Set<string>();

  for (const tx of after) {
    const key = keyOf.get(tx)!;
    if (present.has(key) || ignored.has(key)) {
      // refresh the booked flag of movements we already have
      m = mapRefs(m, (r) => (r.key === key ? { ...r, booked: tx.booked } : r));
      skipped++;
      continue;
    }
    const orphan = orphans.find(
      (r) => !reconciled.has(r.key) && r.amount === tx.amount && daysBetween(r.date, tx.date) <= 7,
    );
    if (orphan) {
      reconciled.add(orphan.key);
      m = mapRefs(m, (r) => (r.key === orphan.key ? toRef(tx, key) : r));
      updated++;
      continue;
    }
    const rule = rules[normalizeDescription(tx.description)];
    const item: InboxItem = {
      id: newId(),
      tx: toRef(tx, key),
      note: rule?.note ?? "",
      // credits are never suggested blindly: the user is asked what they are
      suggestion: rule?.target,
    };
    m.inbox = [...(m.inbox ?? []), item];
    added++;
  }

  return { month: m, added, updated, skipped };
}
