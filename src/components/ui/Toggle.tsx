// CAMADA 2 — Toggle. Controle canônico para booleanos em telas de configuração
// (ver DESIGN.md). Checkboxes ficam reservados para seleção múltipla em listas;
// painéis densos usam `Check` de ui/fields.

export interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, title, className = '' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        // não propaga: permite linhas/cards clicáveis (ToggleList) que também
        // alternam o valor — sem isto o clique no toggle dispararia os dois
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative w-9 h-5 rounded-full transition-colors duration-100 shrink-0 disabled:opacity-40 ${
        checked ? 'bg-accent shadow-glow-cyan' : 'bg-line-strong'
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-100 ${
          checked ? 'translate-x-4 left-0' : 'translate-x-0.5 left-0'
        }`}
      />
    </button>
  );
}
