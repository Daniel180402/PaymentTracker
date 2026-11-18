import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIntesaItems } from "./intesa";
import type { TextItem } from "./types";

// Synthetic layout that mirrors the real export (fake data).
const t = (page: number, x: number, y: number, str: string): TextItem => ({ page, x, y, str });

const header = (page: number, y: number) => [
  t(page, 65.7, y + 6, "DATA"),
  t(page, 50.5, y - 6, "CONTABILE"),
  t(page, 127, y, "OPERAZIONE"),
  t(page, 302.4, y, "CONTABILIZZATO"),
  t(page, 408.4, y, "CATEGORIA"),
  t(page, 498.1, y, "IMPORTO"),
];

const items: TextItem[] = [
  t(1, 93.6, 758, "Lista movimenti dal 01.03.2026 al 31.03.2026"),
  t(1, 391.9, 597.8, "31.03.2026"), // "Data fine periodo" — must be ignored
  t(1, 67.8, 500.4, "I movimenti selezionati sono:"),
  t(1, 68.3, 486.3, "4"),
  ...header(1, 420),
  t(1, 49.6, 391.8, "28.03.2026"),
  t(1, 125.6, 391.8, "Pagamento Pos"),
  t(1, 337.3, 391.8, "NO"),
  t(1, 395.9, 391.8, "Altre uscite"),
  t(1, 508.8, 391.8, "€ -53,20"),
  t(1, 49.6, 333.2, "27.03.2026"),
  t(1, 125.6, 340.4, "Pagamento Effettuato Su Pos"),
  t(1, 125.6, 326.0, "Estero"),
  t(1, 337.3, 333.2, "NO"),
  t(1, 395.9, 333.2, "Altre uscite"),
  t(1, 508.8, 333.2, "€ -94,99"),
  t(1, 49.6, 301.2, "27.03.2026"),
  t(1, 125.6, 301.2, "Stipendio O Pensione"),
  t(1, 340.6, 301.2, "SI"),
  t(1, 395.9, 308.4, "Stipendi e"),
  t(1, 395.9, 294.0, "pensioni"),
  t(1, 496.1, 301.2, "€ 2.318,00"),
  // page 2 has no header: the columns of page 1 are reused
  t(2, 49.6, 777.9, "20.03.2026"),
  t(2, 125.6, 785.1, "Addebito diretto disposto a"),
  t(2, 125.6, 770.7, "favore di ACME S.p.A."),
  t(2, 340.6, 777.9, "SI"),
  t(2, 395.9, 777.9, "Domiciliazioni e Utenze"),
  t(2, 508.8, 777.9, "€ -65,97"),
];

describe("parseIntesaItems", () => {
  const parsed = parseIntesaItems(items);

  it("reads period and declared count", () => {
    expect(parsed.periodFrom).toBe("2026-03-01");
    expect(parsed.periodTo).toBe("2026-03-31");
    expect(parsed.declaredCount).toBe(4);
  });

  it("parses every row, joining wrapped cells", () => {
    expect(parsed.txs).toHaveLength(4);
    expect(parsed.txs[1]).toMatchObject({
      date: "2026-03-27",
      description: "Pagamento Effettuato Su Pos Estero",
      bankCategory: "Altre uscite",
      amount: -9499,
      booked: false,
    });
    expect(parsed.txs[2]).toMatchObject({
      description: "Stipendio O Pensione",
      bankCategory: "Stipendi e pensioni",
      amount: 231800,
      booked: true,
    });
    expect(parsed.txs[3].description).toBe(
      "Addebito diretto disposto a favore di ACME S.p.A.",
    );
  });

  it("assigns chronological seq to a newest-first list", () => {
    expect(parsed.txs.map((x) => x.seq)).toEqual([3, 2, 1, 0]);
  });
});

// Optional check against a real export, never committed:
//   STATEMENT_PDF=~/Downloads/lista_operazioni.pdf npx vitest run
const realPdf = process.env.STATEMENT_PDF;
describe.skipIf(!realPdf)("real statement", () => {
  it("parses as many movements as the bank declares", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { extractItems } = await import("./extract");
    const doc = await getDocument({ data: new Uint8Array(readFileSync(realPdf!)) }).promise;
    const parsed = parseIntesaItems(await extractItems(doc));
    expect(parsed.txs.length).toBe(parsed.declaredCount);
    for (const tx of parsed.txs) {
      expect(tx.description).not.toBe("");
      expect(tx.amount).not.toBe(0);
    }
  });
});
