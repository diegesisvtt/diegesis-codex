import type { LucideIcon } from 'lucide-react';
import type { DocNode } from '@shared/types';
import type { Disposable } from './types';

/** Context passed to 'explorer:item' menu contributions. */
export interface ExplorerMenuContext {
  /** the document for real rows; null for virtual bookmark rows and the
   *  empty-area ('explorer:background') menu, which has no target */
  doc: DocNode | null;
  /** set when the row is a virtual PDF bookmark */
  bookmark?: { pdfDocId: string; bookmarkId: string; label: string; page: number };
}

/** Menus plugins can contribute items to. */
export type MenuLocation = 'explorer:item' | 'explorer:background';

/**
 * An item contributed to a host context menu. The host renders built-in
 * entries first, then plugin items (after a divider), filtering by `when`.
 */
export interface MenuItemContribution {
  location: MenuLocation;
  /** unique within the location, e.g. 'hexcrawl/add-region' */
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  /** return false to hide the item for a given target */
  when?(ctx: ExplorerMenuContext): boolean;
  run(ctx: ExplorerMenuContext): void;
}

export class MenuRegistry {
  private items = new Map<string, MenuItemContribution>();
  private listeners = new Set<() => void>();
  private version = 0;

  add(item: MenuItemContribution): Disposable {
    const key = `${item.location}:${item.id}`;
    // first wins: duplicate ids would let one plugin spoof another's menu item
    if (this.items.has(key)) {
      console.warn(`[menus] item '${key}' já registrado — ignorando`);
      return { dispose: () => {} };
    }
    this.items.set(key, item);
    this.notify();
    return {
      dispose: () => {
        if (this.items.get(key) === item) this.items.delete(key);
        this.notify();
      },
    };
  }

  list(location: MenuLocation): MenuItemContribution[] {
    return [...this.items.values()].filter((i) => i.location === location);
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
