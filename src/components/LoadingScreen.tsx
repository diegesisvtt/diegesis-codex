import { useEffect, useState, useSyncExternalStore } from 'react';
import { getBootSnapshot, subscribeBoot, type BootStatus } from '../state/boot';

/**
 * Full-screen boot overlay. It renders above the (already mounting) app and
 * fades out once real startup work completes — no timers, no fake progress:
 * every value comes from `state/boot`.
 */
export function BootOverlay() {
  const boot = useSyncExternalStore(subscribeBoot, getBootSnapshot);
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (boot.active) {
      setExiting(false);
      setDismissed(false);
      return;
    }
    // stay visible until startup has actually finished (not on the idle frame)
    if (boot.phase !== 'ready') return;
    setExiting(true);
    const t = setTimeout(() => setDismissed(true), 340);
    return () => clearTimeout(t);
  }, [boot.active, boot.phase]);

  if (dismissed) return null;

  return (
    <div
      className={`boot-overlay${exiting ? ' boot-overlay--exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={boot.active}
    >
      <BootScreen status={boot} />
    </div>
  );
}

function BootScreen({ status }: { status: BootStatus }) {
  const determinate = status.total > 0;
  const ratio = determinate ? Math.min(1, status.completed / status.total) : 0;
  // never claim completion while work is still running — a newly discovered
  // batch of resources grows `total` and would otherwise snap the bar back
  const pct = determinate ? (status.active ? Math.min(99, Math.round(ratio * 100)) : 100) : 0;

  return (
    <div className="boot-screen">
      <div className="boot-atmosphere" aria-hidden="true">
        <div className="boot-glow boot-glow--a" />
        <div className="boot-glow boot-glow--b" />
        <div className="boot-glow boot-glow--c" />
        <div className="boot-grid" />
      </div>

      <div className="boot-content">
        <div className="boot-emblem" aria-hidden="true">
          <span className="boot-emblem-ring boot-emblem-ring--outer" />
          <span className="boot-emblem-ring boot-emblem-ring--inner" />
          <svg viewBox="0 0 64 64" className="boot-emblem-core">
            <defs>
              <linearGradient id="boot-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <path
              d="M32 8 L52 20 V44 L32 56 L12 44 V20 Z"
              fill="none"
              stroke="url(#boot-grad)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M32 20 L43 26.5 V39.5 L32 46 L21 39.5 V26.5 Z"
              fill="none"
              stroke="#7dd3fc"
              strokeOpacity="0.5"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="33" r="4.5" fill="url(#boot-grad)" className="boot-pulse" />
          </svg>
          <span className="boot-emblem-orbit" />
        </div>

        <h1 className="boot-title">
          Diegesis <span>Codex</span>
        </h1>
        <p className="boot-tagline">Tecendo o seu universo</p>

        <div
          className="boot-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? pct : undefined}
          aria-label="Progresso de carregamento"
        >
          <div
            className={`boot-bar${determinate ? '' : ' boot-bar--indeterminate'}`}
            style={determinate ? { width: `${pct}%` } : undefined}
          >
            <span className="boot-bar-sheen" />
          </div>
        </div>

        <div className="boot-meta">
          <span className="boot-label">{status.label}</span>
          {determinate && <span className="boot-pct">{pct}%</span>}
        </div>
        <div className={`boot-detail${status.detail ? ' boot-detail--visible' : ''}`}>{status.detail ?? ''}</div>
      </div>
    </div>
  );
}
