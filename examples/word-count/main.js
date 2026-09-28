'use strict';
/**
 * Plugin de exemplo para o Diegesis Codex — contagem de palavras do universo ativo.
 *
 * Instalação:
 *   1. No app: Configurações → Plugins → Pasta (abre a pasta de plugins)
 *   2. Copie esta pasta ("word-count") para lá
 *   3. Configurações → Plugins → Recarregar
 *
 * O código roda num soft sandbox: sem acesso a window/document/diegesis — só
 * ao `ctx` recebido em activate(), limitado às permissões do manifest.json.
 * Módulos disponíveis via require: 'react', 'react/jsx-runtime', 'lucide-react'.
 */

const React = require('react');
const { BarChart3 } = require('lucide-react');

const { useCallback, useEffect, useState } = React;
const e = React.createElement;

/** PluginContext recebido no activate (já gateado pelas permissões). */
let host = null;

function wordCount(text) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Conta palavras apenas em campos de texto do documento BlockNote. */
function countInBlocks(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countInBlocks(v), 0);
  if (value && typeof value === 'object') {
    let n = 0;
    for (const [key, v] of Object.entries(value)) {
      n += key === 'text' && typeof v === 'string' ? wordCount(v) : countInBlocks(v);
    }
    return n;
  }
  return 0;
}

function StatsView() {
  const [stats, setStats] = useState(null);

  const reload = useCallback(async () => {
    const realmId = host.app.activeRealmId;
    if (!realmId || !host.app.docs || !host.app.docs.listByRealm) {
      setStats({ notes: 0, words: 0 });
      return;
    }
    const docs = await host.app.docs.listByRealm(realmId);
    const notes = docs.filter((d) => d.type === 'core/note');
    let words = 0;
    for (const note of notes) {
      if (!note.content) continue;
      try {
        words += countInBlocks(JSON.parse(note.content));
      } catch {
        /* conteúdo não-JSON: ignora */
      }
    }
    setStats({ notes: notes.length, words });
  }, []);

  useEffect(() => {
    reload();
    const sub = host.events.on('realm:changed', () => reload());
    return () => sub.dispose();
  }, [reload]);

  if (!stats) {
    return e('div', { className: 'h-full flex items-center justify-center text-ink-3 text-sm' }, 'Calculando…');
  }

  const card = (label, value) =>
    e(
      'div',
      { className: 'bg-elevated border border-line rounded-lg p-5 flex flex-col gap-1' },
      e('span', { className: 'text-[11px] uppercase tracking-widest text-ink-3' }, label),
      e('span', { className: 'text-2xl font-semibold text-ink-1 tabular-nums' }, value.toLocaleString('pt-BR'))
    );

  return e(
    'div',
    { className: 'h-full overflow-y-auto p-8' },
    e('h2', { className: 'text-lg font-semibold text-ink-1 tracking-tight mb-1' }, 'Estatísticas do universo'),
    e(
      'p',
      { className: 'text-[13px] text-ink-3 mb-6' },
      'Contagem de palavras sobre as notas do universo ativo (plugin de comunidade).'
    ),
    e('div', { className: 'grid grid-cols-2 gap-4 max-w-md' }, card('Notas', stats.notes), card('Palavras', stats.words)),
    e(
      'button',
      {
        onClick: reload,
        className:
          'mt-6 text-[12px] text-ink-3 hover:text-ink-2 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors border border-line bg-sidebar',
      },
      'Recalcular'
    )
  );
}

module.exports = {
  activate(ctx) {
    host = ctx;

    ctx.views.add({
      id: 'word-count:stats',
      title: 'Estatísticas',
      location: 'workspace-tab',
      component: StatsView,
    });

    ctx.commands.add({
      id: 'community/word-count:open',
      title: 'Word Count: estatísticas do universo',
      run: () => ctx.app.openView('word-count:stats'),
    });

    ctx.views.addRibbonItem({
      id: 'community/word-count:ribbon',
      title: 'Estatísticas de palavras',
      icon: BarChart3,
      command: 'community/word-count:open',
      order: 40,
    });
  },

  deactivate() {
    host = null;
  },
};
