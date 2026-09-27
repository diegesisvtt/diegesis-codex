import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PlayerApp from './player/PlayerApp';
import './styles.css';

// the second (player-facing) window loads the same bundle with ?window=player
const isPlayerWindow = new URLSearchParams(window.location.search).get('window') === 'player';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPlayerWindow ? <PlayerApp /> : <App />}</React.StrictMode>
);
