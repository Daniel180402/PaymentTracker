// All monetary amounts are stored as INTEGER CENTS to avoid floating-point drift.

export interface Row {
  id: string;
  name: string;
  /** amount in integer cents */
  amount: number;
  /** set when the row comes from an imported bank statement */
  tx?: TxRef;
}

/** Reference to a movement imported from a bank statement. */
export interface TxRef {
  /** stable key used to avoid importing the same movement twice */
  key: string;
  /** ISO date yyyy-mm-dd */
  date: string;
  description: string;
  bankCategory: string;
  /** false while the bank still shows it as "non contabilizzato" */
  booked: boolean;
  /** signed amount as shown by the bank, in cents */
  amount: number;
}

/** An imported movement that still has to be classified. */
export interface InboxItem {
  id: string;
  tx: TxRef;
  /** what the user says it is (becomes the row name) */
  note: string;
  /** suggested destination: "income" or a section name */
  suggestion?: string;
}

/** Remembered classification for a recurring bank description. */
export interface ClassifyRule {
  note: string;
  /** "income" or a section name */
  target: string;
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
  /** imported movements waiting to be classified */
  inbox?: InboxItem[];
  /** keys of imported movements the user chose to ignore */
  ignoredTxKeys?: string[];
  /** key of the salary credit this month was started from */
  salaryTxKey?: string;
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
  /** normalised bank description -> last classification */
  rules?: Record<string, ClassifyRule>;
}

export const DATA_VERSION = 1;
