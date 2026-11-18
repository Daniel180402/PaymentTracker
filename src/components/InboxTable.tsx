import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { InboxItem, Month } from "../types";
import { useStore } from "../store";
import { INCOME_TARGET, cleanLabel } from "../import/merge";
import { formatSignedEur } from "../money";
import { IconBank, IconCheck, IconSparkle, IconX } from "./icons";

const fmtDate = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Imported movements waiting for the user to say what they are. */
export function InboxTable({ month }: { month: Month }) {
  const applySuggestions = useStore((s) => s.applySuggestions);
  const items = [...(month.inbox ?? [])].sort((a, b) =>
    a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : 0,
  );
  if (items.length === 0) return null;
  const suggested = items.filter((i) => i.suggestion).length;

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Da classificare <span className="text-brand-400">· {items.length}</span>
        </h2>
        {suggested > 0 && !month.closed && (
          <button
            onClick={() => applySuggestions(month.id)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition"
          >
            <IconSparkle size={15} /> Conferma i {suggested} suggeriti
          </button>
        )}
      </div>
      <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 overflow-hidden divide-y divide-ink-800/70">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <InboxRow month={month} item={item} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Scrivi cos'è e scegli dove metterlo: la prossima volta che importi lo stesso
        esercente te lo proporrò in automatico.
      </p>
    </div>
  );
}

function InboxRow({ month, item }: { month: Month; item: InboxItem }) {
  const setInboxNote = useStore((s) => s.setInboxNote);
  const classifyInbox = useStore((s) => s.classifyInbox);
  const ignoreInbox = useStore((s) => s.ignoreInbox);
  const [note, setNote] = useState(item.note);
  useEffect(() => setNote(item.note), [item.note]);

  const disabled = month.closed;
  const credit = item.tx.amount > 0;
  const suggestionLabel =
    item.suggestion === INCOME_TARGET ? "Entrate" : item.suggestion;
  const suggestionValid =
    item.suggestion === INCOME_TARGET ||
    month.sections.some((s) => s.name === item.suggestion);

  const send = (target: string) => {
    if (note !== item.note) setInboxNote(month.id, item.id, note);
    classifyInbox(month.id, item.id, target);
  };

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1.3fr)_minmax(0,1fr)_9.5rem_6.5rem_3.5rem] items-center gap-3 px-4 py-2.5">
      <span className="tabular text-xs text-slate-500">{fmtDate(item.tx.date)}</span>

      <div className="min-w-0" title={item.tx.description}>
        <div className="text-sm text-slate-200 truncate">{cleanLabel(item.tx.description)}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
          <IconBank size={11} />
          <span className="truncate">{item.tx.bankCategory}</span>
          {!item.tx.booked && (
            <span className="shrink-0 rounded px-1 bg-ink-700 text-slate-400">in attesa</span>
          )}
        </div>
      </div>

      <input
        value={note}
        disabled={disabled}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== item.note && setInboxNote(month.id, item.id, note)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && item.suggestion && suggestionValid) send(item.suggestion);
        }}
        placeholder="Cos'è?"
        className="rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 placeholder:text-slate-600"
      />

      <select
        value=""
        disabled={disabled}
        onChange={(e) => e.target.value && send(e.target.value)}
        className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
      >
        <option value="">{suggestionValid ? `→ ${suggestionLabel}` : "Sposta in…"}</option>
        <option value={INCOME_TARGET}>Entrate</option>
        {month.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <span
        className={`tabular text-sm text-right font-medium ${credit ? "text-good-400" : "text-slate-100"}`}
      >
        {formatSignedEur(item.tx.amount)}
      </span>

      <div className="flex justify-end gap-1.5">
        {item.suggestion && suggestionValid && !disabled && (
          <button
            onClick={() => send(item.suggestion!)}
            title={`Conferma in ${suggestionLabel}`}
            className="text-brand-400 hover:text-good-400 transition"
          >
            <IconCheck size={16} />
          </button>
        )}
        {!disabled && (
          <button
            onClick={() => ignoreInbox(month.id, item.id)}
            title="Ignora questo movimento"
            className="text-slate-600 hover:text-bad-400 transition"
          >
            <IconX size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
