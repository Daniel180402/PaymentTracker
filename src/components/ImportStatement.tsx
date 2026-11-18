import { useRef, useState } from "react";
import { useStore, type ImportOutcome } from "../store";
import { formatEur } from "../money";
import { Modal } from "./Modal";
import { IconUpload } from "./icons";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/** Sidebar button: pick an Intesa Sanpaolo PDF and import it. */
export function ImportStatement() {
  const importStatement = useStore((s) => s.importStatement);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setWarning(null);
    try {
      const { loadStatement } = await import("../import/loadStatement");
      const statement = await loadStatement(file);
      if (statement.declaredCount != null && statement.declaredCount !== statement.txs.length) {
        setWarning(
          `La banca dichiara ${statement.declaredCount} movimenti, ne ho letti ${statement.txs.length}.`,
        );
      }
      setOutcome(importStatement(statement));
    } catch (e) {
      console.error(e);
      setOutcome({ ok: false, error: "Impossibile leggere il PDF." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border border-dashed border-ink-600 text-slate-300 hover:text-white hover:border-brand-500 transition disabled:opacity-60"
      >
        <IconUpload size={18} />
        {busy ? "Lettura in corso…" : "Importa estratto conto"}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <Modal
        open={outcome != null}
        title={outcome?.ok ? "Estratto conto importato" : "Import non riuscito"}
        icon={<IconUpload size={18} />}
        onClose={() => setOutcome(null)}
        footer={
          <button
            onClick={() => setOutcome(null)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition"
          >
            {outcome?.ok && outcome.added > 0 ? "Classifica le spese" : "Chiudi"}
          </button>
        }
      >
        {outcome && !outcome.ok && <p className="text-sm text-bad-400">{outcome.error}</p>}
        {outcome?.ok && (
          <div className="text-sm text-slate-300 space-y-3">
            <p>
              Stipendio del{" "}
              <span className="text-white font-medium">{fmtDate(outcome.salaryDate)}</span>:{" "}
              <span className="tabular font-semibold text-good-400">
                {formatEur(outcome.salaryAmount)}
              </span>
              . {outcome.created ? "Ho creato il mese" : "Aggiornato il mese"}{" "}
              <span className="text-white font-medium">{outcome.monthName}</span>.
            </p>
            <ul className="space-y-1 text-slate-400">
              <li>
                <span className="tabular text-white font-semibold">{outcome.added}</span> nuovi
                movimenti da classificare
              </li>
              {outcome.updated > 0 && (
                <li>
                  <span className="tabular text-white font-semibold">{outcome.updated}</span>{" "}
                  pagamenti in attesa ora contabilizzati
                </li>
              )}
              {outcome.skipped > 0 && (
                <li>
                  <span className="tabular text-white font-semibold">{outcome.skipped}</span> già
                  presenti, saltati
                </li>
              )}
              {outcome.before > 0 && (
                <li>
                  <span className="tabular text-white font-semibold">{outcome.before}</span>{" "}
                  movimenti precedenti allo stipendio esclusi
                </li>
              )}
            </ul>
          </div>
        )}
        {warning && <p className="text-xs text-brand-400 mt-3">{warning}</p>}
      </Modal>
    </>
  );
}
