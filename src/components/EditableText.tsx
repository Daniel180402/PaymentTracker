import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Click-to-edit text. Renders as plain text until focused. */
export function EditableText({
  value,
  onCommit,
  placeholder = "",
  disabled,
  className = "",
}: Props) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <input
      ref={ref}
      disabled={disabled}
      className={`bg-transparent outline-none placeholder:text-slate-600 ${className}`}
      placeholder={placeholder}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
