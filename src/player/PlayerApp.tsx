/* Root of the player-facing second window (?window=player).
   Receives what to display from the GM window over IPC and live-reloads
   document content via docs:changed broadcasts. */

import { useEffect, useState } from 'react';
import type { DocNode, SecondWindowState } from '@shared/types';
import { PlayerNoteView } from './PlayerNoteView';
import { PlayerMapView } from './PlayerMapView';
import './player.css';

function IdleScreen() {
  return (
    <div className="pw-idle">
      <div className="pw-idle-rune" />
      <div className="pw-idle-text">Aguardando o mestre</div>
    </div>
  );
}

export default function PlayerApp() {
  const [state, setState] = useState<SecondWindowState>({ kind: 'none' });
  const [doc, setDoc] = useState<DocNode | null>(null);

  // initial state (window reopened) + live pushes from the GM window
  useEffect(() => {
    let cancelled = false;
    let gotLivePush = false;
    const unsubscribe = window.diegesis.secondWindow.onState((s) => {
      gotLivePush = true;
      setState(s);
    });
    window.diegesis.secondWindow.status().then((s) => {
      // a live push that arrived first is newer than the cached state
      if (!cancelled && !gotLivePush) setState(s.state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // load + live-reload the referenced document. Depends on primitives (not
  // the state object) so viewport-only pushes don't re-fetch the realm.
  const realmId = state.kind === 'none' ? null : state.realmId;
  const docId = state.kind === 'none' ? null : state.docId;
  useEffect(() => {
    if (!realmId || !docId) {
      setDoc(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const docs = await window.diegesis.docs.listByRealm(realmId);
      if (!cancelled) setDoc(docs.find((d) => d.id === docId) ?? null);
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
      {state.kind === 'note' && doc && <PlayerNoteView title={doc.title} content={doc.content} />}
      {state.kind === 'map' && doc && <PlayerMapView content={doc.content} viewport={state.viewport} />}
      {(state.kind === 'none' || !doc) && <IdleScreen />}
    </div>
  );
}
