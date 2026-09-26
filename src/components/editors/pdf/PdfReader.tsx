import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ListTree,
  Search,
  BookOpen,
  FileText,
  Contrast,
  Maximize,
  Minimize,
  RotateCw,
  Check,
  Bookmark,
} from 'lucide-react';
import { Layout, Model, Actions, DockLocation, type TabNode, type IJsonModel, type IJsonTabNode } from 'flexlayout-react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../../state/store';
import { parsePdfContent, type PdfDocContent, type PdfLayout, type PdfPageFilter, type PdfPinTag } from './model';
import { loadPdf, extractPagesText, renderCoverThumb, type PDFDocumentProxy } from './pdfjs';
import { createPdfSearcher, type PdfSearcher } from './search';
import { PageView } from './PageView';
import { OutlinePanel } from './OutlinePanel';
import { SearchPanel } from './SearchPanel';
import { LinkLayer } from './LinkLayer';
import { HistorySpine } from './HistorySpine';
import { PinLayer, monsterNumbers } from './PinLayer';
import { PdfContextMenu, type ContextMenuState } from './ContextMenu';
import { HighlightLayer, HighlightPopover, selectionToRects, type HighlightPopoverState } from './HighlightLayer';
import { PinPanel } from './PinPanels';
import { HighlightPanel } from './HighlightPanel';
import { ensurePageThumb } from './Scry';
import { usePdfAnnotations } from './useAnnotations';
import { parseStatblock } from './rpg';
import { OnboardingModal } from './OnboardingModal';

const ZOOM_STEPS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function snapZoom(z: number): number {
  let best = ZOOM_STEPS[0];
  for (const step of ZOOM_STEPS) if (Math.abs(step - z) < Math.abs(best - z)) best = step;
  return best;
}

const FILTER_ORDER: PdfPageFilter[] = ['normal', 'invert', 'sepia'];
const FILTER_LABELS: Record<PdfPageFilter, string> = {
  normal: 'Normal',
  invert: 'Invertido (escuro)',
  sepia: 'Sépia (quente)',
};

// StrictMode double-invokes effects in dev; first-import processing (text
// extraction over hundreds of pages) must not run twice for the same doc.
const processingDocs = new Set<string>();

// ---------------------------------------------------------------------------
// In-PDF window management: a flexlayout model scoped to this document.
// Pages live in a fixed central tab (no tab strip — the PDF IS the content);
// outline/search open as left tabs and every annotation/highlight opens in the
// right border, whose tabs stack vertically on the edge (VS Code-style).
// ---------------------------------------------------------------------------

const PAGES_TABSET_ID = 'pdf-pages-tabset';
const PAGES_TAB_ID = 'pdf-pages';
const OUTLINE_TAB_ID = 'pdf-outline';
const SEARCH_TAB_ID = 'pdf-search';
// flexlayout assigns border ids automatically as `border_<location>`
const PANEL_BORDER_ID = 'border_right';

type PanelKind = 'pin' | 'highlight';
const panelTabId = (kind: PanelKind, refId: string) => `pdf-panel-${kind}-${refId}`;

function defaultPdfLayout(): IJsonModel {
  return {
    global: {
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      splitterSize: 4,
      tabEnableFloat: false,
      borderEnableAutoHide: true,
    },
    borders: [
      { type: 'border', location: 'right', size: 380, children: [] },
    ],
    layout: {
      type: 'row',
      children: [
        {
          type: 'tabset',
          id: PAGES_TABSET_ID,
          enableDeleteWhenEmpty: false,
          // the pages tab is the document itself — no tab strip over it
          enableTabStrip: false,
          children: [
            { type: 'tab', id: PAGES_TAB_ID, name: 'Páginas', component: 'pages', enableClose: false, enableDrag: false },
          ],
        },
      ],
    },
  };
}

/** Drops panel tabs whose pin/highlight no longer exists; guarantees the pages tab and the right border. */
function sanitizePdfLayout(saved: unknown, content: PdfDocContent): IJsonModel {
  try {
    const clone = JSON.parse(JSON.stringify(saved));
    const alive = (t: any): boolean => {
      if (t?.type !== 'tab' || t.component !== 'panel') return true;
      const cfg = t.config;
      return cfg?.kind === 'pin'
        ? content.pins.some((p) => p.id === cfg.refId)
        : content.highlights.some((h) => h.id === cfg.refId);
    };
    const prune = (nodes: any[]): any[] =>
      nodes.filter(alive).map((n) => (n.children ? { ...n, children: prune(n.children) } : n));
    clone.layout.children = prune(clone.layout.children ?? []);
    clone.borders = (clone.borders ?? []).map((b: any) => ({ ...b, children: prune(b.children ?? []) }));
    if (!JSON.stringify(clone.layout).includes(PAGES_TAB_ID)) return defaultPdfLayout();
    // the pages tab never shows a tab strip, even in layouts saved before this
    const hidePagesStrip = (nodes: any[]): void => {
      for (const n of nodes) {
        if (n?.type === 'tabset' && (n.id === PAGES_TABSET_ID || (n.children ?? []).some((t: any) => t.id === PAGES_TAB_ID))) {
          n.enableTabStrip = false;
        }
        if (n?.children) hidePagesStrip(n.children);
      }
    };
    hidePagesStrip(clone.layout.children);
    if (!clone.borders.some((b: any) => b.location === 'right')) {
      clone.borders.push({ type: 'border', location: 'right', size: 380, children: [] });
    }
    clone.global = {
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      splitterSize: 4,
      tabEnableFloat: false,
      borderEnableAutoHide: true,
      ...(clone.global ?? {}),
    };
    return clone;
  } catch {
    return defaultPdfLayout();
  }
}

