import type { Disposable } from './types';

/**
 * A command is a named, invokable action — the unit plugins use to expose
 * functionality to keybindings, ribbon buttons and (future) a command palette.
 */
export interface Command {
  /** unique, namespaced id, e.g. 'core/search:open' */
  id: string;
  /** human-readable title (shown in palettes/settings) */
  title: string;
  /** keybinding, e.g. 'Mod+K' (Mod = Ctrl on Win/Linux, Cmd on macOS) */
  shortcut?: string;
  run(): void;
}

function normalizeShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .join('+');
}

/** Builds the canonical shortcut string for a keyboard event ('mod+shift+p'). */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (key === 'control' || key === 'meta' || key === 'shift' || key === 'alt') return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.('input, textarea, [contenteditable="true"]');
}

export class CommandRegistry {
  private commands = new Map<string, Command>();
  private shortcuts = new Map<string, string>(); // normalized shortcut -> command id
  private listeners = new Set<() => void>();
  private version = 0;

  add(command: Command): Disposable {
    // first wins: replacing an existing command would let one plugin spoof
    // another (e.g. hijack a core command or its shortcut)
    if (this.commands.has(command.id)) {
      console.warn(`[commands] command id '${command.id}' já registrado — ignorando`);
      return { dispose: () => {} };
    }
    this.commands.set(command.id, command);
    if (command.shortcut) {
      this.shortcuts.set(normalizeShortcut(command.shortcut), command.id);
    }
    this.notify();
    return {
      dispose: () => {
        if (this.commands.get(command.id) === command) {
          this.commands.delete(command.id);
        }
        if (command.shortcut && this.shortcuts.get(normalizeShortcut(command.shortcut)) === command.id) {
          this.shortcuts.delete(normalizeShortcut(command.shortcut));
        }
        this.notify();
      },
    };
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  list(): Command[] {
    return [...this.commands.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  run(id: string): void {
    const command = this.commands.get(id);
    if (!command) {
      console.warn(`[commands] unknown command '${id}'`);
      return;
    }
    try {
      command.run();
    } catch (err) {
      console.error(`[commands] command '${id}' failed`, err);
    }
  }

  /** Runs the command bound to a keyboard event, if any. Returns true when handled. */
  handleKeydown(e: KeyboardEvent): boolean {
    if (e.defaultPrevented) return false;
    // modifier-less shortcuts must not hijack typing in editable elements
    if (isEditableTarget(e) && !e.ctrlKey && !e.metaKey && !e.altKey) return false;
    const shortcut = shortcutFromEvent(e);
    if (!shortcut) return false;
    const id = this.shortcuts.get(shortcut);
    if (!id) return false;
    e.preventDefault();
    this.run(id);
    return true;
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
