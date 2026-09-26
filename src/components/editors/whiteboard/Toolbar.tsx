import React from 'react';
import {
  MousePointer2,
  Hand,
  Type,
  Heading1,
  Heading2,
  Heading3,
  StickyNote,
  Gauge,
  Clock,
  Swords,
  ArrowUpRight,
  Image,
  Group,
  Ungroup,
  Trash2,
} from 'lucide-react';
import type { ShapeType, TextSize } from './model';

/** Canvas tools, tldraw-style: 'select' manipulates, 'hand' pans, the rest create shapes */
export type WBTool = 'select' | 'hand' | Exclude<ShapeType, 'group'>;

interface ToolbarProps {
  tool: WBTool;
  onToolChange(tool: WBTool): void;
  /** present when exactly one text shape is selected — shows the style switcher */
  textStyle?: { size: TextSize; onChange(size: TextSize): void } | null;
  canGroup: boolean;
  canUngroup: boolean;
  canDelete: boolean;
  onGroup(): void;
  onUngroup(): void;
  onDelete(): void;
  /** grid snapping toggle (Alt bypasses while dragging) */
  snapEnabled?: boolean;
  onToggleSnap?(): void;
}

function ToolButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`p-2 rounded-md transition-colors flex items-center justify-center ${
        active
          ? 'text-accent-ink bg-accent-soft'
          : disabled
            ? 'text-ink-3/40 cursor-default'
            : 'text-ink-2 hover:text-ink-1 hover:bg-hover'
      }`}
    >
      <Icon size={17} strokeWidth={1.75} />
    </button>
  );
}

const Divider = () => <div className="w-px h-5 bg-line mx-1 shrink-0" />;

const CREATE_TOOLS: { tool: WBTool; label: string; icon: typeof Type }[] = [
  { tool: 'text', label: 'Texto (T)', icon: Type },
  { tool: 'note', label: 'Bloco de texto (N)', icon: StickyNote },
  { tool: 'tracker', label: 'Tracker', icon: Gauge },
  { tool: 'clock', label: 'Relógio', icon: Clock },
  { tool: 'initiative', label: 'Iniciativa', icon: Swords },
  { tool: 'arrow', label: 'Seta (A)', icon: ArrowUpRight },
  { tool: 'image', label: 'Imagem (I)', icon: Image },
];

const TEXT_STYLES: { size: TextSize; label: string; icon: typeof Type }[] = [
  { size: 'text', label: 'Texto', icon: Type },
  { size: 'h1', label: 'Título 1', icon: Heading1 },
  { size: 'h2', label: 'Título 2', icon: Heading2 },
  { size: 'h3', label: 'Título 3', icon: Heading3 },
];

export function WhiteboardToolbar({
  tool,
  onToolChange,
  textStyle,
  canGroup,
  canUngroup,
  canDelete,
  onGroup,
  onUngroup,
  onDelete,
}: ToolbarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 animate-fade-up">
      <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl bg-elevated/95 backdrop-blur border border-line shadow-2xl">
        <ToolButton
          icon={MousePointer2}
          label="Selecionar (V)"
          active={tool === 'select'}
          onClick={() => onToolChange('select')}
        />
        <ToolButton
          icon={Hand}
          label="Mover tela (H ou Espaço)"
          active={tool === 'hand'}
          onClick={() => onToolChange('hand')}
        />
        <Divider />
        {CREATE_TOOLS.map(({ tool: t, label, icon }) => (
          <ToolButton key={t} icon={icon} label={label} active={tool === t} onClick={() => onToolChange(t)} />
        ))}

        {/* contextual: text style switcher for the selected text shape */}
        {textStyle && (
          <>
            <Divider />
            {TEXT_STYLES.map(({ size, label, icon }) => (
              <ToolButton
                key={size}
                icon={icon}
                label={label}
                active={textStyle.size === size}
                onClick={() => textStyle.onChange(size)}
              />
            ))}
          </>
        )}

        <Divider />
        <ToolButton icon={Group} label="Agrupar (Ctrl+G)" disabled={!canGroup} onClick={onGroup} />
        <ToolButton icon={Ungroup} label="Desagrupar (Ctrl+Shift+G)" disabled={!canUngroup} onClick={onUngroup} />
        <ToolButton icon={Trash2} label="Excluir (Del)" disabled={!canDelete} onClick={onDelete} />
      </div>
    </div>
  );
}
