import { motion } from "motion/react";
import { accountTotal, useStore } from "../store";
import { formatSignedEur } from "../money";
import { IconCalendar, IconLedger, IconWallet } from "./icons";
import { ImportStatement } from "./ImportStatement";

const NAV = [
  { key: "month", label: "Mese corrente", icon: IconCalendar },
  { key: "summary", label: "Riepilogo mesi", icon: IconWallet },
  { key: "account", label: "Conto", icon: IconLedger },
] as const;

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const ledger = useStore((s) => s.data.ledger);
  const total = accountTotal(ledger);
  const positive = total >= 0;

  return (
    <aside className="w-60 shrink-0 flex flex-col gap-6 p-5 border-r border-ink-800 bg-ink-900/40">
      <div className="flex items-center gap-2.5 px-1">
        <div className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-good-500 text-white shadow-lg shadow-brand-600/30">
          <IconWallet size={20} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">PaymentTracker</div>
          <div className="text-[11px] text-slate-500">Gestione spese</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = view === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-ink-800/60"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-ink-700/70 border border-ink-600"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">
                <Icon size={18} />
              </span>
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <ImportStatement />

      <div className="mt-auto rounded-2xl border border-ink-700 bg-ink-850/80 p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
          Saldo del conto
        </div>
        <div
          className={`tabular text-2xl font-bold ${
            positive ? "text-good-400" : "text-bad-400"
          }`}
        >
          {formatSignedEur(total)}
        </div>
        {ledger.length === 0 ? (
          <button
            onClick={() => setView("account")}
            className="text-[11px] text-brand-400 hover:text-brand-300 mt-1 transition"
          >
            Inserisci i mesi passati →
          </button>
        ) : (
          <div className="text-[11px] text-slate-500 mt-1">
            {ledger.length} {ledger.length === 1 ? "movimento" : "movimenti"}
          </div>
        )}
      </div>
    </aside>
  );
}
