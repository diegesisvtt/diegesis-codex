import type { CSSProperties, SyntheticEvent } from 'react';
import type { PdfFormValue } from './model';
import type { FormFieldDef } from './forms';

interface FormLayerProps {
  /** fields already filtered to this page */
  fields: FormFieldDef[];
  values: Record<string, PdfFormValue>;
  onChange: (name: string, value: PdfFormValue) => void;
  /** whether the form overlay is shown at all */
  visible: boolean;
  /** current render scale (fit × zoom) so control sizes match the page */
  scale: number;
}

/**
 * Interactive overlay for AcroForm fields. Each field is an absolutely
 * positioned, mostly-transparent native control laid over the PDF's printed
 * form layout. The overlay is the source of truth for values (the canvas never
 * renders widget appearances), so it stays consistent across save/reload.
 */
export function FormLayer({ fields, values, onChange, visible, scale }: FormLayerProps) {
  if (!visible || fields.length === 0) return null;
  return (
    <>
      {fields.map((f, i) => (
        <FieldControl key={`${f.name}:${f.page}:${i}`} field={f} value={values[f.name]} onChange={onChange} scale={scale} />
      ))}
    </>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  scale,
}: {
  field: FormFieldDef;
  value: PdfFormValue | undefined;
  onChange: (name: string, value: PdfFormValue) => void;
  scale: number;
}) {
  const style: CSSProperties = {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.w * 100}%`,
    height: `${field.h * 100}%`,
  };
  // text controls scale with the page; a fixed px font would look tiny/huge
  const fontSize = Math.max(9, Math.round(12 * scale));
  const tickSize = Math.max(12, Math.round(14 * scale));
  // Invisible until hover/focus: the PDF already prints the field layout, so the
  // overlay only lights up the editable region when the pointer is on it.
  const shell =
    'absolute pdf-form-field z-[6] transition-colors pointer-events-auto rounded-[1px] ' +
    'ring-0 ring-accent/60 hover:ring-1 focus-within:ring-1 ' +
    'hover:bg-accent/15 focus-within:bg-accent/20';
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  switch (field.type) {
    case 'text': {
      const text = typeof value === 'string' ? value : '';
      const shared = 'w-full h-full bg-transparent px-0.5 outline-none text-black cursor-text';
      if (field.multiline) {
        return (
          <textarea
            className={`${shell} ${shared} resize-none leading-tight`}
            style={{ ...style, fontSize }}
            value={text}
            disabled={field.readOnly}
            maxLength={field.maxLen}
            spellCheck={false}
            onChange={(e) => onChange(field.name, e.target.value)}
            onPointerDown={stop}
            onPointerUp={stop}
            onClick={stop}
            onContextMenu={stop}
          />
        );
      }
      return (
        <input
          type="text"
          className={`${shell} ${shared} truncate`}
          style={{ ...style, fontSize }}
          value={text}
          disabled={field.readOnly}
          maxLength={field.maxLen}
          spellCheck={false}
          onChange={(e) => onChange(field.name, e.target.value)}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        />
      );
    }
    case 'checkbox':
      return (
        <div
          className={`${shell} flex items-center justify-center cursor-pointer`}
          style={style}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        >
          <input
            type="checkbox"
            className="accent-accent"
            style={{ width: tickSize, height: tickSize }}
            checked={value === true}
            disabled={field.readOnly}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
        </div>
      );
    case 'radio':
      return (
        <div
          className={`${shell} flex items-center justify-center cursor-pointer`}
          style={style}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        >
          <input
            type="radio"
            name={`pdf-radio-${field.name}`}
            className="accent-accent"
            style={{ width: tickSize, height: tickSize }}
            checked={value === field.option}
            disabled={field.readOnly}
            onChange={() => field.option && onChange(field.name, field.option)}
          />
        </div>
      );
    case 'dropdown':
      return (
        <select
          className={`${shell} w-full h-full bg-transparent px-0.5 outline-none text-black cursor-text`}
          style={{ ...style, fontSize }}
          value={(typeof value === 'string' ? value : '') ?? ''}
          disabled={field.readOnly}
          onChange={(e) => onChange(field.name, e.target.value)}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        >
          <option value="" />
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'list': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <select
          multiple
          className={`${shell} w-full h-full bg-transparent px-0.5 outline-none text-black cursor-text`}
          style={{ ...style, fontSize }}
          value={selected}
          disabled={field.readOnly}
          onChange={(e) => onChange(field.name, Array.from(e.target.selectedOptions, (o) => o.value))}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        >
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'signature':
    default:
      return (
        <div
          className={`${shell} flex items-center justify-center`}
          style={style}
          title="Campo de assinatura — preenchimento não suportado"
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onContextMenu={stop}
        >
          <span className="text-ink-3 select-none" style={{ fontSize: Math.max(9, Math.round(10 * scale)) }}>
            Assinatura
          </span>
        </div>
      );
  }
}