function forEachTab(model: Model, fn: (tab: TabNode) => void): void {
  model.visitNodes((node) => {
    if (node.getType() === 'tab') fn(node as TabNode);
  });
}

export function PdfReader({ doc }: { doc: DocNode }) {
  const { updateDocument, subscribeExternalDocChange, docs, pdfFocus, clearPdfFocus } = useStore();

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Content is mirrored in a ref so mutations always read the latest version.
  // (the ref is written by commit() and by the external-change subscription)
  const [content, setContent] = useState<PdfDocContent>(() => parsePdfContent(doc.content));
  const contentRef = useRef(content);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [pageInput, setPageInput] = useState('');
  const [basePageWidth, setBasePageWidth] = useState(612); // letter width until measured
  const restoreGuardUntil = useRef(0);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [headerHover, setHeaderHover] = useState(false);
  const [activePages, setActivePages] = useState<Set<number>>(new Set());
  const [navIdx, setNavIdx] = useState(() => Math.max(0, content.navHistory.length - 1));

  // ---- annotations: flexlayout window manager scoped to this PDF ----
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedPanelTabId, setSelectedPanelTabId] = useState<string | null>(null);
  const [leftTabs, setLeftTabs] = useState({ outline: false, search: false });
  const [placing, setPlacing] = useState<{ tag: PdfPinTag } | null>(null);
  const [linkingPinId, setLinkingPinId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [hlPopover, setHlPopover] = useState<HighlightPopoverState | null>(null);
  const [tokenDragOver, setTokenDragOver] = useState(false);

  const docsRef = useRef(docs);
  docsRef.current = docs;

  const panelTitle = (kind: PanelKind, refId: string): string => {
    if (kind === 'pin') {
      const pin = contentRef.current.pins.find((p) => p.id === refId);
      return docsRef.current.find((d) => d.id === pin?.noteId)?.title || 'Anotação';
    }
    const hl = contentRef.current.highlights.find((h) => h.id === refId);
    return hl ? `${contentRef.current.hlLabels[hl.color] ?? 'Destaque'} p.${hl.page}` : 'Destaque';
  };

  // built once per document; restored (sanitized) from content.view.panelLayout
  const panelModelRef = useRef<Model | null>(null);
  const panelModel = useMemo(() => {
    const saved = contentRef.current.view.panelLayout;
    const m = Model.fromJson(saved ? sanitizePdfLayout(saved, contentRef.current) : defaultPdfLayout());
    panelModelRef.current = m;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  panelModelRef.current = panelModel;

  const openPanel = (kind: PanelKind, refId: string) => {
    const model = panelModelRef.current;
    if (!model) return;
    const tabId = panelTabId(kind, refId);
    if (model.getNodeById(tabId)) {
      model.doAction(Actions.selectTab(tabId));
    } else {
      // stack with existing panels; otherwise open in the right border
      // (vertical tabs on the edge), falling back to a right split
      let target = model.getNodeById(PANEL_BORDER_ID)?.getId() ?? PAGES_TABSET_ID;
      let loc = target === PAGES_TABSET_ID ? DockLocation.RIGHT : DockLocation.CENTER;
      forEachTab(model, (t) => {
        if (t.getComponent() === 'panel' && t.getParent()?.getType() === 'tabset') {
          target = t.getParent()!.getId();
          loc = DockLocation.CENTER;
        }
      });
      model.doAction(
        Actions.addNode(
          {
            type: 'tab',
            id: tabId,
            name: panelTitle(kind, refId),
            component: 'panel',
            config: { kind, refId },
          } as IJsonTabNode,
          target,
          loc,
          -1,
          true
        )
      );
    }
    if (kind === 'pin') setSelectedPinId(refId);
  };

  const closePanel = (kind: PanelKind, refId: string) => {
    const model = panelModelRef.current;
    const tabId = panelTabId(kind, refId);
    if (model?.getNodeById(tabId)) model.doAction(Actions.deleteTab(tabId));
    if (kind === 'pin') setSelectedPinId((sel) => (sel === refId ? null : sel));
  };

  const toggleLeftTab = (which: 'outline' | 'search') => {
    const model = panelModelRef.current;
    if (!model) return;
    const tabId = which === 'outline' ? OUTLINE_TAB_ID : SEARCH_TAB_ID;
    if (model.getNodeById(tabId)) {
      model.doAction(Actions.deleteTab(tabId));
      return;
    }
    // stack with the other left tab when it's open
    const other = model.getNodeById(which === 'outline' ? SEARCH_TAB_ID : OUTLINE_TAB_ID);
    const parent = other?.getParent();
    model.doAction(
      Actions.addNode(
        {
          type: 'tab',
          id: tabId,
          name: which === 'outline' ? 'Sumário' : 'Buscar',
          component: which,
          enableClose: true,
        } as IJsonTabNode,
        parent?.getId() ?? PAGES_TABSET_ID,
        parent ? DockLocation.CENTER : DockLocation.LEFT,
        -1,
        true
      )
    );
  };

  /** mirrors model state into React state (selection ring, toolbar actives) */
  const syncFromModel = (m: Model) => {
    let selPin: string | null = null;
    let selPanelTab: string | null = null;
    let outline = false;
    let search = false;
    m.visitNodes((node) => {
      if (node.getType() === 'tab') {
        if (node.getId() === OUTLINE_TAB_ID) outline = true;
        if (node.getId() === SEARCH_TAB_ID) search = true;
      } else if (node.getType() === 'tabset' || node.getType() === 'border') {
        const sel = (node as any).getSelectedNode?.();
        const cfg = sel?.getConfig?.();
        if (cfg?.kind) {
          selPanelTab = sel.getId();
          if (cfg.kind === 'pin') selPin = cfg.refId;
        }
      }
    });
    setSelectedPinId((cur) => (cur === selPin ? cur : selPin));
    setSelectedPanelTabId((cur) => (cur === selPanelTab ? cur : selPanelTab));
    setLeftTabs((cur) => (cur.outline === outline && cur.search === search ? cur : { outline, search }));
  };

  const numPages = content.file.numPages || pdf?.numPages || 0;
  const [currentPage, setCurrentPage] = useState(content.lastPage || 1);

  const searcher: PdfSearcher | null = useMemo(() => (pdf ? createPdfSearcher(pdf) : null), [pdf]);

  /** Applies a mutation to the content JSON and persists (debounced by the store). */
  const commit = useCallback(
    (mutate: (c: PdfDocContent) => void) => {
      const next: PdfDocContent = JSON.parse(JSON.stringify(contentRef.current));
      mutate(next);
      contentRef.current = next;
      setContent(next);
      updateDocument(doc.id, { content: JSON.stringify(next) });
    },
    [doc.id, updateDocument]
  );

  const annotations = usePdfAnnotations(doc, contentRef, commit);

  // ---- load the PDF (cached per docId; never destroyed on unmount — the
  // pdf.js worker is shared, and StrictMode double-mounts in dev) ----
  useEffect(() => {
    let cancelled = false;
    loadPdf(doc.id)
      .then((loaded) => {
        if (!cancelled) setPdf(loaded);
      })
      .catch((err) => {
        console.error('[pdf] falha ao carregar', err);
        if (!cancelled) setLoadError(err?.message ?? 'Não foi possível abrir este PDF.');
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  // ---- first-import processing: page count, cover thumbnail, text extraction ----
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf.getPage(1).then((p) => {
      if (!cancelled) setBasePageWidth(p.getViewport({ scale: 1 }).width);
    });
    if (content.file.numPages > 0 || processingDocs.has(doc.id)) return () => { cancelled = true; };
    processingDocs.add(doc.id);
    (async () => {
      setProcessing('Lendo o PDF…');
      const [cover, pages] = await Promise.all([renderCoverThumb(pdf), extractPagesText(pdf)]);
      if (cancelled) return;
      commit((c) => {
        c.file.numPages = pdf.numPages;
        if (cover) c.file.coverThumb = cover;
      });
      setProcessing('Indexando texto…');
      window.mythril.pdf.saveText(doc.id, pages).catch(console.error);
      if (!cancelled) setProcessing(null);
    })().finally(() => processingDocs.delete(doc.id));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  // ---- external changes (AI tools, other tabs) ----
  useEffect(
    () =>
      subscribeExternalDocChange((changed) => {
        if (changed.id === doc.id) {
          const next = parsePdfContent(changed.content);
          contentRef.current = next;
          setContent(next);
        }
      }),
    [doc.id, subscribeExternalDocChange]
  );

  // ---- container width tracking ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- scroll helpers ----
  const pageEl = useCallback(
    (page: number): HTMLElement | null =>
      scrollRef.current?.querySelector(`[data-page="${page}"]`) ?? null,
    []
  );

  const scrollToPage = useCallback(
    (page: number, behavior: ScrollBehavior = 'smooth') => {
      const target = Math.min(Math.max(1, page), Math.max(1, numPages));
      const el = pageEl(target);
      const scroller = scrollRef.current;
      if (!el || !scroller) return;
      scroller.scrollTo({ top: el.offsetTop - 12, behavior });
      // Pages above the target render lazily with an estimated aspect-ratio
      // height; as they mount and measure their real height, the target's
      // offsetTop shifts and a one-shot scroll lands short (each repeated
      // click got closer). Re-anchor while the layout is still settling.
      let lastTop = el.offsetTop;
      let attempts = 0;
      const reanchor = () => {
        const el2 = pageEl(target);
        const scroller2 = scrollRef.current;
        if (!el2 || !scroller2) return;
        if (el2.offsetTop !== lastTop) {
          lastTop = el2.offsetTop;
          scroller2.scrollTo({ top: lastTop - 12, behavior: 'instant' as ScrollBehavior });
        }
        if (++attempts < 12) setTimeout(reanchor, 100);
      };
      setTimeout(reanchor, 100);
    },
    [numPages, pageEl]
  );

  // ---- navigation history ----
  const pushHistory = useCallback(
    (page: number, label?: string) => {
      const entry = { page, scrollRatio: 0, zoom: contentRef.current.view.zoom, label };
      const next = [...contentRef.current.navHistory.slice(0, navIdx + 1), entry].slice(-50);
      commit((c) => {
        c.navHistory = next;
      });
      setNavIdx(next.length - 1);
    },
    [commit, navIdx]
  );

  const jumpTo = useCallback(
    (page: number, label?: string) => {
      scrollToPage(page);
      pushHistory(page, label);
    },
    [scrollToPage, pushHistory]
  );

  const navGo = useCallback(
    (idx: number) => {
      const entry = contentRef.current.navHistory[idx];
      if (!entry) return;
      setNavIdx(idx);
      if (entry.zoom !== contentRef.current.view.zoom) {
        commit((c) => {
          c.view.zoom = entry.zoom;
        });
      }
      requestAnimationFrame(() => scrollToPage(entry.page, 'instant' as ScrollBehavior));
    },
    [commit, scrollToPage]
  );

  const navBack = useCallback(() => navGo(navIdx - 1), [navGo, navIdx]);
  const navForward = useCallback(() => navGo(navIdx + 1), [navGo, navIdx]);

  // ---- annotation interactions ----
  const jumpToPin = (pinId: string) => {
    const pin = contentRef.current.pins.find((p) => p.id === pinId);
    if (!pin) return;
    jumpTo(pin.page, 'pin');
    openPanel('pin', pin.linkTargetPinId ?? pinId);
  };

  const selectPin = (pinId: string | null) => {
    if (pinId) openPanel('pin', pinId);
    else setSelectedPinId(null);
  };

  const fractionalFromPoint = (clientX: number, clientY: number, target: EventTarget | null): { page: number; fx: number; fy: number } | null => {
    const page = (target as HTMLElement).closest?.('[data-page]') as HTMLElement | null;
    if (!page) return null;
    const rect = page.getBoundingClientRect();
    return {
      page: Number(page.dataset.page),
      fx: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      fy: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const fractionalFromEvent = (e: React.MouseEvent) => fractionalFromPoint(e.clientX, e.clientY, e.target);

  // ---- drag a pin note from the Explorer tree onto a page → link token ----
  const PIN_NOTE_MIME = 'application/x-mythril-pin-note';

  const onPageDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(PIN_NOTE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    setTokenDragOver(true);
  };

  const onPageDrop = (e: React.DragEvent) => {
    setTokenDragOver(false);
    const payload = e.dataTransfer.getData(PIN_NOTE_MIME);
    if (!payload) return;
    e.preventDefault();
    const [pdfDocId, noteId] = payload.split(':');
    if (pdfDocId !== doc.id) return; // tokens only link within the same PDF
    const hit = fractionalFromPoint(e.clientX, e.clientY, e.target);
    if (!hit) return;
    const pin = contentRef.current.pins.find((p) => p.noteId === noteId && !p.linkTargetPinId);
    if (!pin) return;
    annotations.createLinkToken(pin.id, hit.page, hit.fx, hit.fy);
  };

  const onPageContextMenu = (e: React.MouseEvent) => {
    const hit = fractionalFromEvent(e);
    if (!hit) return;
    // don't override the menu on top of an existing pin
    if ((e.target as HTMLElement).closest('[role="button"]')) return;
    e.preventDefault();
    setHlPopover(null);
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      ...hit,
      bookmarked: contentRef.current.bookmarks.some((b) => b.page === hit.page),
    });
  };

  const onPageClick = (e: React.MouseEvent) => {
    const hit = fractionalFromEvent(e);
    if (!hit) return;
    // clicks on pins/controls don't place pins or deselect
    if ((e.target as HTMLElement).closest('[role="button"], button, a, input, select, textarea')) return;
    if (placing) {
      const tag = placing.tag;
      setPlacing(null);
      annotations.createPin(hit.page, hit.fx, hit.fy, tag).then((id) => {
        selectPin(id);
      });
      return;
    }
    if (linkingPinId) {
      annotations.createLinkToken(linkingPinId, hit.page, hit.fx, hit.fy);
      setLinkingPinId(null);
      return;
    }
    setSelectedPinId(null);
  };

  // text selection → highlight popover
  const onPagePointerUp = (e: React.MouseEvent) => {
    if (placing || linkingPinId) return;
    // selections inside pin embeds/tooltips are editing, not highlighting
    if ((e.target as HTMLElement).closest('.pdf-pin-embed, .pdf-pin-tooltip')) return;
    const page = (e.target as HTMLElement).closest('[data-page]') as HTMLElement | null;
    if (!page) return;
    // slight delay so the selection is final
    setTimeout(() => {
      const data = selectionToRects(page);
      if (data) {
        setHlPopover({ page: Number(page.dataset.page), rects: data.rects, text: data.text, x: e.clientX, y: e.clientY });
      } else {
        setHlPopover(null);
      }
    }, 10);
  };

  const applyHighlight = (color: string) => {
    if (!hlPopover) return;
    annotations.addHighlight({ page: hlPopover.page, rects: hlPopover.rects, color, text: hlPopover.text });
    setHlPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const statblockFromSelection = () => {
    if (!hlPopover) return;
    const parsed = parseStatblock(hlPopover.text);
    const first = hlPopover.rects[0] ?? { x: 0.5, y: 0.1 };
    const page = hlPopover.page;
    setHlPopover(null);
    window.getSelection()?.removeAllRanges();
    annotations.createPinFromStatblock(page, first.x, first.y, parsed).then(selectPin);
  };

  // Escape cascade: context menu → placing → linking → close active panel tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // let inputs/editors handle their own Escape (blur, cancel edit)
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (ctxMenu) setCtxMenu(null);
      else if (hlPopover) setHlPopover(null);
      else if (placing) setPlacing(null);
      else if (linkingPinId) setLinkingPinId(null);
      else if (selectedPanelTabId && panelModelRef.current?.getNodeById(selectedPanelTabId))
        panelModelRef.current.doAction(Actions.deleteTab(selectedPanelTabId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu, hlPopover, placing, linkingPinId, selectedPanelTabId]);

  // ---- prune panel tabs whose pin/highlight was deleted ----
  useEffect(() => {
    const model = panelModelRef.current;
    if (!model) return;
    const dead: string[] = [];
    forEachTab(model, (t) => {
      if (t.getComponent() !== 'panel') return;
      const cfg = t.getConfig();
      const alive =
        cfg?.kind === 'pin'
          ? content.pins.some((p) => p.id === cfg.refId)
          : content.highlights.some((h) => h.id === cfg.refId);
      if (!alive) dead.push(t.getId());
    });
    dead.forEach((id) => model.doAction(Actions.deleteTab(id)));
  }, [content.pins, content.highlights]);

  // ---- keep panel tab titles in sync with note titles / highlight labels ----
  useEffect(() => {
    const model = panelModelRef.current;
    if (!model) return;
    forEachTab(model, (t) => {
      if (t.getComponent() !== 'panel') return;
      const cfg = t.getConfig();
      if (!cfg?.kind) return;
      const title = panelTitle(cfg.kind, cfg.refId);
      if (t.getName() !== title) model.doAction(Actions.renameTab(t.getId(), title));
    });
  });

  // ---- adopt external content changes (e.g. bookmark renamed in the tree) ----
  useEffect(() => {
    const parsed = parsePdfContent(doc.content);
    if (JSON.stringify(parsed) !== JSON.stringify(contentRef.current)) {
      contentRef.current = parsed;
      setContent(parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.content]);

  // ---- pre-warm bookmark thumbnails so tree/history previews are instant ----
  useEffect(() => {
    if (!pdf || content.bookmarks.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const b of content.bookmarks) {
        if (cancelled) return;
        try {
          await ensurePageThumb(doc.id, pdf, b.page, 220);
        } catch {
          /* page out of range — skip */
        }
        await new Promise((r) => setTimeout(r, 80)); // don't block page rendering
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, doc.id, content.bookmarks]);

  // ---- restore last read page ----
  useEffect(() => {
    if (!pdf || numPages === 0) return;
    // a pending focus request (tree click) wins over lastPage restore
    if (pdfFocus?.docId === doc.id) return;
    const target = contentRef.current.lastPage || 1;
    if (target > 1) {
      restoreGuardUntil.current = Date.now() + 5000;
      const t = setTimeout(() => scrollToPage(target, 'instant' as ScrollBehavior), 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, numPages > 0]);

  // ---- external focus requests (Explorer tree: pins / bookmarks) ----
  useEffect(() => {
    if (!pdfFocus || pdfFocus.docId !== doc.id) return;
    if (!pdf || numPages === 0) return; // wait until pages exist
    restoreGuardUntil.current = Date.now() + 5000;
    const t = setTimeout(() => {
      if (pdfFocus.pinId) jumpToPin(pdfFocus.pinId);
      else if (pdfFocus.highlightId) {
        const hl = contentRef.current.highlights.find((h) => h.id === pdfFocus.highlightId);
        if (hl) {
          jumpTo(hl.page, 'destaque');
          openPanel('highlight', hl.id);
        }
      } else if (pdfFocus.page != null) jumpTo(pdfFocus.page, 'marcador');
      clearPdfFocus();
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFocus, pdf, numPages > 0]);

  // ---- current page tracking + lastPage persistence ----
  const lastPageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const pages = scroller.querySelectorAll<HTMLElement>('[data-page]');
      const mark = scroller.scrollTop + 120;
      let current = 1;
      for (const p of pages) {
        if (p.offsetTop <= mark) current = Number(p.dataset.page);
        else break;
      }
      setCurrentPage(current);
      if (Date.now() < restoreGuardUntil.current) return;
      if (lastPageTimer.current) clearTimeout(lastPageTimer.current);
      lastPageTimer.current = setTimeout(() => {
        commit((c) => {
          c.lastPage = current;
        });
      }, 1500);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (lastPageTimer.current) clearTimeout(lastPageTimer.current);
    };
  }, [pdf, commit]);

  const markPageActive = useCallback((page: number) => {
    setActivePages((cur) => (cur.has(page) ? cur : new Set(cur).add(page)));
  }, []);

  // ---- zoom ----
  const zoom = content.view.zoom;
  const setZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      if (clamped === contentRef.current.view.zoom) return;
      // scroll anchoring: keep the current page + relative offset stable
      const scroller = scrollRef.current;
      const el = pageEl(currentPage);
      const ratio = scroller && el ? (scroller.scrollTop - el.offsetTop) / Math.max(1, el.offsetHeight) : 0;
      commit((c) => {
        c.view.zoom = clamped;
      });
      // double rAF: re-apply after pages re-measure at the new scale
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scroller2 = scrollRef.current;
          const el2 = pageEl(currentPage);
          if (scroller2 && el2) scroller2.scrollTop = el2.offsetTop + ratio * el2.offsetHeight;
        });
      });
    },
    [commit, currentPage, pageEl]
  );

  const stepZoom = (dir: 1 | -1) => {
    const idx = ZOOM_STEPS.findIndex((s) => s >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (idx === -1 ? ZOOM_STEPS.length - 1 : idx) + dir))];
    setZoom(next);
  };

  // ctrl+wheel zoom
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(snapZoom(contentRef.current.view.zoom + (e.deltaY < 0 ? 0.15 : -0.15)));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  // ---- fullscreen ----
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---- page filter / rotation ----
  const cycleFilter = useCallback(() => {
    commit((c) => {
      const i = FILTER_ORDER.indexOf(c.view.filter);
      c.view.filter = FILTER_ORDER[(i + 1) % FILTER_ORDER.length];
    });
  }, [commit]);

  const rotatePage = useCallback(
    (page: number) => {
      commit((c) => {
        c.view.rotations[page] = ((c.view.rotations[page] ?? 0) + 90) % 360;
      });
    },
    [commit]
  );

  // ---- layout ----
  const layout = content.view.layout;
  const setLayout = useCallback(
    (next: PdfLayout, separateCover?: boolean) => {
      commit((c) => {
        c.view.layout = next;
        if (separateCover !== undefined) c.view.separateCover = separateCover;
      });
    },
    [commit]
  );

  // ---- keyboard + mouse navigation ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleLeftTab('search');
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'i' && !editing) {
        e.preventDefault();
        cycleFilter();
        return;
      }
      if (editing) return;

      const step = contentRef.current.view.layout === 'spread' ? 2 : 1;
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowDown')) {
        e.preventDefault();
        scrollToPage(currentPage + step);
      } else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault();
        scrollToPage(currentPage - step);
      } else if (e.key === '`' || e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        if (e.shiftKey) navForward();
        else navBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navForward();
      }
    };
    const onMouse = (e: MouseEvent) => {
      // only when the pointer is over the PDF scroller
      if (!scrollRef.current?.contains(e.target as Node)) return;
      if (e.button === 3) {
        e.preventDefault();
        navBack();
      } else if (e.button === 4) {
        e.preventDefault();
        navForward();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, [currentPage, scrollToPage, cycleFilter, toggleFullscreen, navBack, navForward]);

  // ---- layout math ----
  const fitWidth = Math.max(200, containerWidth - 48);
  const fallbackAspect = 1 / 1.414; // portrait A4-ish until measured

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const numbers = useMemo(() => monsterNumbers(content), [content]);

  /** pages grouped into rows: [1], [2,3], [4,5]… in spread mode with a separate cover */
  const rows = useMemo(() => {
    if (layout === 'single') return pages.map((p) => [p]);
    const out: number[][] = [];
    let i = 0;
    if (content.view.separateCover && pages.length > 0) {
      out.push([pages[0]]);
      i = 1;
    }
    for (; i < pages.length; i += 2) out.push(pages.slice(i, i + 2));
    return out;
  }, [pages, layout, content.view.separateCover]);

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-ink-3">
        <AlertTriangle size={28} className="text-danger" />
        <p className="text-sm">{loadError}</p>
      </div>
    );
  }

  const filterClass = content.view.filter === 'normal' ? '' : `pdf-filter-${content.view.filter}`;
  const showHeader = !isFullscreen || headerHover;

  const toolbar = (
    <div
      className="h-11 shrink-0 border-b border-line flex items-center gap-2 px-3 bg-sidebar relative z-30"
      onMouseLeave={() => isFullscreen && setHeaderHover(false)}
    >
      <ToolButton
        title="Sumário"
        active={leftTabs.outline}
        onClick={() => toggleLeftTab('outline')}
      >
        <ListTree size={16} />
      </ToolButton>
      <ToolButton
        title="Buscar no PDF (Ctrl+F)"
        active={leftTabs.search}
        onClick={() => toggleLeftTab('search')}
      >
        <Search size={16} />
      </ToolButton>

      <span className="text-[13px] font-medium text-ink-1 truncate flex-1 min-w-0 px-1" title={doc.title}>
        {doc.title}
      </span>

      <div className="flex items-center gap-0.5 text-ink-2">
        <button
          className="p-1.5 rounded hover:bg-hover hover:text-ink-1 disabled:opacity-40"
          title="Página anterior (PageUp)"
          disabled={currentPage <= 1}
          onClick={() => scrollToPage(currentPage - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1 text-[12px]">
          <input
            className="w-10 bg-overlay text-ink-1 text-center rounded px-1 py-0.5 outline-none border border-transparent focus:border-accent"
            value={pageInput || String(currentPage)}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onFocus={(e) => {
              setPageInput(String(currentPage));
              e.currentTarget.select();
            }}
            onBlur={() => setPageInput('')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = parseInt(pageInput || '', 10);
                if (n) jumpTo(n);
                setPageInput('');
                e.currentTarget.blur();
              }
            }}
          />
          <span className="text-ink-3">/ {numPages || '…'}</span>
        </div>
        <button
          className="p-1.5 rounded hover:bg-hover hover:text-ink-1 disabled:opacity-40"
          title="Próxima página (PageDown)"
          disabled={numPages > 0 && currentPage >= numPages}
          onClick={() => scrollToPage(currentPage + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center gap-0.5 text-ink-2">
        <button
          className="p-1.5 rounded hover:bg-hover hover:text-ink-1 disabled:opacity-40"
          title="Reduzir zoom"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => stepZoom(-1)}
        >
          <ZoomOut size={16} />
        </button>
        <ZoomInput zoom={zoom} onCommit={(z) => setZoom(z)} />
        <button
          className="p-1.5 rounded hover:bg-hover hover:text-ink-1 disabled:opacity-40"
          title="Aumentar zoom"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => stepZoom(1)}
        >
          <ZoomIn size={16} />
        </button>
      </div>

      <LayoutMenu layout={layout} separateCover={content.view.separateCover} onChange={setLayout} />

      <ToolButton title={`Filtro de página: ${FILTER_LABELS[content.view.filter]} (Shift+I)`} onClick={cycleFilter}>
        <Contrast size={16} className={content.view.filter !== 'normal' ? 'text-accent-ink' : undefined} />
      </ToolButton>
      <ToolButton
        title={isFullscreen ? 'Sair da tela cheia (F11)' : 'Tela cheia (F11)'}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </ToolButton>
    </div>
  );

  const pagesContent = (
    <div
      ref={scrollRef}
      className={`pdf-scroll h-full overflow-auto relative ${filterClass} ${placing || linkingPinId ? 'cursor-crosshair' : ''}`}
      onContextMenu={onPageContextMenu}
      onClick={onPageClick}
      onPointerUp={onPagePointerUp}
      onDragOver={onPageDragOver}
      onDragLeave={() => setTokenDragOver(false)}
      onDrop={onPageDrop}
    >
          {processing && (
            <div className="absolute inset-x-0 top-4 z-10 flex justify-center pointer-events-none">
              <div className="flex items-center gap-2 bg-elevated border border-line rounded-full px-4 py-1.5 text-[12px] text-ink-2 shadow-lg">
                <Loader2 size={14} className="animate-spin" />
                {processing}
              </div>
            </div>
          )}

          {tokenDragOver && (
            <div className="sticky top-4 z-20 flex justify-center pointer-events-none">
              <div className="bg-elevated border border-accent/40 rounded-full px-4 py-1.5 text-[12px] text-ink-1 shadow-lg">
                Solte para criar um token de link aqui
              </div>
            </div>
          )}

          {(placing || linkingPinId) && (
            <div className="sticky top-4 z-20 flex justify-center pointer-events-none">
              <div className="bg-elevated border border-accent/40 rounded-full px-4 py-1.5 text-[12px] text-ink-1 shadow-lg">
                {placing ? 'Clique no PDF para posicionar o pin (Esc cancela)' : 'Clique numa página para posicionar o token de link (Esc cancela)'}
              </div>
            </div>
          )}

          {content.view.historySpine && (
            <HistorySpine entries={content.navHistory} index={navIdx} onGo={navGo} />
          )}

          <div className="flex flex-col gap-4 py-4 min-h-full">
            {!pdf && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-ink-3 py-24">
                <Loader2 size={24} className="animate-spin" />
                <p className="text-sm">Abrindo PDF…</p>
              </div>
            )}
            {pdf &&
              rows.map((row) => {
                const rowWidth = fitWidth - (row.length - 1) * 16;
                const pageWidth = rowWidth / row.length;
                const rowScale = (pageWidth / basePageWidth) * zoom;
                return (
                  <div key={row[0]} className="flex gap-4 justify-center items-start">
                    {row.map((p) => {
                      const bookmark = content.bookmarks.find((b) => b.page === p);
                      return (
                        <PageView
                          key={p}
                          pdf={pdf}
                          pageNumber={p}
                          scale={rowScale}
                          rotation={content.view.rotations[p] ?? 0}
                          fallbackAspect={fallbackAspect}
                          onVisible={markPageActive}
                        >
                          {/* bookmark ribbon */}
                          <button
                            className={`absolute top-0 left-2 z-10 transition-all ${
                              bookmark ? 'opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'
                            }`}
                            title={bookmark ? 'Remover marcador' : 'Marcar esta página'}
                            onClick={(e) => {
                              e.stopPropagation();
                              annotations.toggleBookmark(p);
                            }}
                          >
                            <Bookmark
                              size={18}
                              style={{ color: bookmark?.color ?? '#8a94a6' }}
                              className={bookmark ? 'fill-current drop-shadow' : 'drop-shadow'}
                            />
                          </button>
                          {/* per-page rotation */}
                          <button
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/45 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-black/65 transition-opacity"
                            title={`Girar página (atual: ${content.view.rotations[p] ?? 0}°)`}
                            onClick={(e) => {
                              e.stopPropagation();
                              rotatePage(p);
                            }}
                          >
                            <RotateCw size={13} />
                          </button>
                          <HighlightLayer
                            highlights={content.highlights.filter((h) => h.page === p)}
                            onClick={(hl) => openPanel('highlight', hl.id)}
                          />
                          <PinLayer
                            pins={content.pins.filter((pin) => pin.page === p)}
                            docs={docs}
                            numbers={numbers}
                            selectedPinId={selectedPinId}
                            onOpenPanel={(pinId) => openPanel('pin', pinId)}
                            onUpdate={(pinId, patch) => annotations.updatePin(pinId, patch)}
                            onMove={(pinId, x, y) => annotations.movePin(pinId, p, x, y)}
                            onJumpToPin={jumpToPin}
                            onStartLink={(pinId) => setLinkingPinId(pinId)}
                            onDelete={(pinId) => annotations.deletePin(pinId)}
                          />
                          <LinkLayer
                            docId={doc.id}
                            pdf={pdf}
                            pageNumber={p}
                            active={activePages.has(p)}
                            onJump={jumpTo}
                          />
                        </PageView>
                      );
                    })}
                  </div>
                );
              })}
          </div>
    </div>
  );

  // ---- flexlayout factory: pages / outline / search / annotation panels ----
  const pdfFactory = (node: TabNode): React.ReactNode => {
    switch (node.getComponent()) {
      case 'pages':
        return pagesContent;
      case 'outline':
        return pdf ? (
          <div className="h-full [&>div]:w-full [&>div]:border-r-0">
            <OutlinePanel pdf={pdf} onJump={(p) => jumpTo(p, 'sumário')} onClose={() => toggleLeftTab('outline')} />
          </div>
        ) : null;
      case 'search':
        return pdf && searcher ? (
          <div className="h-full [&>div]:w-full [&>div]:border-r-0">
            <SearchPanel searcher={searcher} onJump={(p) => jumpTo(p, 'busca')} onClose={() => toggleLeftTab('search')} />
          </div>
        ) : null;
      case 'panel': {
        const cfg = node.getConfig();
        const pin = cfg?.kind === 'pin' ? content.pins.find((p) => p.id === cfg.refId) : undefined;
        const hl = cfg?.kind === 'highlight' ? content.highlights.find((h) => h.id === cfg.refId) : undefined;
        if (pin)
          return (
            <PinPanel
              pin={pin}
              content={content}
              annotations={annotations}
              onJumpToPin={jumpToPin}
              onStartLink={(pinId) => setLinkingPinId(pinId)}
              onLocate={() => jumpTo(pin.page, 'pin')}
              onClose={() => closePanel('pin', pin.id)}
            />
          );
        if (hl)
          return (
            <HighlightPanel
              hl={hl}
              content={content}
              annotations={annotations}
              commit={commit}
              onLocate={() => jumpTo(hl.page, 'destaque')}
              onClose={() => closePanel('highlight', hl.id)}
            />
          );
        return null;
      }
      default:
        return null;
    }
  };

  return (
    <div ref={rootRef} className="h-full flex flex-col bg-app overflow-hidden">
      {showHeader ? (
        toolbar
      ) : (
        <div
          className="absolute top-0 inset-x-0 h-2 z-40"
          onMouseEnter={() => setHeaderHover(true)}
        />
      )}

      <div className="flex-1 min-h-0 relative">
        <Layout
          model={panelModel}
          factory={pdfFactory}
          realtimeResize={true}
          onModelChange={(m) => {
            syncFromModel(m);
            commit((c) => {
              c.view.panelLayout = m.toJson();
            });
          }}
        />
      </div>

      {ctxMenu && (
        <PdfContextMenu
          state={ctxMenu}
          onPickPin={(tag) => {
            setPlacing({ tag });
            setCtxMenu(null);
          }}
          onToggleBookmark={() => {
            annotations.toggleBookmark(ctxMenu.page);
            setCtxMenu(null);
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {hlPopover && (
        <HighlightPopover
          state={hlPopover}
          labels={content.hlLabels}
          onPickColor={applyHighlight}
          onStatblock={statblockFromSelection}
          onClose={() => setHlPopover(null)}
        />
      )}
      {!content.onboardingSeen && pdf && (
        <OnboardingModal
          onClose={() =>
            commit((c) => {
              c.onboardingSeen = true;
            })
          }
        />
      )}
    </div>
  );
}

function ToolButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-hover hover:text-ink-1'
      }`}
    >
      {children}
    </button>
  );
}

function LayoutMenu({
  layout,
  separateCover,
  onChange,
}: {
  layout: PdfLayout;
  separateCover: boolean;
  onChange: (layout: PdfLayout, separateCover?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <ToolButton title="Layout de páginas" active={layout === 'spread'} onClick={() => setOpen(!open)}>
        {layout === 'spread' ? <BookOpen size={16} /> : <FileText size={16} />}
      </ToolButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-elevated border border-line rounded-lg shadow-xl py-1 z-50 animate-fade-in">
          <LayoutOption
            label="Página única"
            checked={layout === 'single'}
            onClick={() => onChange('single')}
          />
          <LayoutOption
            label="Duas páginas (spread)"
            checked={layout === 'spread'}
            onClick={() => onChange('spread')}
          />
          <div className="my-1 border-t border-line" />
          <label
            className={`flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover ${
              layout === 'spread' ? 'cursor-pointer hover:text-ink-1' : 'opacity-40 cursor-default'
            }`}
          >
            <input
              type="checkbox"
              className="accent-accent"
              disabled={layout !== 'spread'}
              checked={separateCover}
              onChange={(e) => onChange('spread', e.target.checked)}
            />
            Capa separada (página 1)
          </label>
        </div>
      )}
    </div>
  );
}

function LayoutOption({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 text-left"
      onClick={onClick}
    >
      <span className={`w-4 ${checked ? 'text-accent-ink' : 'text-transparent'}`}>
        <Check size={13} />
      </span>
      {label}
    </button>
  );
}

function ZoomInput({ zoom, onCommit }: { zoom: number; onCommit: (z: number) => void }) {
  const [value, setValue] = useState('');
  return (
    <input
      className="w-12 bg-overlay text-ink-1 text-center text-[12px] rounded px-1 py-0.5 outline-none border border-transparent focus:border-accent"
      title="Digite um zoom % e pressione Enter"
      value={value || `${Math.round(zoom * 100)}%`}
      onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
      onFocus={(e) => {
        setValue(String(Math.round(zoom * 100)));
        e.currentTarget.select();
      }}
      onBlur={() => setValue('')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const n = parseInt(value, 10);
          if (n) onCommit(clampZoom(n / 100));
          setValue('');
          e.currentTarget.blur();
        }
      }}
    />
  );
}
