// Single-document export from the Explorer context menu. Notes become Markdown,
// PDFs are copied as the original file, and other structured documents
// (tables, sheets, timelines, maps, whiteboards) are written as pretty JSON.
import { app, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as db from './db';
import { pdfFilePath } from './pdf';
import { blocksToMarkdown } from '../shared/blockContent';
import type { DocNode, RealmTransferResult } from '../shared/types';

function safeFileName(name: string): string {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  return clean || 'documento';
}

interface ExportPayload {
  data: Buffer | string;
  ext: string;
  filterName: string;
}

function buildPayload(doc: DocNode): ExportPayload | { error: string } {
  switch (doc.type) {
    case 'core/pdf': {
      const file = pdfFilePath(doc.id);
      if (!fs.existsSync(file)) return { error: 'Arquivo PDF não encontrado no armazenamento do app.' };
      return { data: fs.readFileSync(file), ext: 'pdf', filterName: 'PDF' };
    }
    case 'core/note': {
      const markdown = blocksToMarkdown(doc.content);
      return { data: `# ${doc.title}\n\n${markdown}\n`, ext: 'md', filterName: 'Markdown' };
    }
    default: {
      let pretty = doc.content ?? '';
      try {
        pretty = JSON.stringify(JSON.parse(doc.content ?? 'null'), null, 2);
      } catch {
        /* malformed content: export as stored */
      }
      return { data: pretty, ext: 'json', filterName: 'JSON' };
    }
  }
}

export async function exportDocument(docId: string): Promise<RealmTransferResult> {
  const doc = db.getDoc(docId);
  if (!doc) return { ok: false, error: 'Documento não encontrado.' };
  if (doc.type === 'core/folder') return { ok: false, error: 'Pastas não podem ser exportadas.' };

  const payload = buildPayload(doc);
  if ('error' in payload) return { ok: false, error: payload.error };

  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: 'Janela principal não disponível.' };

  let defaultDir = '';
  try {
    defaultDir = app.getPath('desktop');
  } catch {
    /* fall back to the OS default */
  }
  const picked = await dialog.showSaveDialog(win, {
    title: 'Exportar documento',
    defaultPath: path.join(defaultDir, `${safeFileName(doc.title)}.${payload.ext}`),
    filters: [{ name: payload.filterName, extensions: [payload.ext] }],
  });
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };

  try {
    await fs.promises.writeFile(picked.filePath, payload.data);
  } catch {
    return { ok: false, error: 'Não foi possível gravar o arquivo.' };
  }
  return { ok: true, filePath: picked.filePath };
}
