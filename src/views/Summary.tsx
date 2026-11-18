import { motion } from "motion/react";
import {
  monthIncome,
  monthResult,
  monthSpent,
  useStore,
} from "../store";
import { formatEur, formatSignedEur } from "../money";
import { IconCheck, IconPlus, IconTrash } from "../components/icons";

export function Summary() {
  const months = useStore((s) => s.data.months);
  const setActiveMonth = useStore((s) => s.setActiveMonth);
  const addMonth = useStore((s) => s.addMonth);
  const deleteMonth = useStore((s) => s.deleteMonth);

  const ordered = [...months].reverse();
  const totals = months.reduce(
    (acc, m) => {
      acc.income += monthIncome(m);
      acc.spent += monthSpent(m);
      return acc;
    },
    { income: 0, spent: 0 },
  );
  const net = totals.income - totals.spent;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-7 py-5 border-b border-ink-800">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Riepilogo mesi</h1>
          <div className="text-xs text-slate-500 mt-0.5">
            {months.length} {months.length === 1 ? "mese" : "mesi"} · netto
            complessivo{" "}
            <span className={net >= 0 ? "text-good-400" : "text-bad-400"}>
              {formatSignedEur(net)}
            </span>
          </div>
        </div>
        <button
          onClick={() => addMonth()}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-brand-600 hover:bg-brand-500 text-sm font-semibold text-white transition"
        >
          <IconPlus size={16} /> Nuovo mese
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Mini label="Entrate totali" value={formatEur(totals.income)} />
          <Mini label="Spese totali" value={formatEur(totals.spent)} />
          <Mini
            label="Risultato netto"
            value={formatSignedEur(net)}
            tone={net >= 0 ? "good" : "bad"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ordered.map((m) => {
            const result = monthResult(m);
            const positive = result >= 0;
            return (
              <motion.button
                key={m.id}
                layout
                onClick={() => setActiveMonth(m.id)}
                className="group text-left rounded-2xl border border-ink-700 bg-ink-850/70 p-4 hover:border-brand-500/60 transition"
                whileHover={{ y: -2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-white">{m.name}</span>
                  {m.closed && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-good-400 bg-good-500/10 border border-good-500/30 rounded-full px-2 py-0.5">
                      <IconCheck size={11} /> Chiuso
                    </span>
                  )}
                  {!m.closed && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-400 bg-brand-500/10 border border-brand-500/30 rounded-full px-2 py-0.5">
                      In corso
                    </span>
                  )}
                  <span className="flex-1" />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Eliminare il mese «${m.name}»?`)) deleteMonth(m.id);
                    }}
                    className="text-slate-700 hover:text-bad-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Elimina mese"
                  >
                    <IconTrash size={15} />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Cell label="Entrate" value={formatEur(monthIncome(m))} />
                  <Cell label="Spese" value={formatEur(monthSpent(m))} />
                  <Cell
                    label={positive ? "Surplus" : "Deficit"}
                    value={formatSignedEur(result)}
                    tone={positive ? "good" : "bad"}
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-good-400" : tone === "bad" ? "text-bad-400" : "text-white";
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850/70 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className={`tabular text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-good-400" : tone === "bad" ? "text-bad-400" : "text-slate-200";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div>
      <div className={`tabular text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
