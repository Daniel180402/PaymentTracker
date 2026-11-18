import { describe, expect, it } from "vitest";
import type { Month } from "../types";
import {
  cleanLabel,
  findLatestSalary,
  mergeStatement,
  normalizeDescription,
  txKeys,
} from "./merge";
import type { BankTx } from "./types";

let n = 0;
const id = () => `id${++n}`;

const tx = (seq: number, date: string, description: string, amount: number, extra: Partial<BankTx> = {}): BankTx => ({
  seq,
  date,
  description,
  amount,
  bankCategory: "Altre uscite",
  booked: true,
  ...extra,
});

const salaryCat = { bankCategory: "Stipendi e pensioni" };

const emptyMonth = (): Month => ({
  id: "m1",
  name: "Marzo 2026",
  createdAt: "2026-03-01T00:00:00.000Z",
  income: [],
  sections: [{ id: "s1", name: "Bisogni", rows: [] }],
  closed: false,
});

describe("findLatestSalary", () => {
  it("picks the most recent salary credit", () => {
    const txs = [
      tx(0, "2026-02-27", "Stipendio O Pensione", 230000, salaryCat),
      tx(1, "2026-03-02", "Lidl", -1000),
      tx(2, "2026-03-27", "Stipendio O Pensione", 231800, salaryCat),
      tx(3, "2026-03-28", "Bonifico ricevuto", 5000, { bankCategory: "Bonifici ricevuti" }),
    ];
    expect(findLatestSalary(txs)?.seq).toBe(2);
  });

  it("returns null without a salary", () => {
    expect(findLatestSalary([tx(0, "2026-03-02", "Lidl", -1000)])).toBeNull();
  });
});

describe("helpers", () => {
  it("normalises descriptions dropping long ids", () => {
    expect(normalizeDescription("Wl *steam Purchase 4258899642")).toBe("wl *steam purchase");
    expect(
      normalizeDescription("Addebito diretto disposto a favore di FASTWEB S.p.A. MANDATO JRNDLL02D18Z102G"),
    ).toBe("addebito diretto disposto a favore di fastweb s.p.a.");
  });

  it("cleans bank boilerplate from labels", () => {
    expect(cleanLabel("Addebito diretto disposto a favore di FASTWEB S.p.A. MANDATO 123")).toBe("FASTWEB S.p.A.");
    expect(cleanLabel("Bonifico disposto a favore di Luxor Holding Srl")).toBe("Luxor Holding Srl");
  });

  it("disambiguates identical movements", () => {
    const k = txKeys([tx(0, "2026-03-02", "Bar", -150), tx(1, "2026-03-02", "Bar", -150)]);
    expect(k[0]).not.toBe(k[1]);
  });
});

