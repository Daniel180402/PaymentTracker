import { describe, expect, it } from "vitest";
import { analyzeStatement } from "./store";
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
