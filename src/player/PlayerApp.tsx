/* Root of the player-facing Player View window (?window=player).
   Receives what to display from the GM window over IPC and live-reloads
   document content via docs:changed broadcasts. */

import { useEffect, useState } from 'react';
import type { DocNode, PlayerViewState } from '@shared/types';
import { PlayerNoteView } from './PlayerNoteView';
import { PlayerMapView } from './PlayerMapView';
import { PlayerDungeonView } from './PlayerDungeonView';
import { PlayerImageView } from './PlayerImageView';
import './player.css';

function IdleScreen() {
  return (
    <div className="pw-idle">
      <div className="pw-idle-rune" />
      <div className="pw-idle-text">Aguardando o mestre</div>
    </div>
  );
}

/** Root font-size multiplier for the player window (player.css is all rem).
 *  Small windows keep the base size; large ones (TVs) grow super-linearly so
 *  text stays readable at viewing distance — same physical size on 1080p and
 *  4K because the input is the physical window height. */
function autoTextScaleFactor(): number {
  const physHeight = window.innerHeight * window.devicePixelRatio;
  if (physHeight <= 860) return 1;
  return Math.min(4, Math.pow(physHeight / 800, 1.6));
}

/** Applies the effective text scale (GM override wins over auto) to the
 *  document root; re-evaluates on resize (maximize on the TV, etc.). */
function usePlayerTextScale(override: number | null): void {
  useEffect(() => {
    const apply = () => {
      const factor = override ?? autoTextScaleFactor();
      document.documentElement.style.fontSize = `${16 * factor}px`;
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [override]);
}

export default function PlayerApp() {
  const [state, setState] = useState<PlayerViewState>({ kind: 'none' });
  const [doc, setDoc] = useState<DocNode | null>(null);
  const [docs, setDocs] = useState<DocNode[]>([]);
  /** GM window forces a fixed text scale (settings "Tamanho do texto");
   *  null = auto-scale with the window size */
  const [scaleOverride, setScaleOverride] = useState<number | null>(null);

  // keep a distinct window title so capture tools don't confuse this
  // window with the GM window (belt-and-suspenders with the main-process
  // page-title-updated guard in electron/playerView.ts)
  useEffect(() => {
    document.title = 'Diegesis Codex — Player View';
  }, []);

  // initial state (window reopened) + live pushes from the GM window
  useEffect(() => {
    let cancelled = false;
    let gotLivePush = false;
    const unsubscribe = window.diegesis.playerView.onState((s) => {
      gotLivePush = true;
      setState(s);
    });
    const unsubscribeScale = window.diegesis.playerView.onScale((scale) => {
      if (!cancelled) setScaleOverride(scale);
    });
    window.diegesis.playerView.status().then((s) => {
      // a live push that arrived first is newer than the cached state
      if (!cancelled && !gotLivePush) setState(s.state);
      if (!cancelled) setScaleOverride(s.scale);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeScale();
    };
  }, []);

  usePlayerTextScale(scaleOverride);

  // load + live-reload the referenced document. Depends on primitives (not
  // the state object) so viewport-only pushes don't re-fetch the realm.
  // Image states carry their own payload — no document fetch needed.
  const realmId = state.kind === 'note' || state.kind === 'map' || state.kind === 'dungeon' ? state.realmId : null;
  const docId = state.kind === 'note' || state.kind === 'map' || state.kind === 'dungeon' ? state.docId : null;
  useEffect(() => {
    if (!realmId || !docId) {
      setDoc(null);
      setDocs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const docs = await window.diegesis.docs.listByRealm(realmId);
      if (!cancelled) {
        setDocs(docs);
        setDoc(docs.find((d) => d.id === docId) ?? null);
      }
    };
    void load();
    const unsubscribe = window.diegesis.docs.onChanged((changedRealm) => {
      if (changedRealm === realmId) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realmId, docId]);

  return (
    <div className="pw-root">
      {state.kind === 'note' && doc && (
        <PlayerNoteView
          title={doc.title}
          content={doc.content}
          resolveTitle={(id) => docs.find((d) => d.id === id)?.title}
        />
      )}
      {state.kind === 'map' && doc && <PlayerMapView content={doc.content} viewport={state.viewport} />}
      {state.kind === 'dungeon' && doc && (
        // key por doc: trocar de dungeon recria o canvas (world size/grid mudam)
        <PlayerDungeonView key={doc.id} content={doc.content} viewport={state.viewport} />
      )}
      {state.kind === 'image' && <PlayerImageView src={state.src} name={state.name} />}
      {(state.kind === 'none' || (state.kind !== 'image' && !doc)) && <IdleScreen />}
    </div>
  );
}
