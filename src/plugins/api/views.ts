import type { ComponentType } from 'react';
import type { Disposable, ViewComponent } from './types';

export type ViewLocation = 'workspace-tab' | 'border-left' | 'right-panel';

/**
 * A contributed UI surface. The host shell renders views at their location:
 * - 'workspace-tab': resolvable by the flexlayout factory (tab `component` = view id)
 * - 'border-left': a tab in the left border panel
 * - 'right-panel': the collapsible right-side panel
 */
export interface ViewContribution {
  /** unique id; also used as the flexlayout tab `component` name */
  id: string;
  title: string;
  location: ViewLocation;
  component: ViewComponent;
  /** border-left only: fixed tab id and whether it ships in the default layout */
  tab?: { id: string; name: string; default?: boolean };
  /** lower sorts first within a location */
  order?: number;
}

/** A button contributed to the title bar (Mythril's ribbon). */
export interface RibbonItem {
  id: string;
  title: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  /** command to execute on click */
  command: string;
  /** text label next to the icon; omitted renders an icon-only button */
  label?: string;
  /** optional keybinding hint rendered as a <kbd> chip */
  kbd?: string;
  /** when true the button renders in its active/accent style.
   *  Evaluated during render — back it with store state so the host
   *  re-renders when the underlying value changes. */
  isActive?(): boolean;
  /** lower sorts first */
  order?: number;
}

export class ViewRegistry {
  private views = new Map<string, ViewContribution>();
  private ribbon = new Map<string, RibbonItem>();
  private listeners = new Set<() => void>();
  private version = 0;

  addView(view: ViewContribution): Disposable {
    // first wins: replacing an existing view would let one plugin spoof another's UI
    if (this.views.has(view.id)) {
      console.warn(`[views] view id '${view.id}' já registrada — ignorando`);
      return { dispose: () => {} };
    }
    this.views.set(view.id, view);
    this.notify();
    return {
      dispose: () => {
        if (this.views.get(view.id) === view) this.views.delete(view.id);
        this.notify();
      },
    };
  }

  addRibbonItem(item: RibbonItem): Disposable {
    if (this.ribbon.has(item.id)) {
      console.warn(`[views] ribbon item id '${item.id}' já registrado — ignorando`);
      return { dispose: () => {} };
    }
    this.ribbon.set(item.id, item);
    this.notify();
    return {
      dispose: () => {
        if (this.ribbon.get(item.id) === item) this.ribbon.delete(item.id);
        this.notify();
      },
    };
  }

  getView(id: string): ViewContribution | undefined {
    return this.views.get(id);
  }

  listViews(location?: ViewLocation): ViewContribution[] {
    const all = [...this.views.values()];
    const filtered = location ? all.filter((v) => v.location === location) : all;
    return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  listRibbonItems(): RibbonItem[] {
    return [...this.ribbon.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
