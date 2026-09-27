import type { ComponentType } from 'react';
import type { DocNode } from '@shared/types';
import type { Disposable } from './types';

/** Props passed to a contributed document editor. */
export interface EditorProps {
  doc: DocNode;
}

export type EditorComponent = ComponentType<EditorProps>;

/**
 * A contributed document editor. Plugins register an editor component for a
 * document type; the host shell renders it in place of the built-in editors
 * (core types are reserved and cannot be overridden).
 *
 * Scope note: document types must be declared in the host's DocumentType
 * union (shared/types.ts). To make a type creatable, also register a
 * DocTypeContribution via ctx.docTypes.add — creation UIs, default titles
 * and initial content come from that registry (see docTypes.ts).
 */
export interface EditorContribution {
  /** document type handled by this editor, e.g. 'hexcrawl/map' */
  docType: string;
  component: EditorComponent;
}

/** document types owned by the host shell — plugins cannot override these */
const CORE_DOC_TYPES = new Set(['core/note', 'core/whiteboard', 'core/folder', 'core/pdf']);

export class EditorRegistry {
  private editors = new Map<string, EditorContribution>();
  private listeners = new Set<() => void>();
  private version = 0;

  addEditor(editor: EditorContribution): Disposable {
    if (CORE_DOC_TYPES.has(editor.docType)) {
      console.warn(`[editors] tipo core '${editor.docType}' não pode ser sobrescrito — ignorando`);
      return { dispose: () => {} };
    }
    // first wins: replacing an existing editor would let one plugin spoof another's UI
    if (this.editors.has(editor.docType)) {
      console.warn(`[editors] editor para '${editor.docType}' já registrado — ignorando`);
      return { dispose: () => {} };
    }
    this.editors.set(editor.docType, editor);
    this.notify();
    return {
      dispose: () => {
        if (this.editors.get(editor.docType) === editor) this.editors.delete(editor.docType);
        this.notify();
      },
    };
  }

  getEditor(docType: string): EditorContribution | undefined {
    return this.editors.get(docType);
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
