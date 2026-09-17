import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * Parse inline math commands typed into a numeric input:
 *   "+5"  -> current + 5
 *   "-5"  -> current - 5
 *   "=-7" -> set to -7 (absolute, allows negatives)
 *   "12"  -> set to 12 (absolute)
 * Returns null for unparseable input (the input reverts to the current value).
 */
export function parseMathCommand(input: string, current: number): number | null {
  const m = input.trim().match(/^([+-=]?)\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const n = parseFloat(m[2].replace(',', '.'));
  if (Number.isNaN(n)) return null;
  switch (m[1]) {
    case '+':
      return current + n;
    case '-':
      return current - n;
    default:
      return n; // '=' or plain number: absolute set
  }
}

interface MathInputProps {
  value: number;
  onCommit(next: number): void;
  step?: number;
  min?: number;
  max?: number;
  readOnly?: boolean;
  showSteppers?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * Numeric input with inline math commands and custom steppers.
 * Displays the committed value; while focused the user edits a draft that is
 * parsed on Enter/blur (Escape reverts). Native number spinners are not used —
 * the +/- steppers are custom and appear on hover/focus.
 */
export function MathInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  readOnly = false,
  showSteppers = true,
  className = '',
  inputClassName = '',
}: MathInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** draft text while editing; null when displaying the committed value */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === '' || text === String(value)) return; // untouched: no-op
    const next = parseMathCommand(text, value);
    if (next === null) return; // invalid: revert to committed value
    onCommit(clamp(next));
  };

  const nudge = (delta: number) => {
    setDraft(null);
    onCommit(clamp(value + delta));
  };

  if (readOnly) {
    return (
      <div className={`${className}`}>
        <div className={`${inputClassName} tabular-nums`}>{value}</div>
      </div>
    );
  }

  return (
    <div className={`relative group/math ${className}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={`tabular-nums ${inputClassName}`}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(String(value));
          e.target.select();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(null);
            inputRef.current?.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(e.key === 'ArrowUp' ? step : -step);
          }
        }}
      />
      {showSteppers && (
        <>
          <button
            tabIndex={-1}
            title={`-${step}`}
            onPointerDown={(e) => e.preventDefault()} // keep input focus
            onClick={() => nudge(-step)}
            className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-md text-ink-3 hover:text-ink-1 hover:bg-active opacity-0 group-hover/math:opacity-100 focus-within:opacity-100 transition-all duration-150"
          >
            <Minus size={12} strokeWidth={2} />
          </button>
          <button
            tabIndex={-1}
            title={`+${step}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => nudge(step)}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-md text-ink-3 hover:text-ink-1 hover:bg-active opacity-0 group-hover/math:opacity-100 focus-within:opacity-100 transition-all duration-150"
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}
