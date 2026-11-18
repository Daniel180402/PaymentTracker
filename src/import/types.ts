/** A positioned piece of text extracted from a PDF page (PDF coordinates:
 *  origin bottom-left, y grows upwards). */
export interface TextItem {
  page: number;
  x: number;
  y: number;
  str: string;
}

/** One movement read from a bank statement. */
export interface BankTx {
  /** ISO date yyyy-mm-dd (data contabile) */
  date: string;
  description: string;
  /** category assigned by the bank, e.g. "Carburanti" */
  bankCategory: string;
  /** signed amount in integer cents (negative = uscita) */
  amount: number;
  /** false when the bank still shows it as "non contabilizzato" */
  booked: boolean;
  /** chronological position inside the file, 0 = oldest */
  seq: number;
}

export interface ParsedStatement {
  periodFrom?: string;
  periodTo?: string;
  /** "I movimenti selezionati sono: N" when present */
  declaredCount?: number;
  txs: BankTx[];
}
