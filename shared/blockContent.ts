// BlockNote JSON helpers shared by renderer (editors) and main process (AI tools, FTS).
// Pure TypeScript — no @blocknote imports so the Electron bundle stays clean.

export interface BNStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

export interface BNText {
  type: 'text';
  text: string;
  styles: BNStyles;
}

export interface BNLink {
  type: 'link';
  href: string;
  content: BNText[];
}

/** Wiki-style reference to another note (core/note). `label` overrides the
 *  visible text; empty means "use the target's title". */
export interface BNNoteRef {
  type: 'noteRef';
  props: { docId: string; label: string };
}

export type BNInline = BNText | BNLink | BNNoteRef;

/** Resolves a note-reference target to its title (used by FTS/export/player,
 *  where the document list isn't directly available to the pure helpers). */
export type NoteTitleResolver = (docId: string) => string | undefined;

export interface BNBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: BNInline[] | string;
  children?: BNBlock[];
}

/** Serialized empty note in BlockNote format. */
export function emptyNoteContent(): string {
  return JSON.stringify([{ type: 'paragraph' }]);
}

/** Legacy tiptap docs are objects with { type: 'doc' }; BlockNote docs are arrays. */
export function isTiptapDoc(parsed: unknown): boolean {
  return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as { type?: string }).type === 'doc';
}

/** Parses stored note content into BlockNote blocks, converting legacy tiptap JSON. */
export function parseNoteContent(raw: string | null | undefined): BNBlock[] {
  if (!raw) return [{ type: 'paragraph' }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as BNBlock[];
    if (isTiptapDoc(parsed)) return tiptapToBlocks(parsed);
  } catch {
    /* malformed — fall through */
  }
  return [{ type: 'paragraph' }];
}

// ---------- tiptap JSON → BlockNote ----------

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  text?: string;
  content?: TiptapNode[];
}

function tiptapInline(nodes: TiptapNode[] | undefined): BNInline[] {
  const out: BNInline[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      const link = (n.marks ?? []).find((m) => m.type === 'link');
      const styles: BNStyles = {};
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') styles.bold = true;
        else if (m.type === 'italic') styles.italic = true;
        else if (m.type === 'underline') styles.underline = true;
        else if (m.type === 'strike') styles.strike = true;
        else if (m.type === 'code') styles.code = true;
      }
      const text: BNText = { type: 'text', text: n.text ?? '', styles };
      const href = link?.attrs?.href;
      if (typeof href === 'string' && href) out.push({ type: 'link', href, content: [text] });
      else out.push(text);
    } else if (n.type === 'hardBreak') {
      out.push({ type: 'text', text: '\n', styles: {} });
    }
  }
  return out;
}

function listItemToBlock(item: TiptapNode, type: string): BNBlock {
  // listItem/taskItem content: [paragraph, ...nestedLists]
  const [first, ...rest] = item.content ?? [];
  const block: BNBlock = {
    type,
    content: first ? tiptapInline(first.content) : [],
    children: rest.flatMap(tiptapNodeToBlocks),
  };
  if (type === 'checkListItem') block.props = { checked: !!item.attrs?.checked };
  return block;
}

function tiptapNodeToBlocks(node: TiptapNode): BNBlock[] {
  switch (node.type) {
    case 'paragraph':
      return [{ type: 'paragraph', content: tiptapInline(node.content) }];
    case 'heading': {
      const raw = Number(node.attrs?.level ?? 1);
      const level = Math.min(Math.max(raw, 1), 3);
      return [{ type: 'heading', props: { level }, content: tiptapInline(node.content) }];
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const itemType =
        node.type === 'bulletList' ? 'bulletListItem' : node.type === 'orderedList' ? 'numberedListItem' : 'checkListItem';
      return (node.content ?? []).map((item) => listItemToBlock(item, itemType));
    }
    case 'blockquote': {
      const [first, ...rest] = node.content ?? [];
      return [
        {
          type: 'quote',
          content: first ? tiptapInline(first.content) : [],
          children: rest.flatMap(tiptapNodeToBlocks),
        },
      ];
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('');
      return [{ type: 'codeBlock', content: text }];
    }
    case 'image': {
      const src = node.attrs?.src;
      return [{ type: 'image', props: { url: typeof src === 'string' ? src : '' } }];
    }
    case 'horizontalRule':
      return [{ type: 'divider' }];
    default:
      return [];
  }
}

export function tiptapToBlocks(doc: TiptapNode): BNBlock[] {
  const blocks = (doc.content ?? []).flatMap(tiptapNodeToBlocks);
  return blocks.length ? blocks : [{ type: 'paragraph' }];
}

// ---------- markdown → BlockNote (used by AI tools in the main process) ----------

function mdInline(text: string): BNInline[] | undefined {
  return text ? [{ type: 'text', text, styles: {} }] : undefined;
}

/** Converts simple markdown (headings, lists, quotes, dividers, paragraphs) to BlockNote JSON. */
export function markdownToBlocks(md: string): string {
  const blocks: BNBlock[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^[-*]\s+/.exec(line);
    const ordered = /^\d+[.)]\s+/.exec(line);
    if (bullet) {
      blocks.push({ type: 'bulletListItem', content: mdInline(line.replace(/^[-*]\s+/, '')) });
      continue;
    }
    if (ordered) {
      blocks.push({ type: 'numberedListItem', content: mdInline(line.replace(/^\d+[.)]\s+/, '')) });
      continue;
    }
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) blocks.push({ type: 'heading', props: { level: h[1].length }, content: mdInline(h[2]) });
    else if (line.startsWith('> ')) blocks.push({ type: 'quote', content: mdInline(line.slice(2)) });
    else if (line === '---') blocks.push({ type: 'divider' });
    else blocks.push({ type: 'paragraph', content: mdInline(line) });
  }
  if (blocks.length === 0) blocks.push({ type: 'paragraph' });
  return JSON.stringify(blocks);
}

