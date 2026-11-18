// Parser for the Intesa Sanpaolo "Lista movimenti" PDF export.
//
// The table has five columns (DATA CONTABILE, OPERAZIONE, CONTABILIZZATO,
// CATEGORIA, IMPORTO). Cells can wrap on several lines and are vertically
// centred, so every row is anchored on its date and every other piece of text
// is attached to the row whose anchor is closest on the y axis.

import { parseEur } from "../money";
import type { BankTx, ParsedStatement, TextItem } from "./types";

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT_RE = /^€\s*-?[\d.]+,\d{2}$/;
const BOOKED_RE = /^(SI|NO)$/;

interface Columns {
  /** x where the OPERAZIONE column starts */
  op: number;
  /** x where the CONTABILIZZATO column starts */
  booked: number;
  /** x where the CATEGORIA column starts */
  category: number;
  /** x where the IMPORTO column starts */
  amount: number;
}

export function itDateToIso(s: string): string | null {
  const m = DATE_RE.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function findHeader(items: TextItem[]) {
  const op = items.find((i) => i.str.trim() === "OPERAZIONE");
  if (!op) return null;
  const sameLine = (label: string) =>
    items.find((i) => i.str.trim() === label && Math.abs(i.y - op.y) < 4);
  const booked = sameLine("CONTABILIZZATO");
  const category = sameLine("CATEGORIA");
  const amount = sameLine("IMPORTO");
  if (!booked || !category || !amount) return null;
  return {
    y: op.y,
    // the header labels are not perfectly left aligned with the values, so
    // use a small tolerance on the left side of each column
    cols: {
      op: op.x - 8,
      booked: booked.x - 8,
      category: category.x - 20,
      amount: amount.x - 20,
    } satisfies Columns,
  };
}

function column(x: number, c: Columns): keyof Columns | "date" {
  if (x < c.op) return "date";
  if (x < c.booked) return "op";
  if (x < c.category) return "booked";
  if (x < c.amount) return "category";
  return "amount";
}

function joinLines(items: TextItem[]): string {
  return items
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((i) => i.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function readMeta(items: TextItem[], out: ParsedStatement) {
  const all = items.map((i) => i.str).join(" ");
  const period = /dal (\d{2}\.\d{2}\.\d{4}) al (\d{2}\.\d{2}\.\d{4})/.exec(all);
  if (period) {
    out.periodFrom = itDateToIso(period[1]) ?? undefined;
    out.periodTo = itDateToIso(period[2]) ?? undefined;
  }
  const label = items.find((i) => /movimenti selezionati sono/i.test(i.str));
  if (label) {
    const below = items
      .filter((i) => i.page === label.page && i.y < label.y && label.y - i.y < 25)
      .find((i) => /^\d+$/.test(i.str.trim()));
    if (below) out.declaredCount = Number(below.str.trim());
  }
}

/** Turn the positioned text of an Intesa Sanpaolo statement into movements. */
export function parseIntesaItems(items: TextItem[]): ParsedStatement {
  const out: ParsedStatement = { txs: [] };
  readMeta(items, out);

  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  let cols: Columns | null = null;
  const rows: Array<Omit<BankTx, "seq">> = [];

  for (const page of pages) {
    let pageItems = items.filter((i) => i.page === page && i.str.trim() !== "");
    const header = findHeader(pageItems);
    if (header) {
      cols = header.cols;
      // the header row is the top of the table: ignore everything above it
      pageItems = pageItems.filter((i) => i.y < header.y - 10);
    }
    if (!cols) continue;
    const c = cols;

    const anchors = pageItems
      .filter((i) => column(i.x, c) === "date" && DATE_RE.test(i.str.trim()))
      .sort((a, b) => b.y - a.y);
    if (anchors.length === 0) continue;

    const cells = anchors.map(() => ({
      op: [] as TextItem[],
      booked: [] as TextItem[],
      category: [] as TextItem[],
      amount: [] as TextItem[],
    }));

    for (const it of pageItems) {
      const col = column(it.x, c);
      if (col === "date") continue;
      let best = 0;
      for (let k = 1; k < anchors.length; k++) {
        if (Math.abs(anchors[k].y - it.y) < Math.abs(anchors[best].y - it.y)) best = k;
      }
      cells[best][col].push(it);
    }

    anchors.forEach((a, k) => {
      const amountText = joinLines(cells[k].amount);
      const amount = AMOUNT_RE.test(amountText) ? parseEur(amountText) : null;
      if (amount == null) return; // not a real movement row
      const bookedText = joinLines(cells[k].booked);
      rows.push({
        date: itDateToIso(a.str)!,
        description: joinLines(cells[k].op),
        bankCategory: joinLines(cells[k].category),
        amount,
        booked: BOOKED_RE.test(bookedText) ? bookedText === "SI" : true,
      });
    });
  }

  // The export is normally newest-first; normalise to a chronological seq so
  // the order of movements on the same day is preserved.
  const descending =
    rows.length > 1 && rows[0].date >= rows[rows.length - 1].date;
  out.txs = rows.map((r, i) => ({
    ...r,
    seq: descending ? rows.length - 1 - i : i,
  }));
  return out;
}
