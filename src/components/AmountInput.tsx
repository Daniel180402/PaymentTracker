import { useEffect, useRef, useState } from "react";
import { formatPlain, parseEur } from "../money";

interface Props {
  /** value in integer cents */
  value: number;
  onCommit: (cents: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** when true, an empty field commits 0 instead of being ignored */
  allowEmpty?: boolean;
}

/** Euro amount field. Shows a clean "1.234,56" while idle, raw text while
 *  editing, parses to integer cents on blur / Enter. */
export function AmountInput({
  value,
  onCommit,
  placeholder = "0,00",
  disabled,
  className = "",
  allowEmpty,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ? formatPlain(value) : "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseEur(draft);
    if (parsed == null) {
      if (allowEmpty || draft.trim() === "") onCommit(0);
      return;
    }
    onCommit(parsed);
  };

  return (
    <input
      ref={ref}
      inputMode="decimal"
      disabled={disabled}
      className={`tabular text-right outline-none bg-transparent ${className}`}
      placeholder={placeholder}
      value={editing ? draft : value ? formatPlain(value) : ""}
      onFocus={(e) => {
        setEditing(true);
        setDraft(value ? formatPlain(value) : "");
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
