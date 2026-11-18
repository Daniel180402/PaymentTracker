import { useRef, useState } from "react";
import { analyzeStatement, useStore, type ImportAnalysis, type ImportOutcome } from "../store";
import type { ParsedStatement } from "../import/types";
import { formatEur } from "../money";
import { Modal } from "./Modal";
import { IconUpload } from "./icons";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; statement: ParsedStatement; analysis: Extract<ImportAnalysis, { ok: true }> }
  | { kind: "done"; outcome: ImportOutcome };

/** Sidebar button: pick an Intesa Sanpaolo PDF and import it. */
export function ImportStatement() {
  const importStatement = useStore((s) => s.importStatement);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [closing, setClosing] = useState(false);
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
      const analysis = analyzeStatement(useStore.getState().data, statement);
      if (!analysis.ok) {
        setPhase({ kind: "done", outcome: analysis });
      } else if (analysis.closable) {
        // a salary newer than the open month: ask whether this closes it
        setClosing(true);
        setPhase({ kind: "confirm", statement, analysis });
      } else {
        setPhase({ kind: "done", outcome: importStatement(statement) });
      }
    } catch (e) {
      console.error(e);
      setPhase({ kind: "done", outcome: { ok: false, error: "Impossibile leggere il PDF." } });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const close = () => setPhase({ kind: "idle" });

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] whitespace-nowrap font-medium border border-dashed border-ink-600 text-slate-300 hover:text-white hover:border-brand-500 transition disabled:opacity-60"
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

      {phase.kind === "confirm" && (
        <ConfirmDialog
          analysis={phase.analysis}
          closing={closing}
          setClosing={setClosing}
          onCancel={close}
          onConfirm={() =>
            setPhase({ kind: "done", outcome: importStatement(phase.statement, { closing }) })
          }
        />
      )}

      <ResultDialog
        outcome={phase.kind === "done" ? phase.outcome : null}
        warning={warning}
        onClose={close}
      />
    </>
  );
}

function ConfirmDialog({
  analysis,
  closing,
  setClosing,
  onCancel,
  onConfirm,
}: {
  analysis: Extract<ImportAnalysis, { ok: true }>;
  closing: boolean;
  setClosing: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const current = analysis.closable!;
  return (
    <Modal
      open
      title="Nuovo stipendio trovato"
      icon={<IconUpload size={18} />}
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-ink-700/60 transition"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition shadow-lg shadow-brand-600/30"
          >
            Importa
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-4">
        Nell'estratto c'è lo stipendio del{" "}
        <span className="text-white font-medium">{fmtDate(analysis.salaryDate)}</span> (
        <span className="tabular text-good-400 font-semibold">
          {formatEur(analysis.salaryAmount)}
        </span>
        ), più recente di quello del mese aperto{" "}
        <span className="text-white font-medium">{current.name}</span>
        {current.salaryDate && <> ({fmtDate(current.salaryDate)})</>}.
      </p>

      <label className="flex gap-3 rounded-xl border border-ink-700 bg-ink-900/50 p-3 cursor-pointer has-[:checked]:border-brand-500/60 has-[:checked]:bg-brand-500/5 transition">
        <input
          type="checkbox"
          checked={closing}
          onChange={(e) => setClosing(e.target.checked)}
          className="mt-0.5 accent-brand-500"
        />
        <span className="text-sm">
          <span className="block font-medium text-slate-100">
            Import di chiusura: contiene il nuovo stipendio
          </span>
          <span className="block text-xs text-slate-400 mt-0.5">
            Le spese fino al nuovo stipendio completano <b>{current.name}</b>, quelle dopo
            vanno nel nuovo mese. Poi classifichi le ultime spese e premi "Chiudi mese".
          </span>
        </span>
      </label>
      {!closing && (
        <p className="text-xs text-slate-500 mt-3">
          Senza chiusura viene creato solo il nuovo mese: le spese prima del nuovo stipendio non
          vengono importate.
        </p>
      )}
    </Modal>
  );
}

function ResultDialog({
  outcome,
  warning,
  onClose,
}: {
  outcome: ImportOutcome | null;
  warning: string | null;
  onClose: () => void;
}) {
  const toClassify = outcome?.ok ? outcome.months.reduce((n, m) => n + m.added, 0) : 0;
  return (
    <Modal
      open={outcome != null}
      title={outcome?.ok ? "Estratto conto importato" : "Import non riuscito"}
      icon={<IconUpload size={18} />}
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition"
        >
          {toClassify > 0 ? "Classifica le spese" : "Chiudi"}
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
            .
          </p>
          {outcome.months.map((m) => (
            <div key={m.name + m.created} className="rounded-xl border border-ink-700 bg-ink-900/40 p-3">
              <div className="text-white font-medium mb-1">
                {m.name}{" "}
                <span className="text-xs font-normal text-slate-500">
                  {m.created ? "· nuovo mese" : outcome.closing ? "· completato" : "· aggiornato"}
                </span>
              </div>
              <ul className="space-y-0.5 text-slate-400">
                <li>
                  <span className="tabular text-white font-semibold">{m.added}</span> nuovi
                  movimenti da classificare
                </li>
                {m.updated > 0 && (
                  <li>
                    <span className="tabular text-white font-semibold">{m.updated}</span>{" "}
                    pagamenti in attesa ora contabilizzati
                  </li>
                )}
                {m.skipped > 0 && (
                  <li>
                    <span className="tabular text-white font-semibold">{m.skipped}</span> già
                    presenti, saltati
                  </li>
                )}
              </ul>
            </div>
          ))}
          {outcome.before > 0 && (
            <p className="text-slate-500">
              <span className="tabular text-slate-300 font-semibold">{outcome.before}</span>{" "}
              movimenti precedenti esclusi
            </p>
          )}
          {outcome.closing && (
            <p className="text-xs text-brand-400">
              Classifica le ultime spese di {outcome.months[0].name} e poi premi "Chiudi mese".
            </p>
          )}
        </div>
      )}
      {warning && <p className="text-xs text-brand-400 mt-3">{warning}</p>}
    </Modal>
  );
}
