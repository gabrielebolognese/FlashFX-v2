import { useEffect, useRef, useState } from 'react';
import { useAgentBuildStore, type AgentCursorTarget } from './agentBuildStore';

// The visual layer of the cinematic agent build: a full-viewport, pointer-events-none overlay that
// (1) rings the whole editor with a slow-pulsing amber glow while a build runs, and (2) flies a fake
// "agent" cursor around — ballistically eased toward whatever target the editor store sets, resolved
// to screen pixels every frame so it tracks scroll/layout live. Nothing here is interactive; it only
// reflects `useAgentBuildStore`. The cursor is moved by writing to a ref in an rAF loop (no per-frame
// React re-render); only clicks and the label cause a render.

const ACCENT = '#f7b500';

/** Resolve a target descriptor to a screen point, or null if its element isn't in the DOM yet. */
function resolveTarget(t: AgentCursorTarget | null): { x: number; y: number } | null {
  if (!t) return null;
  if (t.kind === 'screen') return { x: t.x, y: t.y };
  if (t.kind === 'dom') {
    const el = document.querySelector(t.selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // canvasRel — a fraction inside the viewport/canvas element.
  const el = document.querySelector('[data-tutorial-id="canvas"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * t.fx, y: r.top + r.height * t.fy };
}

export function AgentBuildOverlay() {
  const active = useAgentBuildStore((s) => s.active);
  const label = useAgentBuildStore((s) => s.label);
  const clickPulse = useAgentBuildStore((s) => s.clickPulse);
  const cursorIcon = useAgentBuildStore((s) => s.cursorIcon);

  const cursorRef = useRef<HTMLDivElement>(null);
  const pos = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const [clicking, setClicking] = useState(false);

  // Ballistic follow loop: exponential ease toward the resolved target, capped so long jumps read as
  // a fast glide rather than a teleport. Reads the store imperatively so it never re-subscribes.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const target = resolveTarget(useAgentBuildStore.getState().cursorTarget);
      if (target) {
        if (!pos.current) pos.current = { ...target };
        const p = pos.current;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        // Ease ~18%/frame, but never step more than ~46px so a cross-screen move stays a visible glide.
        const step = Math.min(dist, Math.max(dist * 0.18, dist > 0.5 ? 1.2 : 0));
        const capped = Math.min(step, 46);
        if (dist > 0.01) {
          p.x += (dx / dist) * capped;
          p.y += (dy / dist) * capped;
        }
        const el = cursorRef.current;
        if (el) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  // One-shot click pop whenever clickPulse changes.
  useEffect(() => {
    if (clickPulse === 0) return;
    setClicking(true);
    const id = window.setTimeout(() => setClicking(false), 320);
    return () => window.clearTimeout(id);
  }, [clickPulse]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-hidden>
      <style>{`
        @keyframes ffxAgentPulse {
          0%, 100% { opacity: 0.55; box-shadow: inset 0 0 0 2px ${ACCENT}66, inset 0 0 34px 4px ${ACCENT}22; }
          50%      { opacity: 1;    box-shadow: inset 0 0 0 2px ${ACCENT}cc, inset 0 0 70px 10px ${ACCENT}3a; }
        }
        @keyframes ffxAgentClick {
          0%   { transform: scale(0.2); opacity: 0.9; }
          100% { transform: scale(1.9); opacity: 0; }
        }
      `}</style>

      {/* Pulsing amber border — pure CSS animation so it stays smooth through main-thread jank. */}
      <div className="absolute inset-0" style={{ animation: 'ffxAgentPulse 2.4s ease-in-out infinite' }} />

      {/* Agent cursor — a deliberately oversized, on-brand AMBER pointer (never the OS cursor), so the
          user always sees where "the agent" is working. Positioned via translate on a ref (rAF loop). */}
      <div ref={cursorRef} className="absolute top-0 left-0 will-change-transform" style={{ transform: 'translate3d(-200px,-200px,0)' }}>
        <div className="relative -translate-x-[3px] -translate-y-[2px]">
          {/* click ripple */}
          {clicking && (
            <span
              className="absolute left-2 top-2 h-8 w-8 rounded-full"
              style={{ border: `2.5px solid ${ACCENT}`, animation: 'ffxAgentClick 0.32s ease-out forwards' }}
            />
          )}
          {/* cursor sprite — big amber pointer / hand, dark outline + amber glow */}
          {cursorIcon === 'hand' ? (
            <svg width="30" height="33" viewBox="0 0 22 24" fill="none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 7px #f7b50088)' }}>
              <path d="M6 2.5c0-1 1.6-1 1.6 0V10l1.2-.2V4.3c0-1 1.6-1 1.6 0V10l1.2.1V6.1c0-1 1.6-1 1.6 0v5l1.1.4c1 .3 1.4 1 1.4 2.2 0 2.4-1 6.6-3.2 8.3-1 .8-2.2 1-3.6 1-2.6 0-4.2-1.2-5.3-3.4L2 15.4c-.5-1 .9-2.1 1.7-1.2l1.1 1.2V4.3c0-1 1.6-1 1.6 0" fill={ACCENT} stroke="#0a0f16" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="30" height="34" viewBox="0 0 24 28" fill="none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 7px #f7b50088)' }}>
              <path d="M3.5 2 L3.5 22.5 L9 17.4 L12.7 25.6 L16.7 23.8 L13 15.8 L20.5 15.5 Z" fill={ACCENT} stroke="#0a0f16" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          )}
          {/* label chip */}
          {label && (
            <div
              className="absolute left-7 top-6 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: '#0a0f16e6', color: ACCENT, border: `1px solid ${ACCENT}55` }}
            >
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
