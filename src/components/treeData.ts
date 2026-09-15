import type { DocNode } from '@shared/types';

export interface TreeData {
  id: string;
  name: string;
  docType: DocNode['type'];
  children?: TreeData[];
}

/** Converts the flat DocNode list into the nested structure react-arborist expects. */
export function buildTree(docs: DocNode[]): TreeData[] {
  const byId = new Map<string, TreeData>();
  const roots: TreeData[] = [];

  for (const d of docs) {
    byId.set(d.id, { id: d.id, name: d.title || 'Sem título', docType: d.type });
  }
  for (const d of docs) {
    const node = byId.get(d.id)!;
    if (d.type === 'core/folder') node.children = [];
    if (d.parentId && byId.has(d.parentId)) {
      const parent = byId.get(d.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const pos = new Map(docs.map((d) => [d.id, d.position]));
  const sortRec = (nodes: TreeData[]) => {
    nodes.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
    nodes.forEach((n) => n.children && sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}
