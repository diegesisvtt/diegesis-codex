// AcroForm (editable PDF) support: enumerate fillable fields via pdf-lib and
// apply user-entered values back into the PDF on save. pdf.js is used only for
// its authoritative viewport transform (rotation + crop box + y-flip).
import {
  PDFDocument,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  PDFWidgetAnnotation,
} from 'pdf-lib';
import type { PdfFormValue } from './model';
import { loadPdf } from './pdfjs';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature';

export interface FormFieldDef {
  /** fully-qualified AcroForm field name */
  name: string;
  type: FormFieldType;
  /** 1-based page number */
  page: number;
  /** fractional rect within the page (0..1) */
  x: number;
  y: number;
  w: number;
  h: number;
  multiline?: boolean;
  maxLen?: number;
  readOnly?: boolean;
  /** available options for radio/dropdown/list */
  options?: string[];
  /** radio only: the option this particular widget represents */
  option?: string;
  /** value already present in the PDF (used to seed the overlay on first load) */
  defaultValue?: PdfFormValue;
}

// Field definitions are immutable for the life of a document (they only change
// when the underlying file is rewritten). Cache per docId like the pdf.js doc.
const fieldCache = new Map<string, Promise<FormFieldDef[]>>();

export function loadFormFields(docId: string): Promise<FormFieldDef[]> {
  let p = fieldCache.get(docId);
  if (!p) {
    p = enumerateFields(docId);
    fieldCache.set(docId, p);
    p.catch(() => fieldCache.delete(docId));
  }
  return p;
}

/** Drops cached field definitions (e.g. after an in-place save rewrites the file). */
export function invalidateFormFields(docId: string): void {
  fieldCache.delete(docId);
}

const refKey = (ref: { toString(): string }): string => ref.toString();

async function enumerateFields(docId: string): Promise<FormFieldDef[]> {
  const bytes = await window.diegesis.pdf.readBytes(docId);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  if (fields.length === 0) return [];

  const pages = pdfDoc.getPages();
  const pageIndexByRef = new Map<string, number>();
  pages.forEach((p, i) => pageIndexByRef.set(refKey(p.ref), i));

  // Pre-fetch pdf.js viewports so we can convert each widget rect to fractional
  // coords (handles page rotation, crop-box offset and the y-axis flip).
  const pdf = await loadPdf(docId);
  const viewports: { width: number; height: number; convertToViewportRectangle(rect: number[]): number[] }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = await pdf.getPage(i + 1);
    viewports.push(page.getViewport({ scale: 1 }));
  }

  const place = (widget: PDFWidgetAnnotation): {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null => {
    // Resolve the widget's page like pdf-lib itself does (PDFForm.findWidgetPage):
    // prefer /P, else locate the widget ref in the pages' /Annots arrays.
    let pageIndex: number | undefined;
    const pRef = widget.P();
    if (pRef) pageIndex = pageIndexByRef.get(refKey(pRef));
    if (pageIndex === undefined) {
      const wRef = pdfDoc.context.getObjectRef(widget.dict);
      if (wRef) {
        const page = pdfDoc.findPageForAnnotationRef(wRef);
        if (page) pageIndex = pageIndexByRef.get(refKey(page.ref));
      }
    }
    if (pageIndex === undefined) return null;
    const vp = viewports[pageIndex];
    if (!vp) return null;
    const r = widget.getRectangle();
    if (!r || !r.width || !r.height) return null;
    const [x1, y1, x2, y2] = vp.convertToViewportRectangle([r.x, r.y, r.x + r.width, r.y + r.height]);
    return {
      page: pageIndex + 1,
      x: Math.min(x1, x2) / vp.width,
      y: Math.min(y1, y2) / vp.height,
      w: Math.abs(x2 - x1) / vp.width,
      h: Math.abs(y2 - y1) / vp.height,
    };
  };

  const out: FormFieldDef[] = [];
  for (const field of fields) {
    const name = field.getName();
    const readOnly = field.isReadOnly();

    if (field instanceof PDFTextField) {
      const multiline = field.isMultiline();
      const maxLen = field.getMaxLength();
      let text: string | undefined;
      try {
        text = field.getText();
      } catch {
        /* rich-text/XFA field — no readable default */
      }
      for (const w of field.acroField.getWidgets()) {
        const p = place(w);
        if (!p) continue;
        out.push({ name, type: 'text', ...p, multiline, maxLen, readOnly, defaultValue: text ?? '' });
      }
    } else if (field instanceof PDFCheckBox) {
      let checked = false;
      try {
        checked = field.isChecked();
      } catch {
        /* no default */
      }
      for (const w of field.acroField.getWidgets()) {
        const p = place(w);
        if (!p) continue;
        out.push({ name, type: 'checkbox', ...p, readOnly, defaultValue: checked });
      }
    } else if (field instanceof PDFRadioGroup) {
      const options = field.getOptions();
      let selected: string | undefined;
      try {
        selected = field.getSelected();
      } catch {
        /* no default */
      }
      const widgets = field.acroField.getWidgets();
      widgets.forEach((w, idx) => {
        const p = place(w);
        if (!p) return;
        // options and widgets are positional: widget idx maps to options[idx]
        // (getOnValue() would give the appearance state name, not the export value).
        const option = options[idx];
        out.push({ name, type: 'radio', ...p, readOnly, options, option, defaultValue: selected });
      });
    } else if (field instanceof PDFDropdown) {
      const options = field.getOptions();
      const multi = field.isMultiselect();
      let sel: string[] = [];
      try {
        sel = field.getSelected();
      } catch {
        /* no default */
      }
      for (const w of field.acroField.getWidgets()) {
        const p = place(w);
        if (!p) continue;
        out.push({ name, type: 'dropdown', ...p, readOnly, options, defaultValue: multi ? sel : sel[0] ?? '' });
      }
    } else if (field instanceof PDFOptionList) {
      const options = field.getOptions();
      let sel: string[] = [];
      try {
        sel = field.getSelected();
      } catch {
        /* no default */
      }
      for (const w of field.acroField.getWidgets()) {
        const p = place(w);
        if (!p) continue;
        out.push({ name, type: 'list', ...p, readOnly, options, defaultValue: sel });
      }
    } else if (field instanceof PDFSignature) {
      for (const w of field.acroField.getWidgets()) {
        const p = place(w);
        if (!p) continue;
        out.push({ name, type: 'signature', ...p, readOnly: true });
      }
    }
  }
  return out;
}

/** Applies user-entered values to the PDF and returns the serialized bytes. */
export async function fillPdf(bytes: Uint8Array, values: Record<string, PdfFormValue>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = pdfDoc.getForm();

  for (const [name, value] of Object.entries(values)) {
    let field: ReturnType<typeof form.getFieldMaybe>;
    try {
      field = form.getFieldMaybe(name);
    } catch {
      continue;
    }
    if (!field) continue;

    if (field instanceof PDFTextField) {
      field.setText(typeof value === 'string' ? value : '');
    } else if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string' && value) field.select(value);
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const opts = Array.isArray(value) ? value : value === '' || value === false ? [] : [value as string];
      field.select(opts);
    }
  }

  form.updateFieldAppearances();
  return pdfDoc.save();
}
