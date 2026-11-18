import { useEffect, useState } from "react";
import type { Month } from "../types";
import { monthResult } from "../store";
import { formatSignedEur } from "../money";
import { AmountInput } from "./AmountInput";
import { Modal } from "./Modal";
import { IconLock } from "./icons";

interface Props {
  open: boolean;
  month: Month | undefined;
  onClose: () => void;
  onConfirm: (amount: number, note: string, date: string) => void;
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function CloseMonthDialog({ open, month, onClose, onConfirm }: Props) {
  const computed = month ? monthResult(month) : 0;
  const [amount, setAmount] = useState(computed);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());

  // re-sync the editable amount whenever the dialog (re)opens
  useEffect(() => {
    if (open) {
      setAmount(computed);
      setNote("");
      setDate(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month?.id]);

  const positive = amount >= 0;
  const edited = amount !== computed;

  return (
    <Modal
      open={open}
      title="Chiudi il mese"
      icon={<IconLock size={18} />}
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
            onClick={() => onConfirm(amount, note, date)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition shadow-lg shadow-brand-600/30"
          >
            Conferma e aggiungi al conto
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-4">
        Il mese <span className="text-slate-200 font-medium">{month?.name}</span>{" "}
        si chiude con un{" "}
        <span className={positive ? "text-good-400" : "text-bad-400"}>
          {positive ? "surplus" : "deficit"}
        </span>{" "}
        calcolato di{" "}
        <span
          className={`tabular font-semibold ${
            computed >= 0 ? "text-good-400" : "text-bad-400"
          }`}
        >
          {formatSignedEur(computed)}
        </span>
        . Puoi confermarlo o modificarlo prima di aggiungerlo al saldo.
      </p>

      <label className="block text-xs text-slate-500 mb-1">
        Cifra da aggiungere al conto
      </label>
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 mb-1 ${
          positive ? "border-good-500/40 bg-good-500/5" : "border-bad-500/40 bg-bad-500/5"
        }`}
      >
        <AmountInput
          value={amount}
          onCommit={setAmount}
          allowEmpty
          className={`flex-1 text-lg font-bold ${
            positive ? "text-good-400" : "text-bad-400"
          }`}
        />
        <span className="text-slate-500">€</span>
      </div>
      {edited && (
        <div className="text-[11px] text-brand-400 mb-3">
          Cifra modificata manualmente (calcolata: {formatSignedEur(computed)})
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Data di chiusura</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Nota (facoltativa)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="es. stipendio + 14esima"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-500 placeholder:text-slate-600"
          />
        </div>
      </div>
    </Modal>
  );
}
