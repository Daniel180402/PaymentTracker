import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Row } from "../types";
import { formatEur, parseEur } from "../money";
import { AmountInput } from "./AmountInput";
import { EditableText } from "./EditableText";
import { IconTrash } from "./icons";

interface Props {
  title: string;
  rows: Row[];
  total: number;
  disabled?: boolean;
  accent?: "income" | "expense";
  /** editable section header (omit for the income table fixed header) */
  onRename?: (v: string) => void;
  onDeleteSection?: () => void;
  onUpsert: (rowId: string | null, patch: { name?: string; amount?: number }) => void;
  onDeleteRow: (rowId: string) => void;
}

export function CategoryTable({
  title,
  rows,
  total,
  disabled,
  accent = "expense",
  onRename,
  onDeleteSection,
  onUpsert,
  onDeleteRow,
}: Props) {
  const accentDot = accent === "income" ? "bg-good-400" : "bg-brand-400";

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850/70 backdrop-blur overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700/80">
        <span className={`h-2.5 w-2.5 rounded-full ${accentDot}`} />
        {onRename ? (
          <EditableText
            value={title}
            onCommit={onRename}
            disabled={disabled}
            className="text-sm font-semibold flex-1 min-w-0 hover:text-white"
          />
        ) : (
          <span className="text-sm font-semibold flex-1">{title}</span>
        )}
        <span className="tabular text-sm font-semibold text-slate-300">
          {formatEur(total)}
        </span>
        {onDeleteSection && !disabled && (
          <button
            onClick={onDeleteSection}
            title="Elimina categoria"
            className="text-slate-500 hover:text-bad-400 transition-colors"
          >
            <IconTrash size={15} />
          </button>
        )}
      </div>

      <div className="divide-y divide-ink-800/70">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
              className="group flex items-center gap-2 px-4 h-10"
            >
              <EditableText
                value={r.name}
                onCommit={(name) => onUpsert(r.id, { name })}
                disabled={disabled}
                placeholder="Senza nome"
                className="flex-1 min-w-0 text-sm text-slate-200"
              />
              <AmountInput
                value={r.amount}
                onCommit={(amount) => onUpsert(r.id, { amount })}
                disabled={disabled}
                className="w-28 text-sm text-slate-100"
              />
              <span className="text-xs text-slate-600">€</span>
              {!disabled && (
                <button
                  onClick={() => onDeleteRow(r.id)}
                  className="text-slate-700 hover:text-bad-400 opacity-0 group-hover:opacity-100 transition"
                  title="Elimina voce"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {!disabled && <DraftRow onCreate={(p) => onUpsert(null, p)} />}
      </div>
    </div>
  );
}

function DraftRow({
  onCreate,
}: {
  onCreate: (p: { name: string; amount: number }) => void;
}) {
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const commit = (keepFocus = false) => {
    const cents = parseEur(amt) ?? 0;
    if (name.trim() !== "" || cents !== 0) {
      onCreate({ name: name.trim(), amount: cents });
      setName("");
      setAmt("");
      if (keepFocus) requestAnimationFrame(() => nameRef.current?.focus());
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-4 h-10 bg-ink-900/30"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) commit();
      }}
    >
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ Aggiungi voce…"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-600"
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget.nextElementSibling as HTMLInputElement)?.focus();
        }}
      />
      <input
        value={amt}
        inputMode="decimal"
        onChange={(e) => setAmt(e.target.value)}
        placeholder="0,00"
        className="tabular w-28 text-right bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-600"
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(true);
        }}
      />
      <span className="text-xs text-slate-700">€</span>
      <span className="w-[14px]" />
    </div>
  );
}
