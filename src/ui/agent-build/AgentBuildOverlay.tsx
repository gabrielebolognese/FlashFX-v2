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
  // canvasRel — a fraction inside the rendered comp. The <canvas> element is sized/positioned to the
  // fitted composition rect, so its bounding box maps 1:1 to comp coords (no letterbox error). Prefer
  // it; fall back to the viewport panel if it isn't mounted.
  const el = document.querySelector('[data-ffx-canvas]') ?? document.querySelector('[data-tutorial-id="canvas"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * t.fx, y: r.top + r.height * t.fy };
}

export function AgentBuildOverlay() {
  const active = useAgentBuildStore((s) => s.active);
  const label = useAgentBuildStore((s) => s.label);
  const clickPulse = useAgentBuildStore((s) => s.clickPulse);

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
        // Ease ~24%/frame, capped so a long jump reads as a fast glide rather than a teleport — snappy
        // enough to reach a shape's centre before the next one appears during the slow early reveals.
        const step = Math.min(dist, Math.max(dist * 0.24, dist > 0.5 ? 1.5 : 0));
        const capped = Math.min(step, 64);
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
        {/* The hotspot (the arrow tip) is at ~(4,3) in the sprite; offset so it sits on the target point. */}
        <div className="relative -translate-x-[4px] -translate-y-[3px]">
          {/* click ripple — pops at the tip when the agent "places" something */}
          {clicking && (
            <span
              className="absolute left-[2px] top-[1px] h-7 w-7 rounded-full"
              style={{ border: `2.5px solid ${ACCENT}`, animation: 'ffxAgentClick 0.32s ease-out forwards' }}
            />
          )}
          {/* Figma-style arrow cursor — crisp filled pointer, on-brand amber with a dark outline. */}
          <svg width="26" height="28" viewBox="0 0 24 26" fill="none" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 5px #f7b50077)' }}>
            <path d="M4 3 L4 20.4 L8.8 16.1 L11.7 22.6 L14.8 21.2 L11.9 14.9 L18.6 14.9 Z" fill={ACCENT} stroke="#0a0f16" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
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
