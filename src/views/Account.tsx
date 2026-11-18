import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LedgerEntry } from "../types";
import { accountTotal, ledgerWithRunning, useStore } from "../store";
import { formatEur, formatSignedEur, parseEur } from "../money";
import { Modal } from "../components/Modal";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconSparkle,
  IconTrash,
} from "../components/icons";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Editing =
  | { mode: "new" }
  | { mode: "edit"; entry: LedgerEntry }
  | null;

export function Account() {
  const ledger = useStore((s) => s.data.ledger);
  const addManualEntry = useStore((s) => s.addManualEntry);
  const updateLedgerEntry = useStore((s) => s.updateLedgerEntry);
  const deleteLedgerEntry = useStore((s) => s.deleteLedgerEntry);

  const [editing, setEditing] = useState<Editing>(null);
  const rows = ledgerWithRunning(ledger);
  const total = accountTotal(ledger);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-7 py-5 border-b border-ink-800">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Conto</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            Storico dei mesi chiusi e dei movimenti straordinari
          </div>
        </div>
        <div className="text-right mr-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Saldo totale
          </div>
          <div
            className={`tabular text-2xl font-bold ${
              total >= 0 ? "text-good-400" : "text-bad-400"
            }`}
          >
            {formatSignedEur(total)}
          </div>
        </div>
        <button
          onClick={() => setEditing({ mode: "new" })}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-semibold text-white transition"
        >
          <IconPlus size={16} /> Movimento
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {rows.length === 0 ? (
          <div className="grid place-items-center h-full text-slate-500 text-sm">
            Nessun movimento. Chiudi un mese o aggiungi una cifra straordinaria.
          </div>
        ) : (
          <div className="rounded-2xl border border-ink-700 bg-ink-850/60 overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_130px_130px_40px] gap-2 px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 border-b border-ink-700">
              <div>Data</div>
              <div>Descrizione</div>
              <div className="text-right">Movimento</div>
              <div className="text-right">Saldo</div>
              <div />
            </div>
            <div className="divide-y divide-ink-800/70">
              <AnimatePresence initial={false}>
                {rows.map((e) => {
                  const pos = e.amount >= 0;
                  return (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="group grid grid-cols-[100px_1fr_130px_130px_40px] gap-2 px-4 py-3 items-center hover:bg-ink-800/40 transition cursor-pointer"
                      onClick={() => setEditing({ mode: "edit", entry: e })}
                    >
                      <div className="tabular text-sm text-slate-400">
                        {formatDate(e.date)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-100 truncate">
                            {e.label}
                          </span>
                          {e.kind === "manual" && (
                            <span className="shrink-0 flex items-center gap-1 text-[10px] text-brand-400 bg-brand-500/10 border border-brand-500/30 rounded-full px-1.5 py-0.5">
                              <IconSparkle size={10} /> extra
                            </span>
                          )}
                        </div>
                        {e.note && (
                          <div className="text-xs text-slate-500 truncate">{e.note}</div>
                        )}
                      </div>
                      <div
                        className={`tabular text-sm font-semibold text-right flex items-center justify-end gap-1 ${
                          pos ? "text-good-400" : "text-bad-400"
                        }`}
                      >
                        {pos ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
                        {formatSignedEur(e.amount)}
                      </div>
                      <div className="tabular text-sm font-semibold text-right text-slate-200">
                        {formatEur(e.running)}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (confirm("Eliminare questo movimento?"))
                              deleteLedgerEntry(e.id);
                          }}
                          className="text-slate-700 hover:text-bad-400 opacity-0 group-hover:opacity-100 transition"
                          title="Elimina"
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <EntryModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(payload) => {
          if (editing?.mode === "edit") {
            updateLedgerEntry(editing.entry.id, payload);
          } else {
            addManualEntry({ ...payload });
          }
          setEditing(null);
        }}
      />
    </div>
  );
}

function EntryModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing;
  onClose: () => void;
  onSave: (p: { date: string; label: string; amount: number; note?: string }) => void;
}) {
  const open = editing != null;
  const entry = editing?.mode === "edit" ? editing.entry : null;

  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayISO());
  const [sign, setSign] = useState<1 | -1>(1);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setLabel(entry.label);
      setDate(entry.date);
      setSign(entry.amount < 0 ? -1 : 1);
      setAmountText(
        entry.amount ? String(Math.abs(entry.amount) / 100).replace(".", ",") : "",
      );
      setNote(entry.note ?? "");
    } else {
      setLabel("");
      setDate(todayISO());
      setSign(1);
      setAmountText("");
      setNote("");
    }
  }, [open, entry?.id]);

  const cents = (parseEur(amountText) ?? 0) * sign;
  const valid = label.trim() !== "" && cents !== 0;

  return (
    <Modal
      open={open}
      title={entry ? "Modifica movimento" : "Nuovo movimento straordinario"}
      icon={<IconSparkle size={18} />}
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
            onClick={() =>
              onSave({
                date,
                label: label.trim(),
                amount: cents,
                note: note.trim() || undefined,
              })
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 enabled:hover:bg-brand-500 disabled:opacity-40 text-white transition"
          >
            {entry ? "Salva" : "Aggiungi al conto"}
          </button>
        </>
      }
    >
      <label className="block text-xs text-slate-500 mb-1">Descrizione</label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="es. Tredicesima, anticipo auto…"
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-500 mb-4 placeholder:text-slate-600"
      />

      <div className="grid grid-cols-[auto_1fr] gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tipo</label>
          <div className="flex rounded-lg border border-ink-700 overflow-hidden">
            <button
              onClick={() => setSign(1)}
              className={`px-3 py-2 text-sm font-medium transition ${
                sign === 1 ? "bg-good-500/20 text-good-400" : "text-slate-400"
              }`}
            >
              + Entra
            </button>
            <button
              onClick={() => setSign(-1)}
              className={`px-3 py-2 text-sm font-medium transition ${
                sign === -1 ? "bg-bad-500/20 text-bad-400" : "text-slate-400"
              }`}
            >
              − Esce
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Importo</label>
          <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
            <input
              value={amountText}
              inputMode="decimal"
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="0,00"
              className="tabular flex-1 text-right bg-transparent outline-none text-sm placeholder:text-slate-600"
            />
            <span className="text-slate-500 text-sm">€</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Nota</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="facoltativa"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-500 placeholder:text-slate-600"
          />
        </div>
      </div>
    </Modal>
  );
}