describe("mergeStatement", () => {
  const txs = [
    tx(0, "2026-03-26", "Arcaplanet", -1548),
    tx(1, "2026-03-27", "Stipendio O Pensione", 231800, salaryCat),
    tx(2, "2026-03-27", "Pagamento Pos", -9499, { booked: false }),
    tx(3, "2026-03-28", "Lidl 237", -490),
    tx(4, "2026-03-28", "Storno Pagamento Pos", 372),
  ];
  const salary = findLatestSalary(txs)!;

  it("adds the salary as income and only later movements to the inbox", () => {
    const r = mergeStatement(emptyMonth(), txs, salary, {}, id);
    expect(r.month.income).toHaveLength(1);
    expect(r.month.income[0]).toMatchObject({ name: "Stipendio", amount: 231800 });
    expect(r.month.inbox!.map((i) => i.tx.description)).toEqual([
      "Pagamento Pos",
      "Lidl 237",
      "Storno Pagamento Pos",
    ]);
    expect(r.month.inbox![2].suggestion).toBeUndefined();
    expect(r).toMatchObject({ added: 3, updated: 0, skipped: 0 });
  });

  it("is idempotent on re-import", () => {
    const first = mergeStatement(emptyMonth(), txs, salary, {}, id).month;
    const second = mergeStatement(first, txs, salary, {}, id);
    expect(second).toMatchObject({ added: 0, skipped: 3 });
    expect(second.month.income).toHaveLength(1);
    expect(second.month.inbox).toHaveLength(3);
  });

  it("skips ignored movements", () => {
    const first = mergeStatement(emptyMonth(), txs, salary, {}, id).month;
    const lidl = first.inbox!.find((i) => i.tx.description === "Lidl 237")!;
    const m = { ...first, inbox: first.inbox!.filter((i) => i !== lidl), ignoredTxKeys: [lidl.tx.key] };
    const r = mergeStatement(m, txs, salary, {}, id);
    expect(r.added).toBe(0);
    expect(r.month.inbox).toHaveLength(2);
  });

  it("updates a pending movement once it is booked, keeping the classification", () => {
    const first = mergeStatement(emptyMonth(), txs, salary, {}, id).month;
    const pending = first.inbox!.find((i) => !i.tx.booked)!;
    // user classified it into "Bisogni"
    const classified: Month = {
      ...first,
      inbox: first.inbox!.filter((i) => i !== pending),
      sections: [{ id: "s1", name: "Bisogni", rows: [{ id: "r1", name: "Benzina", amount: 9499, tx: pending.tx }] }],
    };
    const later = [
      ...txs.filter((t) => t.seq !== 2),
      tx(5, "2026-03-29", "Q8 Mogliano", -9499),
    ];
    const r = mergeStatement(classified, later, salary, {}, id);
    expect(r).toMatchObject({ added: 0, updated: 1 });
    const row = r.month.sections[0].rows[0];
    expect(row.name).toBe("Benzina");
    expect(row.tx).toMatchObject({ description: "Q8 Mogliano", booked: true, date: "2026-03-29" });
  });

  describe("closing import (file contains the next salary)", () => {
    const closing = [
      ...txs,
      tx(5, "2026-04-26", "Stipendio O Pensione", 232000, salaryCat),
      tx(6, "2026-04-27", "Bar Centrale", -250),
    ];
    const next = findLatestSalary(closing)!;

    it("fills the old month only up to the new salary", () => {
      const old = mergeStatement(emptyMonth(), txs, salary, {}, id).month;
      const r = mergeStatement(old, closing, salary, {}, id, { untilSeq: next.seq });
      expect(r).toMatchObject({ added: 0, skipped: 3 });
      expect(r.month.inbox!.map((i) => i.tx.description)).not.toContain("Bar Centrale");
      expect(r.month.salaryTxKey).toBe(old.salaryTxKey);
    });

    it("uses the old salary date when that salary is not in the file", () => {
      const old = mergeStatement(emptyMonth(), txs, salary, {}, id).month;
      const later = closing.filter((t) => t.seq >= 3); // file starts after the old salary
      const r = mergeStatement(old, later, null, {}, id, {
        afterDate: "2026-03-27",
        untilSeq: next.seq,
      });
      // Lidl and Storno were already there; nothing past the new salary is added
      expect(r).toMatchObject({ added: 0, skipped: 2 });
      expect(r.month.salaryTxKey).toBe(old.salaryTxKey);
    });

    it("starts the new month from the new salary", () => {
      const r = mergeStatement(emptyMonth(), closing, next, {}, id);
      expect(r.month.income[0].amount).toBe(232000);
      expect(r.month.inbox!.map((i) => i.tx.description)).toEqual(["Bar Centrale"]);
    });
  });

  it("pre-fills notes from remembered rules", () => {
    const rules = { "lidl 237": { note: "Spesa", target: "Bisogni" } };
    const r = mergeStatement(emptyMonth(), txs, salary, rules, id);
    const lidl = r.month.inbox!.find((i) => i.tx.description === "Lidl 237")!;
    expect(lidl).toMatchObject({ note: "Spesa", suggestion: "Bisogni" });
  });
});
