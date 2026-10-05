import type { ComponentType } from 'react';
import type { Disposable, PluginSettings } from './types';

/**
 * Settings pages — modelo híbrido inspirado no Obsidian:
 *
 * - Schema declarativo: o plugin declara campos tipados via
 *   `ctx.settings.registerAll([...])` e o host gera o formulário
 *   automaticamente na tela de Configurações.
 * - Página custom (Obsidian): o plugin contribui um componente React inteiro
 *   via `ctx.settingsPages.add({ component })`, que substitui o formulário
 *   auto-gerado do schema.
 *
 * Os valores continuam fluindo pelo PluginSettings KV existente
 * (uiState.plugins.settings[pluginId]) — nenhum IPC novo.
 */

export type SettingType = 'string' | 'text' | 'number' | 'boolean' | 'select' | 'color';

/** Declaração de um campo de configuração (formulário auto-gerado). */
export interface SettingDeclaration {
  /** chave no blob de settings do plugin (mesma usada em settings.get/set) */
  key: string;
  type: SettingType;
  label: string;
  /** texto de ajuda renderizado sob o campo */
  description?: string;
  /** fallback quando a chave não existe no blob persistido */
  default: unknown;
  /** obrigatório para 'select' */
  choices?: { value: string; label: string }[];
  /** 'number': quando min E max existem, renderiza slider; senão, input numérico */
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

/** Props da página de configuração de um plugin (custom ou auto-gerada). */
export interface SettingsPageProps {
  settings: PluginSettings;
}

/** Página de configuração contribuída por um plugin (visão do autor). */
export interface SettingsPageContribution {
  /** unique; first wins */
  id: string;
  title: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  /** lower sorts first */
  order?: number;
  /** omitido → o host gera o formulário a partir do schema declarado */
  component?: ComponentType<SettingsPageProps>;
}

/** Página registrada, com o dono resolvido pelo host na ativação. */
export interface RegisteredSettingsPage extends SettingsPageContribution {
  pluginId: string;
}

/** Entrada da nav de Configurações: página explícita ou implícita (schema-only). */
export interface SettingsNavEntry {
  /** id único da seção na nav (page id, ou `schema:<pluginId>` para implícitas) */
  id: string;
  pluginId: string;
  title: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  order: number;
  /** undefined → formulário auto-gerado a partir do schema do plugin */
  component?: ComponentType<SettingsPageProps>;
}

export class SettingsRegistry {
  private pages = new Map<string, RegisteredSettingsPage>();
  private schemas = new Map<string, Map<string, SettingDeclaration>>();
  private listeners = new Set<() => void>();
  private version = 0;

  /** Contribui uma página de settings. O pluginId é injetado pelo host. */
  addPage(pluginId: string, page: SettingsPageContribution): Disposable {
    // first wins: ids de página são globais (aparecem na nav do Settings)
    if (this.pages.has(page.id)) {
      console.warn(`[settings] página '${page.id}' já registrada — ignorando`);
      return { dispose: () => {} };
    }
    const registered: RegisteredSettingsPage = { ...page, pluginId };
    this.pages.set(page.id, registered);
    this.notify();
    return {
      dispose: () => {
        if (this.pages.get(page.id) === registered) this.pages.delete(page.id);
        this.notify();
      },
    };
  }

  /** Registra (ou complementa) o schema declarativo de um plugin. */
  addSchema(pluginId: string, declarations: SettingDeclaration[]): Disposable {
    let schema = this.schemas.get(pluginId);
    if (!schema) {
      schema = new Map();
      this.schemas.set(pluginId, schema);
    }
    const added: SettingDeclaration[] = [];
    for (const decl of declarations) {
      // first wins por chave: redeclarar uma key não a sobrescreve
      if (schema.has(decl.key)) {
        console.warn(`[settings] '${pluginId}' redeclarou a key '${decl.key}' — ignorando`);
        continue;
      }
      schema.set(decl.key, decl);
      added.push(decl);
    }
    this.notify();
    return {
      dispose: () => {
        const current = this.schemas.get(pluginId);
        if (!current) return;
        for (const decl of added) {
          if (current.get(decl.key) === decl) current.delete(decl.key);
        }
        if (current.size === 0) this.schemas.delete(pluginId);
        this.notify();
      },
    };
  }

  getSchema(pluginId: string): SettingDeclaration[] {
    return [...(this.schemas.get(pluginId)?.values() ?? [])];
  }

  /** Entradas de nav derivadas: páginas explícitas + uma implícita por plugin
   *  com schema mas sem página própria. */
  listNavEntries(): SettingsNavEntry[] {
    const entries: SettingsNavEntry[] = [...this.pages.values()].map((p) => ({
      id: p.id,
      pluginId: p.pluginId,
      title: p.title,
      icon: p.icon,
      order: p.order ?? 0,
      component: p.component,
    }));
    const covered = new Set(entries.map((e) => e.pluginId));
    for (const pluginId of this.schemas.keys()) {
      if (covered.has(pluginId)) continue;
      entries.push({ id: `schema:${pluginId}`, pluginId, title: pluginId, order: 0 });
    }
    return entries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
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