// ---------- plain text extraction (FTS / RAG) ----------

function inlineToText(content: BNInline[] | string | undefined, resolveTitle?: NoteTitleResolver): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'link') return c.content.map((t) => t.text).join('');
      return c.props.label || resolveTitle?.(c.props.docId) || '';
    })
    .join('');
}

// ---------- BlockNote → Markdown (single-document export) ----------

function applyInlineStyles(text: string, styles: BNStyles): string {
  if (!text) return text;
  let out = text;
  if (styles.code) out = '`' + out + '`';
  if (styles.bold) out = '**' + out + '**';
  if (styles.italic) out = '*' + out + '*';
  if (styles.strike) out = '~~' + out + '~~';
  return out;
}

function inlineToMarkdown(content: BNInline[] | string | undefined, resolveTitle?: NoteTitleResolver): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((c) => {
      if (c.type === 'link') {
        return `[${c.content.map((t) => applyInlineStyles(t.text, t.styles)).join('')}](${c.href})`;
      }
      if (c.type === 'noteRef') {
        const text = c.props.label || resolveTitle?.(c.props.docId) || 'referência';
        return `[${text}](diegesis://note/${c.props.docId})`;
      }
      return applyInlineStyles(c.text, c.styles);
    })
    .join('');
}

const NESTED_LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);

function blockToMarkdown(block: BNBlock, indent: number, resolveTitle?: NoteTitleResolver): string {
  const pad = '  '.repeat(indent);
  const text = inlineToMarkdown(block.content, resolveTitle);
  const lines: string[] = [];
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Math.max(Number(block.props?.level ?? 1), 1), 6);
      lines.push(`${'#'.repeat(level)} ${text}`.trimEnd());
      break;
    }
    case 'bulletListItem':
      lines.push(`${pad}- ${text}`.trimEnd());
      break;
    case 'numberedListItem':
      lines.push(`${pad}1. ${text}`.trimEnd());
      break;
    case 'checkListItem':
      lines.push(`${pad}- [${block.props?.checked ? 'x' : ' '}] ${text}`.trimEnd());
      break;
    case 'quote':
      lines.push(`${pad}> ${text}`.trimEnd());
      break;
    case 'codeBlock': {
      const code = typeof block.content === 'string' ? block.content : inlineToMarkdown(block.content, resolveTitle);
      const lang = typeof block.props?.language === 'string' ? block.props.language : '';
      lines.push(`${pad}\`\`\`${lang}`, code, `${pad}\`\`\``);
      break;
    }
    case 'divider':
      lines.push(`${pad}---`);
      break;
    case 'image': {
      const url = typeof block.props?.url === 'string' ? block.props.url : '';
      const caption = typeof block.props?.caption === 'string' ? block.props.caption : '';
      if (url) lines.push(`${pad}![${caption}](${url})`);
      break;
    }
    case 'callout': {
      const title = typeof block.props?.title === 'string' ? block.props.title : '';
      const variant = typeof block.props?.variant === 'string' ? block.props.variant : '';
      lines.push(`${pad}> ${title ? `**${title}**` : `_${variant}_`}`);
      if (text) lines.push(`${pad}> ${text}`);
      break;
    }
    default:
      if (text) lines.push(`${pad}${text}`);
      break;
  }
  const childIndent = NESTED_LIST_TYPES.has(block.type) ? indent + 1 : indent;
  for (const child of block.children ?? []) {
    const childMd = blockToMarkdown(child, childIndent, resolveTitle);
    if (childMd) lines.push(childMd);
  }
  return lines.filter((l) => l.trim() !== '').join('\n');
}

/** Converts note content (BlockNote or legacy tiptap JSON) to Markdown. */
export function blocksToMarkdown(raw: string | null | undefined, resolveTitle?: NoteTitleResolver): string {
  return parseNoteContent(raw)
    .map((b) => blockToMarkdown(b, 0, resolveTitle))
    .filter(Boolean)
    .join('\n\n');
}

/** Extracts plain text from note content (BlockNote or legacy tiptap JSON). */
export function blocksToPlainText(raw: string | null | undefined, resolveTitle?: NoteTitleResolver): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const parts: string[] = [];
    if (Array.isArray(parsed)) {
      const walkBlocks = (blocks: BNBlock[]): void => {
        for (const b of blocks) {
          const text = inlineToText(b.content, resolveTitle);
          if (text) parts.push(text);
          if (b.children?.length) walkBlocks(b.children);
        }
      };
      walkBlocks(parsed);
    } else {
      // legacy tiptap / whiteboard shapes
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;
        if (typeof n.text === 'string') parts.push(n.text);
        if (Array.isArray(n.content)) n.content.forEach(walk);
        if (Array.isArray(n.children)) n.children.forEach(walk);
        if (Array.isArray(n.nodes)) {
          for (const s of n.nodes) {
            const name = (s as { data?: { name?: unknown } })?.data?.name;
            if (name) parts.push(String(name));
          }
        }
      };
      walk(parsed);
    }
    return parts.join(' ');
  } catch {
    return '';
  }
}
