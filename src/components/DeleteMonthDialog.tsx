import type { Month } from "../types";
import { Modal } from "./Modal";
import { IconTrash } from "./icons";

interface Props {
  month: Month | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

/** In-app confirmation: window.confirm() does nothing inside the Tauri webview. */
export function DeleteMonthDialog({ month, onClose, onConfirm }: Props) {
  const imported = month
    ? (month.inbox?.length ?? 0) +
      [...month.income, ...month.sections.flatMap((s) => s.rows)].filter((r) => r.tx).length
    : 0;

  return (
    <Modal
      open={month != null}
      title="Elimina mese"
      icon={<IconTrash size={18} />}
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
            onClick={() => month && onConfirm(month.id)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-bad-500 hover:bg-bad-400 text-white transition"
          >
            Elimina
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-300">
        Eliminare <span className="text-white font-medium">{month?.name}</span>? Non si può
        annullare.
      </p>
      {month?.closed && (
        <p className="text-xs text-slate-400 mt-2">
          Il mese è chiuso: anche il suo movimento nel conto verrà tolto.
        </p>
      )}
      {imported > 0 && (
        <p className="text-xs text-slate-400 mt-2">
          Contiene {imported} movimenti importati: reimportando l'estratto conto torneranno da
          classificare.
        </p>
      )}
    </Modal>
  );
}
