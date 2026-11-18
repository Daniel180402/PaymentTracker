import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  monthIncome,
  monthResult,
  monthSpent,
  selectActiveMonth,
  sumRows,
  useStore,
} from "../store";
import { formatEur, formatSignedEur } from "../money";
import { CategoryTable } from "../components/CategoryTable";
import { CloseMonthDialog } from "../components/CloseMonthDialog";
import { EditableText } from "../components/EditableText";
import { InboxTable } from "../components/InboxTable";
import { IconLock, IconPlus, IconUnlock } from "../components/icons";

export function CurrentMonth() {
  const month = useStore(selectActiveMonth);
  const months = useStore((s) => s.data.months);
  const setActiveMonth = useStore((s) => s.setActiveMonth);
  const addMonth = useStore((s) => s.addMonth);
  const renameMonth = useStore((s) => s.renameMonth);
  const addSection = useStore((s) => s.addSection);
  const renameSection = useStore((s) => s.renameSection);
  const deleteSection = useStore((s) => s.deleteSection);
  const upsertRow = useStore((s) => s.upsertRow);
  const deleteRow = useStore((s) => s.deleteRow);
  const closeMonth = useStore((s) => s.closeMonth);
  const reopenMonth = useStore((s) => s.reopenMonth);

  const [closing, setClosing] = useState(false);

  if (!month) {
    return (
      <Empty
        onCreate={() => addMonth()}
      />
    );
  }

  const income = monthIncome(month);
  const spent = monthSpent(month);
  const result = monthResult(month);
  const positive = result >= 0;
  const pct = income > 0 ? Math.min(100, (spent / income) * 100) : spent > 0 ? 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="flex items-center gap-3 px-7 py-5 border-b border-ink-800">
        <div className="flex-1 min-w-0">
          <EditableText
            value={month.name}
            onCommit={(v) => renameMonth(month.id, v)}
            disabled={month.closed}
            className="text-2xl font-bold text-white truncate w-full"
          />
          <div className="text-xs text-slate-500 mt-0.5">
            {month.closed ? "Mese chiuso · sola lettura" : "Mese in corso"}
          </div>
        </div>

        <select
          value={month.id}
          onChange={(e) => setActiveMonth(e.target.value)}
          className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          {months.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.closed ? " ✓" : ""}
            </option>
          ))}
        </select>

        <button
          onClick={() => addMonth()}
          title="Nuovo mese"
          className="grid place-items-center h-9 w-9 rounded-lg border border-ink-700 text-slate-300 hover:text-white hover:border-brand-500 transition"
        >
          <IconPlus size={18} />
        </button>

        {month.closed ? (
          <button
            onClick={() => reopenMonth(month.id)}
            className="flex items-center gap-2 px-4 h-9 rounded-lg border border-ink-700 text-sm font-medium text-slate-200 hover:border-brand-500 transition"
          >
            <IconUnlock size={16} /> Riapri
          </button>
        ) : (
          <button
            onClick={() => setClosing(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition"
          >
            <IconLock size={16} /> Chiudi mese
          </button>
        )}
      </div>

      {/* scroll area */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* stat row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Entrate" value={formatEur(income)} tone="income" />
          <Stat label="Spese totali" value={formatEur(spent)} tone="spend" />
          <Stat
            label={positive ? "Surplus" : "Deficit"}
            value={formatSignedEur(result)}
            tone={positive ? "good" : "bad"}
            big
          />
        </div>

        {/* spend progress */}
        <div className="mb-7">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Speso sul totale entrate</span>
            <span className="tabular">
              {formatEur(spent)} / {formatEur(income)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-ink-800 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                spent > income ? "bg-bad-500" : "bg-gradient-to-r from-brand-500 to-good-500"
              }`}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 180, damping: 26 }}
            />
          </div>
        </div>

        <InboxTable month={month} />

        {/* income table */}
        <div className="mb-7">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
            Entrate della casa
          </h2>
          <div className="max-w-xl">
            <CategoryTable
              title="Entrate"
              rows={month.income}
              total={income}
              accent="income"
              disabled={month.closed}
              onUpsert={(rowId, patch) =>
                upsertRow(month.id, { kind: "income" }, rowId, patch)
              }
              onDeleteRow={(rowId) =>
                deleteRow(month.id, { kind: "income" }, rowId)
              }
            />
          </div>
        </div>

        {/* expense sections */}
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Categorie di spesa
          </h2>
          {!month.closed && (
            <button
              onClick={() => addSection(month.id, "Nuova categoria")}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition"
            >
              <IconPlus size={15} /> Aggiungi categoria
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-4">
          <AnimatePresence initial={false}>
            {month.sections.map((s) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <CategoryTable
                  title={s.name}
                  rows={s.rows}
                  total={sumRows(s.rows)}
                  disabled={month.closed}
                  onRename={(v) => renameSection(month.id, s.id, v)}
                  onDeleteSection={() => deleteSection(month.id, s.id)}
                  onUpsert={(rowId, patch) =>
                    upsertRow(month.id, { kind: "section", sectionId: s.id }, rowId, patch)
                  }
                  onDeleteRow={(rowId) =>
                    deleteRow(month.id, { kind: "section", sectionId: s.id }, rowId)
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <CloseMonthDialog
        open={closing}
        month={month}
        onClose={() => setClosing(false)}
        onConfirm={(amount, note, date) => {
          closeMonth(month.id, amount, note, date);
          setClosing(false);
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone: "income" | "spend" | "good" | "bad";
  big?: boolean;
}) {
  const color =
    tone === "good"
      ? "text-good-400"
      : tone === "bad"
        ? "text-bad-400"
        : "text-white";
  const ring =
    tone === "good"
      ? "border-good-500/30 bg-good-500/5"
      : tone === "bad"
        ? "border-bad-500/30 bg-bad-500/5"
        : "border-ink-700 bg-ink-850/70";
  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className={`tabular font-bold ${big ? "text-3xl" : "text-2xl"} ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center h-full text-center">
      <div>
        <p className="text-slate-400 mb-4">Nessun mese ancora creato.</p>
        <button
          onClick={onCreate}
          className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition"
        >
          Crea il primo mese
        </button>
      </div>
    </div>
  );
}
