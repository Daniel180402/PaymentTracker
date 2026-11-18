import { describe, expect, it } from "vitest";
import { analyzeStatement, isMonthEmpty, nextMonthName, pastMonthSlots } from "./store";
import type { AppData, Month, TxRef } from "./types";
import type { BankTx } from "./import/types";
import { txKeys, toRef } from "./import/merge";

const salaryCat = { bankCategory: "Stipendi e pensioni" };
const tx = (seq: number, date: string, description: string, amount: number, extra: Partial<BankTx> = {}): BankTx => ({
  seq,
  date,
  description,
  amount,
  bankCategory: "Altre uscite",
  booked: true,
  ...extra,
});

const txs = [
  tx(0, "2026-11-27", "Stipendio O Pensione", 231800, salaryCat),
  tx(1, "2026-11-30", "Lidl", -1000),
  tx(2, "2026-12-15", "Stipendio O Pensione", 231800, salaryCat), // 13ª
];
const keys = txKeys(txs);

const month = (extra: Partial<Month> = {}): Month => {
  const salary: TxRef = toRef(txs[0], keys[0]);
  return {
    id: "nov",
    name: "Novembre 2026",
    createdAt: "2026-11-27T00:00:00Z",
    closed: false,
    salaryTxKey: salary.key,
    income: [{ id: "s", name: "Stipendio", amount: salary.amount, tx: salary }],
    sections: [],
    ...extra,
  };
};

const data = (m: Month): AppData => ({ version: 1, months: [m], ledger: [], activeMonthId: m.id });

describe("analyzeStatement", () => {
  it("offers to close the open month when a newer salary shows up", () => {
    const a = analyzeStatement(data(month()), { txs });
    expect(a).toMatchObject({
      ok: true,
      salaryDate: "2026-12-15",
      closable: { name: "Novembre 2026", salaryDate: "2026-11-27" },
    });
  });

  it("does not ask again for a credit already kept as 13ª/14ª", () => {
    const extra = { id: "x", tx: toRef(txs[2], keys[2]), note: "" };
    const a = analyzeStatement(data(month({ inbox: [extra] })), { txs });
    expect(a).toMatchObject({ ok: true, salaryDate: "2026-11-27" });
    expect(a.ok && a.closable).toBeFalsy();
  });

  it("does not ask again when that credit was ignored", () => {
    const a = analyzeStatement(data(month({ ignoredTxKeys: [keys[2]] })), { txs });
    expect(a.ok && a.closable).toBeFalsy();
  });
});

describe("month helpers", () => {
  const named = (name: string): Month => ({ ...month(), id: name, name, salaryTxKey: undefined, income: [] });

  it("names a new month after the latest one, across years", () => {
    expect(nextMonthName([named("Ottobre 2026"), named("Novembre 2026")])).toBe("Dicembre 2026");
    expect(nextMonthName([named("Dicembre 2026"), named("Vacanze")])).toBe("Gennaio 2027");
  });

  it("never repeats a name when the same month exists twice", () => {
    expect(nextMonthName([named("Novembre 2026"), named("Novembre 2026")])).toBe("Dicembre 2026");
  });

  it("treats template rows at zero as empty", () => {
    const m = { ...named("Dicembre 2026"), sections: [{ id: "b", name: "Bisogni", rows: [{ id: "r", name: "Affitto", amount: 0 }] }] };
    expect(isMonthEmpty(m)).toBe(true);
    expect(isMonthEmpty({ ...m, income: [{ id: "i", name: "Stipendio", amount: 100 }] })).toBe(false);
    expect(isMonthEmpty(month())).toBe(false);
  });
});

describe("pastMonthSlots", () => {
  const base: AppData = { version: 1, months: [], ledger: [], activeMonthId: null };
  const named = (name: string): Month => ({ ...month(), id: name, name });

  it("starts from the month before the first tracked one, newest first", () => {
    const slots = pastMonthSlots({ ...base, months: [named("Novembre 2026"), named("Dicembre 2026")] }, 3);
    expect(slots.map((s) => s.name)).toEqual(["Ottobre 2026", "Settembre 2026", "Agosto 2026"]);
    expect(slots[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("goes back across years and handles February", () => {
    const slots = pastMonthSlots({ ...base, months: [named("Marzo 2028")] }, 3);
    expect(slots.map((s) => s.end)).toEqual(["2028-02-29", "2028-01-31", "2027-12-31"]);
  });

  it("skips past months already entered", () => {
    const ledger = [{ id: "p", kind: "past" as const, date: "2026-10-31", label: "Ottobre 2026", amount: 100 }];
    const slots = pastMonthSlots({ ...base, months: [named("Novembre 2026")], ledger }, 1);
    expect(slots[0].name).toBe("Settembre 2026");
  });

  it("uses today when there is no month at all", () => {
    expect(pastMonthSlots(base, 1, new Date(2026, 10, 18))[0].name).toBe("Ottobre 2026");
  });
});
