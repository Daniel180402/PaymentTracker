// All monetary amounts are stored as INTEGER CENTS to avoid floating-point drift.

export interface Row {
  id: string;
  name: string;
  /** amount in integer cents */
  amount: number;
}

export interface Section {
  id: string;
  name: string;
  rows: Row[];
}

export interface Month {
  id: string;
  name: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** "Entrate della casa" — income rows */
  income: Row[];
  /** Expense category tables */
  sections: Section[];
  closed: boolean;
  closedAt?: string;
  /** the confirmed surplus/deficit (cents) applied to the account on close */
  result?: number;
}

export type LedgerKind = "month" | "manual";

export interface LedgerEntry {
  id: string;
  /** ISO date (yyyy-mm-dd) */
  date: string;
  kind: LedgerKind;
  label: string;
  /** signed amount in cents (+ adds to account, - removes) */
  amount: number;
  note?: string;
  /** present when kind === "month" */
  monthId?: string;
}

export interface AppData {
  version: number;
  months: Month[];
  ledger: LedgerEntry[];
  activeMonthId: string | null;
}

export const DATA_VERSION = 1;
