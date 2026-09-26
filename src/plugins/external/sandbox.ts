import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as lucide from 'lucide-react';
import type { DocChanges, DocInput, DocNode, ExternalPluginManifest, SearchResult } from '@shared/types';
import type { AppFacade, PluginContext, PluginPermission } from '../api/types';

/** What an external plugin's entry file must export. */
export interface PluginExports {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/** docs API surface granted by the 'docs:read' / 'docs:write' permissions,
 *  attached to `ctx.app.docs` for external plugins. */
export interface ExternalDocsApi {
  listByRealm?(realmId: string): Promise<DocNode[]>;
  search?(realmId: string, query: string): Promise<SearchResult[]>;
  create?(doc: DocInput): Promise<DocNode>;
  update?(id: string, changes: DocChanges): Promise<void>;
}

export type ExternalAppFacade = AppFacade & { docs?: ExternalDocsApi };

const KNOWN_PERMISSIONS: readonly PluginPermission[] = [
  'ui',
  'commands',
  'events',
  'settings',
  'docs:read',
  'docs:write',
  // 'ai' ainda não tem superfície gateada implementada — declará-la gera warning
  'network',
];

export function parsePermissions(manifest: ExternalPluginManifest): Set<PluginPermission> {
  const raw = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const valid = raw.filter((p): p is PluginPermission => KNOWN_PERMISSIONS.includes(p as PluginPermission));
  const unknown = raw.filter((p) => !KNOWN_PERMISSIONS.includes(p as PluginPermission));
  if (unknown.length > 0) {
    console.warn(`[plugins] '${manifest.id}': permissões desconhecidas ignoradas: ${unknown.join(', ')}`);
  }
  return new Set(valid);
}

class PermissionError extends Error {
  constructor(capability: string, pluginId: string) {
    super(`[${pluginId}] permissão '${capability}' não declarada no manifest.json`);
    this.name = 'PermissionError';
  }
}

function denied<T extends string>(capability: string, pluginId: string, methods: T[]): Record<T, never> {
  const out = {} as Record<T, never>;
  for (const m of methods) {
    Object.defineProperty(out, m, {
      get() {
        throw new PermissionError(capability, pluginId);
      },
    });
  }
  return out;
}

function docsApi(perms: Set<PluginPermission>, assertLive: () => void): ExternalDocsApi {
  const api: ExternalDocsApi = {};
  if (perms.has('docs:read')) {
    api.listByRealm = (realmId) => {
      assertLive();
      return window.mythril.docs.listByRealm(realmId);
    };
    api.search = (realmId, query) => {
      assertLive();
      return window.mythril.docs.search(realmId, query);
    };
  }
  if (perms.has('docs:write')) {
    api.create = (doc) => {
      assertLive();
      return window.mythril.docs.create(doc);
    };
    api.update = (id, changes) => {
      assertLive();
      return window.mythril.docs.update(id, changes);
    };
  }
  return api;
}

/**
 * Enforcement estrutural de permissões: o contexto entregue ao plugin só
 * expõe as capacidades declaradas no manifest — as demais lançam
 * PermissionError ao serem tocadas. Capacidades concedidas são revogadas
 * quando `isLive()` vira false (deactivate/reload), mesmo que o plugin
 * tenha guardado uma referência ao contexto.
 */
export function gateContext(ctx: PluginContext, perms: Set<PluginPermission>, isLive: () => boolean): PluginContext {
  const pluginId = ctx.manifest.id;
  const assertLive = () => {
    if (!isLive()) throw new Error(`[${pluginId}] o plugin está desativado`);
  };

  // cópia que preserva os getters (activeRealmId/aiChatOpen) — um spread
  // congelaria seus valores no momento da ativação
  const app: ExternalAppFacade = Object.create(Object.getPrototypeOf(ctx.app));
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(ctx.app));

  if (!perms.has('ui')) {
    // navegação/manipulação de UI exige a permissão 'ui'
    for (const method of ['openDocument', 'openPanel', 'openView', 'setAiChatOpen'] as const) {
      app[method] = () => {
        throw new PermissionError('ui', pluginId);
      };
    }
  }
  if (perms.has('docs:read') || perms.has('docs:write')) {
    app.docs = docsApi(perms, assertLive);
  }

  const settings: PluginContext['settings'] = perms.has('settings')
    ? {
        get: (key, fallback) => {
          assertLive();
          return ctx.settings.get(key, fallback);
        },
        set: (key, value) => {
          assertLive();
          ctx.settings.set(key, value);
        },
        all: () => {
          assertLive();
          return ctx.settings.all();
        },
      }
    : (denied('settings', pluginId, ['get', 'set', 'all']) as unknown as PluginContext['settings']);

  return {
    ...ctx,
    app,
    events: perms.has('events')
      ? ctx.events
      : (denied('events', pluginId, ['on', 'emit']) as unknown as PluginContext['events']),
    commands: perms.has('commands')
      ? {
          add: (command) => {
            assertLive();
            return ctx.commands.add(command);
          },
        }
      : (denied('commands', pluginId, ['add']) as unknown as PluginContext['commands']),
    views: perms.has('ui')
      ? {
          add: (view) => {
            assertLive();
            return ctx.views.add(view);
          },
          addRibbonItem: (item) => {
            assertLive();
            return ctx.views.addRibbonItem(item);
          },
        }
      : (denied('ui', pluginId, ['add', 'addRibbonItem']) as unknown as PluginContext['views']),
    settings,
  };
}

/** Host modules a plugin is allowed to require(). */
function sandboxRequire(name: string): unknown {
  switch (name) {
    case 'react':
      return React;
    case 'react/jsx-runtime':
      return jsxRuntime;
    case 'lucide-react':
      return lucide;
    default:
      throw new Error(`módulo indisponível no sandbox: '${name}' (disponíveis: react, react/jsx-runtime, lucide-react)`);
  }
}

/**
 * Avalia o código do plugin num "soft sandbox": os globals poderosos
 * (window, document, mythril, fetch, localStorage…) são sombreados dentro do
 * escopo da função, e `require` só resolve módulos hospedados. É isolamento
 * de nível dissuasório — a fronteira real de segurança é o gateContext, que
 * torna as capacidades não declaradas inacessíveis estruturalmente.
 */
export function evaluatePlugin(
  code: string,
  manifest: ExternalPluginManifest,
  perms: Set<PluginPermission>
): PluginExports {
  const module = { exports: {} as Partial<PluginExports> };
  const shadow = undefined;
  // 'network' concede fetch bruto: requests cross-origin seguem CORS, mas
  // request-forgery cega contra dispositivos da LAN é possível — esta
  // permissão deve ser exibida ao usuário com esse significado
  const sandboxedFetch = perms.has('network') ? fetch.bind(globalThis) : shadow;

  const factory = new Function(
    'module',
    'exports',
    'require',
    'window',
    'document',
    'globalThis',
    'self',
    'top',
    'parent',
    'frames',
    'mythril',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    `'use strict';\n${code}`
  );

  factory(
    module,
    module.exports,
    sandboxRequire,
    shadow, // window
    shadow, // document
    shadow, // globalThis
    shadow, // self
    shadow, // top
    shadow, // parent
    shadow, // frames
    shadow, // mythril
    sandboxedFetch,
    shadow, // XMLHttpRequest
    shadow, // WebSocket
    shadow, // localStorage
    shadow, // sessionStorage
    shadow // indexedDB
  );

  const exports = module.exports;
  if (!exports || typeof exports.activate !== 'function') {
    throw new Error(`o plugin '${manifest.id}' não exporta activate(ctx)`);
  }
  return exports as PluginExports;
}
