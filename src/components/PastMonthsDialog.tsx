import { useEffect, useMemo, useState } from "react";
import { accountTotal, pastMonthSlots, useStore } from "../store";
import { formatSignedEur, parseEur } from "../money";
import { Modal } from "./Modal";
import { IconCalendar, IconPlus } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Surplus/deficit of the months before the app, so the account starts right. */
export function PastMonthsDialog({ open, onClose }: Props) {
  const data = useStore((s) => s.data);
  const addPastMonths = useStore((s) => s.addPastMonths);

  const [count, setCount] = useState(3);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [negative, setNegative] = useState<Record<string, boolean>>({});
  const [opening, setOpening] = useState("");

  useEffect(() => {
    if (!open) return;
    setCount(3);
    setAmounts({});
    setNegative({});
    setOpening("");
  }, [open]);

  // computed from the data as it was when the dialog opened
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slots = useMemo(() => pastMonthSlots(data, count), [open, count]);
  const oldest = slots[slots.length - 1];

  const valueOf = (name: string) => {
    const cents = parseEur(amounts[name] ?? "") ?? 0;
    return negative[name] ? -Math.abs(cents) : cents;
  };
  const filled = slots
    .map((slot) => ({ slot, amount: valueOf(slot.name) }))
    .filter((r) => r.amount !== 0);
  const openingCents = parseEur(opening) ?? 0;
  const current = accountTotal(data.ledger);
  const after = current + filled.reduce((n, r) => n + r.amount, 0) + openingCents;
  const valid = filled.length > 0 || openingCents !== 0;

  return (
    <Modal
      open={open}
      title="Mesi passati"
      icon={<IconCalendar size={18} />}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-ink-700/60 transition"
          >
            Annulla
          </button>
          <button
            disabled={!valid}
            onClick={() => {
              addPastMonths(filled, openingCents ? { amount: openingCents, date: oldest.start } : undefined);
              onClose();
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 enabled:hover:bg-brand-500 disabled:opacity-40 text-white transition"
          >
            Aggiungi al conto
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-4">
        Per ogni mese prima di usare l'app scrivi quanto ti è avanzato (surplus) o quanto hai
        sforato (deficit). Lascia vuoti i mesi che non ti interessano.
      </p>

      <div className="rounded-xl border border-ink-700 divide-y divide-ink-800/70 mb-2 max-h-72 overflow-y-auto">
        {slots.map((slot) => {
          const neg = !!negative[slot.name];
          return (
            <div key={slot.name} className="flex items-center gap-2 px-3 h-11">
              <span className="flex-1 text-sm text-slate-200">{slot.name}</span>
              <button
                onClick={() => setNegative((n) => ({ ...n, [slot.name]: !neg }))}
                title={neg ? "Deficit: clicca per surplus" : "Surplus: clicca per deficit"}
                className={`w-16 rounded-md py-1 text-xs font-medium transition ${
                  neg ? "bg-bad-500/15 text-bad-400" : "bg-good-500/15 text-good-400"
                }`}
              >
                {neg ? "− Deficit" : "+ Surplus"}
              </button>
              <input
                value={amounts[slot.name] ?? ""}
                inputMode="decimal"
                onChange={(e) => setAmounts((a) => ({ ...a, [slot.name]: e.target.value }))}
                placeholder="0,00"
                aria-label={`Risultato di ${slot.name}`}
                className="tabular w-28 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-right text-sm outline-none focus:border-brand-500 placeholder:text-slate-600"
              />
              <span className="text-xs text-slate-500">€</span>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition mb-4"
      >
        <IconPlus size={14} /> Aggiungi {pastMonthSlots(data, count + 1)[count].name}
      </button>

      <label className="block text-xs text-slate-500 mb-1">
        Saldo prima di {oldest.name} (facoltativo)
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 mb-4">
        <input
          value={opening}
          inputMode="decimal"
          onChange={(e) => setOpening(e.target.value)}
          placeholder="quanto avevi già sul conto"
          className="tabular flex-1 bg-transparent outline-none text-sm placeholder:text-slate-600"
        />
        <span className="text-slate-500 text-sm">€</span>
      </div>

      <div className="flex justify-between items-baseline rounded-xl bg-ink-900/60 px-3 py-2.5">
        <span className="text-xs text-slate-500">
          Saldo del conto: {formatSignedEur(current)} →
        </span>
        <span className={`tabular text-lg font-bold ${after >= 0 ? "text-good-400" : "text-bad-400"}`}>
          {formatSignedEur(after)}
        </span>
      </div>
    </Modal>
  );
}
