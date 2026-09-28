// Data model for `core/pdf` document content JSON.
// Heavy content (note bodies) lives in real child `core/note` documents;
// this JSON keeps only lightweight spatial/visual state.

export type PdfPinTag =
  | 'monster'
  | 'npc'
  | 'trap'
  | 'treasure'
  | 'clue'
  | 'room'
  | 'table'
  | null;

export interface PdfPinField {
  id: string;
  key: string;
  value: string;
  multiline?: boolean;
  /** promoted fields show in the card's summary banner */
  promoted?: boolean;
}

export interface PdfPin {
  id: string;
  /** linked real note document (child of the PDF in the tree) */
  noteId: string;
  page: number;
  /** fractional coordinates 0..1 within the page */
  x: number;
  y: number;
  tag: PdfPinTag;
  color: string;
  icon: string;
  showLabel?: boolean;
  /** how the annotation shows on the page: hover tooltip (default) or an
   *  always-visible embedded card */
  display?: 'tooltip' | 'embed';
  fields: PdfPinField[];
  /** for link tokens: pin id this token jumps to */
  linkTargetPinId?: string;
  /** link token face text (1-3 chars) */
  tokenFace?: string;
  createdAt: number;
}

export interface PdfHighlight {
  id: string;
  page: number;
  /** per-line rects, fractional within the page */
  rects: { x: number; y: number; w: number; h: number }[];
  color: string;
  text: string;
  /** set when the highlight was converted into a note */
  noteId?: string;
  /** attached audio clip (diegesis-audio:// URL) */
  audioUrl?: string;
  audioName?: string;
  audioLoop?: boolean;
  /** 'music' joins crossfades; 'sfx' plays on top (default 'music') */
  audioKind?: 'music' | 'sfx';
  createdAt: number;
}

export interface PdfBookmark {
  id: string;
  page: number;
  label: string;
  color: string;
  favorite?: boolean;
  createdAt: number;
}

export interface FlyleafRef {
  /** the real child note holding title + body */
  noteId: string;
  pageAnchor?: number;
  tags: string[];
  pinned?: boolean;
}

export interface FolderStyle {
  color?: string;
  icon?: string;
  collapsed?: boolean;
}

export type PdfPageFilter = 'normal' | 'invert' | 'sepia';
export type PdfLayout = 'single' | 'spread';

export interface NavHistoryEntry {
  page: number;
  /** fractional offset of the page top within the scroll container */
  scrollRatio: number;
  zoom: number;
  label?: string;
}

export interface PdfDocContent {
  file: { name: string; size: number; numPages: number; coverThumb?: string };
  view: {
    zoom: number;
    layout: PdfLayout;
    separateCover: boolean;
    filter: PdfPageFilter;
    /** page number (1-based) -> rotation in degrees (0/90/180/270) */
    rotations: Record<number, number>;
    historySpine: boolean;
    inspectorWidth: number;
    /** persisted flexlayout JSON for the in-PDF window manager (panels/tabs) */
    panelLayout?: unknown;
  };
  lastPage: number;
  navHistory: NavHistoryEntry[];
  pins: PdfPin[];
  highlights: PdfHighlight[];
  /** highlight color -> user label ("Tesouro", "Perigo"…) */
  hlLabels: Record<string, string>;
  bookmarks: PdfBookmark[];
  flyleaf: FlyleafRef[];
  /** folder docId -> appearance overrides */
  folderStyle: Record<string, FolderStyle>;
  onboardingSeen?: boolean;
}

export const PIN_TAG_COLORS: Record<NonNullable<PdfPinTag>, string> = {
  monster: '#d96a5f',
  npc: '#a98bd0',
  trap: '#ffa8c5',
  treasure: '#e8b64a',
  clue: '#4bb3b3',
  room: '#74c0fc',
  table: '#c9a86a',
};

export const PIN_TAG_LABELS: Record<NonNullable<PdfPinTag>, string> = {
  monster: 'Monstro',
  npc: 'NPC',
  trap: 'Armadilha',
  treasure: 'Tesouro',
  clue: 'Pista',
  room: 'Sala',
  table: 'Tabela',
};

export const UNTAGGED_PIN_COLOR = '#8a94a6';
export const BOOKMARK_PIN_COLOR = '#5aa878';

/** Fixed highlight palette; the last one is the opaque "redaction" ink. */
export const HIGHLIGHT_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#ffa8c5', '#99f6e4', '#050505'];
export const REDACTION_COLOR = '#050505';

export const FOLDER_COLORS = ['#8a94a6', '#5b93c9', '#5aa878', '#e8b64a', '#d96a5f', '#a98bd0', '#4bb3b3', '#d98a4a'];

export function defaultPdfContent(): PdfDocContent {
  return {
    file: { name: '', size: 0, numPages: 0 },
    view: {
      zoom: 1,
      layout: 'single',
      separateCover: false,
      filter: 'normal',
      rotations: {},
      historySpine: true,
      inspectorWidth: 400,
    },
    lastPage: 1,
    navHistory: [],
    pins: [],
    highlights: [],
    hlLabels: {},
    bookmarks: [],
    flyleaf: [],
    folderStyle: {},
  };
}

export function parsePdfContent(content: string | null): PdfDocContent {
  const base = defaultPdfContent();
  if (!content) return base;
  try {
    const parsed = JSON.parse(content);
    return {
      ...base,
      ...parsed,
      file: { ...base.file, ...parsed.file },
      view: { ...base.view, ...parsed.view },
      pins: Array.isArray(parsed.pins) ? parsed.pins : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      flyleaf: Array.isArray(parsed.flyleaf) ? parsed.flyleaf : [],
      navHistory: Array.isArray(parsed.navHistory) ? parsed.navHistory : [],
      hlLabels: parsed.hlLabels ?? {},
      folderStyle: parsed.folderStyle ?? {},
    };
  } catch {
    return base;
  }
}

export const pinId = () => Math.random().toString(36).slice(2, 10);
