// Import/export de modelos (.diegesis-template.json) e fichas
// (.diegesis-sheet.json) via arquivos locais (Blob download + FileReader).

import { parseSheet, serializeSheet, type SheetDocumentWithLayout } from '@shared/sheet';
import { newTemplateId, parseSheetTemplate, type SheetTemplate } from '@shared/sheetLayout';

export const TEMPLATE_EXT = '.diegesis-template.json';
export const SHEET_EXT = '.diegesis-sheet.json';

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'arquivo'
  );
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(f);
    };
    input.click();
  });
}

export function exportTemplate(template: SheetTemplate) {
  download(`${slug(template.name)}${TEMPLATE_EXT}`, JSON.stringify({ kind: 'diegesis-template', version: 1, template }, null, 2));
}

/** retorna o modelo importado (id novo, nunca colide com o reino atual) */
export async function importTemplateFile(): Promise<SheetTemplate | null> {
  const text = await pickFile(TEMPLATE_EXT);
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    const t = parseSheetTemplate(raw.template ?? raw);
    if (!t) return null;
    return { ...t, id: newTemplateId(), builtin: false };
  } catch {
    return null;
  }
}

export function exportSheet(title: string, content: string) {
  download(`${slug(title || 'ficha')}${SHEET_EXT}`, JSON.stringify({ kind: 'diegesis-sheet', version: 1, content }, null, 2));
}

/** retorna ficha importada normalizada (valida via parseSheet, re-serializa) */
export async function importSheetFile(): Promise<{ title: string; content: string } | null> {
  const text = await pickFile(SHEET_EXT);
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    const content = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw);
    const doc = parseSheet(content) as SheetDocumentWithLayout;
    const title = String(doc.identity.nome ?? 'Ficha importada');
    return { title, content: serializeSheet(doc) };
  } catch {
    return null;
  }
}
