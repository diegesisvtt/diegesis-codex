import type { LucideIcon } from 'lucide-react';
import type { Disposable } from './types';

/**
 * A creatable document type. Plugins declare how their document types appear
 * in creation UIs (Explorer's "new document" popover) and how new documents
 * are initialized — the host no longer needs hardcoded per-type knowledge.
 *
 * The docType must still be declared in the host's DocumentType union
 * (shared/types.ts); core types are reserved and cannot be overridden.
 */
export interface DocTypeContribution {
  /** document type, e.g. 'hexcrawl/map' */
  docType: string;
  /** human-readable name shown in creation UIs, e.g. 'Mapa Hexcrawl' */
  label: string;
  icon: LucideIcon;
  /** Tailwind class applied to the icon, e.g. 'text-map' */
  iconColor?: string;
  /** title used when the creator doesn't type a name */
  defaultTitle: string;
  /** initial serialized content for new documents (null for empty) */
  defaultContent?(): string | null;
  /** how the host materializes a new document of this type. 'import' types
   *  are created by the host's import flow (native file picker) instead of
   *  createDocument; the name typed in creation UIs is ignored. Defaults to
   *  'create'. */
  kind?: 'create' | 'import';
}

/** document types owned by the host shell — plugins cannot override these */
const CORE_DOC_TYPES = new Set(['core/note', 'core/whiteboard', 'core/folder', 'core/pdf']);

export class DocTypeRegistry {
  private contributions = new Map<string, DocTypeContribution>();
  private listeners = new Set<() => void>();
  private version = 0;

  add(contribution: DocTypeContribution): Disposable {
    if (CORE_DOC_TYPES.has(contribution.docType)) {
      console.warn(`[docTypes] tipo core '${contribution.docType}' não pode ser sobrescrito — ignorando`);
      return { dispose: () => {} };
    }
    return this.register(contribution);
  }

  /** host-only: registers a core document type (bypasses the core-type guard) */
  addCore(contribution: DocTypeContribution): Disposable {
    return this.register(contribution);
  }

  private register(contribution: DocTypeContribution): Disposable {
    // first wins: replacing a contribution would let one plugin spoof another's UI
    if (this.contributions.has(contribution.docType)) {
      console.warn(`[docTypes] tipo '${contribution.docType}' já registrado — ignorando`);
      return { dispose: () => {} };
    }
    this.contributions.set(contribution.docType, contribution);
    this.notify();
    return {
      dispose: () => {
        if (this.contributions.get(contribution.docType) === contribution) this.contributions.delete(contribution.docType);
        this.notify();
      },
    };
  }

  get(docType: string): DocTypeContribution | undefined {
    return this.contributions.get(docType);
  }

  list(): DocTypeContribution[] {
    return [...this.contributions.values()];
  }

  /** monotonic counter bumped on any change (React snapshot) */
  getVersion(): number {
    return this.version;
  }

  subscribe(fn: () => void): Disposable {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
