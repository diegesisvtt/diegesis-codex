import type { DocNode } from '@shared/types';
import type { BookmarkTreeNode } from './pdfTree';

export interface TreeData {
  id: string;
  name: string;
  docType: DocNode['type'];
  /** present only on virtual bookmark nodes (not real documents) */
  bookmark?: BookmarkTreeNode;
  children?: TreeData[];
}

/**
 * Converts the flat DocNode list into the nested structure react-arborist
 * expects. PDF bookmarks are appended as virtual children of their PDF node.
 */
export function buildTree(docs: DocNode[], pdfBookmarks?: Map<string, BookmarkTreeNode[]>): TreeData[] {
  const byId = new Map<string, TreeData>();
  const roots: TreeData[] = [];

  for (const d of docs) {
    byId.set(d.id, {
      id: d.id,
      name: d.title || 'Sem título',
      docType: d.type,
      // Inicializa filhos AQUI (1ª passada): um filho pode aparecer antes da
      // pasta na ordenação por position; resetar na 2ª passada apagaria filhos.
      // PDFs aceitam filhos: cada pin/anotação é uma nota filha do PDF.
      ...(d.type === 'core/folder' || d.type === 'core/pdf' ? { children: [] as TreeData[] } : {}),
    });
  }
  for (const d of docs) {
    const node = byId.get(d.id)!;
    if (d.parentId && byId.has(d.parentId)) {
      const parent = byId.get(d.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // virtual bookmark children, sorted to sit after real notes (page order)
  if (pdfBookmarks) {
    for (const [pdfId, bookmarks] of pdfBookmarks) {
      const parent = byId.get(pdfId);
      if (!parent) continue;
      parent.children = parent.children ?? [];
      for (const bm of bookmarks) {
        parent.children.push({
          id: bm.id,
          name: bm.label || `Página ${bm.page}`,
          docType: 'core/pdf',
          bookmark: bm,
        });
      }
    }
  }

  const pos = new Map(docs.map((d) => [d.id, d.position]));
  const sortRec = (nodes: TreeData[]) => {
    nodes.sort((a, b) => {
      // bookmarks sort by page, after real children
      if (a.bookmark && b.bookmark) return (a.bookmark.favorite === b.bookmark.favorite ? a.bookmark.page - b.bookmark.page : a.bookmark.favorite ? -1 : 1);
      if (a.bookmark) return 1;
      if (b.bookmark) return -1;
      return (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0);
    });
    nodes.forEach((n) => n.children && sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}
