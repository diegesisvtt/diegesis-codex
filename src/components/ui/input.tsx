// CAMADA 2 — Inputs táticos. TacticalInput (com ícone prefixado) e CommandInput
// (prompt de terminal com ação de envio). Anel de foco ciano unificado.

import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

const FIELD =
  'flex items-center gap-1.5 rounded-md bg-overlay/80 border px-2 transition-all duration-150 ' +
  'focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/50';

const FIELD_INVALID = 'border-danger/60';
const FIELD_NORMAL = 'border-line';

export interface TacticalInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  mono?: boolean;
  invalid?: boolean;
}

export function TacticalInput({ icon, mono = false, invalid = false, className = '', ...props }: TacticalInputProps) {
  return (
    <div className={`${FIELD} ${invalid ? FIELD_INVALID : FIELD_NORMAL} ${className}`}>
      {icon && <span className="text-ink-3 shrink-0">{icon}</span>}
      <input
        {...props}
        spellCheck={false}
        className={`w-full min-w-0 bg-transparent py-1.5 text-[12px] outline-none text-ink-1 placeholder:text-ink-3 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

export interface CommandInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** prompt prefixado (ex.: "/" para comandos, "❯" para terminal de dados) */
  prompt?: ReactNode;
  /** ação de envio à direita do campo */
  action?: ReactNode;
  invalid?: boolean;
  /** ref do input (ex.: focar após inserir um dado) */
  inputRef?: Ref<HTMLInputElement>;
}

export function CommandInput({
  prompt = '/',
  action,
  invalid = false,
  inputRef,
  className = '',
  ...props
}: CommandInputProps) {
  return (
    <div className={`${FIELD} ${invalid ? FIELD_INVALID : FIELD_NORMAL} ${className}`}>
      <span className="text-ink-3 shrink-0 font-mono select-none">{prompt}</span>
      <input
        {...props}
        ref={inputRef}
        spellCheck={false}
        className="w-full min-w-0 bg-transparent py-1.5 text-[12px] font-mono outline-none text-ink-1 placeholder:text-ink-3"
      />
      {action}
    </div>
  );
}
