// Editor inline de texto sobre o canvas (estilo tldraw): textarea posicionada
// exatamente sobre o shape, estilizada com a mesma fonte/tamanho/cor, com uma
// barra de estilo (fonte, tamanho, cor, negrito/itálico) que aplica ao vivo.
// Enter/blur commita; Escape cancela; texto vazio remove o shape.

import { useEffect, useRef, useState } from 'react';
import type { Canvas } from '@diegesis/canvas';
import type { CustomFont } from '../../../../shared/types';
import { FONT_OPTIONS, resolveFont, type DungeonShape } from './model';
import { controllerOf } from './canvas/controller';

export function InlineTextEditor({
  canvas,
  shapeId,
  fresh,
  realmFonts,
  onClose,
}: {
  canvas: Canvas;
  shapeId: string;
  /** true quando o shape acabou de ser criado pela text tool */
  fresh: boolean;
  realmFonts: CustomFont[];
  onClose(): void;
}) {
  const placeable = canvas.documents.get('dungeon-shape', shapeId);
  const shape = placeable?.document as DungeonShape | undefined;
  const [value, setValue] = useState(shape?.text ?? '');
  const originalRef = useRef(shape?.text ?? '');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // esconde o shape no canvas enquanto edita (o textarea é o texto visível)
  useEffect(() => {
    if (placeable) placeable.visible = false;
    return () => {
      if (placeable) placeable.visible = true;
    };
  }, [placeable]);

  // auto-resize do textarea conforme o conteúdo
  useEffect(() => {
    const el = areaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  if (!shape) return null;

  const zoom = canvas.viewport?.pixi.scale.x ?? 1;
  const screen = canvas.toScreen(shape.x, shape.y);
  const fontFamily = resolveFont(shape.font);
  const fontSize = (shape.size ?? 15) * zoom;

  const commit = () => {
    const ctrl = controllerOf(canvas);
    const text = value.trim();
    if (!text) ctrl.removeShape(shapeId);
    else ctrl.updateShape(shapeId, { text: value });
    onClose();
  };

  const cancel = () => {
    const ctrl = controllerOf(canvas);
    if (fresh || !originalRef.current.trim()) ctrl.removeShape(shapeId);
    else ctrl.updateShape(shapeId, { text: originalRef.current });
    onClose();
  };

  const setStyle = (changes: Partial<DungeonShape>) => controllerOf(canvas).updateShape(shapeId, changes);

  const inputCls =
    'rounded-md border border-line bg-app px-1.5 py-1 text-[11px] text-ink-1 outline-none focus:border-accent';

  return (
    <div className="absolute z-30" style={{ left: screen.x, top: screen.y }}>
      {/* barra de estilo */}
      <div className="absolute bottom-full left-0 mb-1.5 flex items-center gap-1 rounded-lg border border-line bg-elevated p-1 shadow-lg whitespace-nowrap">
        <select
          value={shape.font ?? 'inherit'}
          onChange={(e) => setStyle({ font: e.target.value })}
          className={inputCls}
          title="Fonte"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          {realmFonts.map((f) => (
            <option key={f.id} value={`"${f.name}"`}>
              {f.name} (realm)
            </option>
          ))}
        </select>
        <input
          type="number"
          value={shape.size ?? 15}
          min={8}
          max={96}
          onChange={(e) => {
            const size = e.target.valueAsNumber;
            if (!Number.isNaN(size)) setStyle({ size });
          }}
          className={`${inputCls} w-14 text-right`}
          title="Tamanho"
        />
        <button
          title="Negrito"
          onClick={() => setStyle({ bold: !shape.bold })}
          className={`px-1.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
            shape.bold ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
          }`}
        >
          B
        </button>
        <button
          title="Itálico"
          onClick={() => setStyle({ italic: !shape.italic })}
          className={`px-1.5 py-1 rounded-md text-[11px] italic transition-colors ${
            shape.italic ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
          }`}
        >
          I
        </button>
        <input
          type="color"
          value={shape.color}
          onChange={(e) => setStyle({ color: e.target.value })}
          title="Cor"
          className="w-7 h-7 rounded-md border border-line bg-app cursor-pointer"
        />
      </div>
      <textarea
        ref={areaRef}
        autoFocus
        value={value}
        placeholder="Texto…"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') cancel();
          e.stopPropagation();
        }}
        rows={1}
        className="block min-w-24 rounded-md outline-none resize-none overflow-hidden bg-transparent"
        style={{
          fontFamily,
          fontSize,
          fontWeight: shape.bold ? 700 : 400,
          fontStyle: shape.italic ? 'italic' : 'normal',
          color: shape.color,
          textShadow: '0 0 3px #090c12, 0 0 3px #090c12',
          border: '1px dashed var(--color-accent)',
          padding: '2px 4px',
          lineHeight: 1.25,
        }}
      />
    </div>
  );
}
