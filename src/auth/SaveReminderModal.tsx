import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, LogIn } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { Button } from '../ui/primitives/Button';
import { useAuthStore } from './store';
import { AuthModal } from './AuthModal';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useOnboardingStore } from '../onboarding';
import { useTutorialIntroStore } from '../tutorial/introStore';
import { useTutorialStore } from '../tutorial/store';

// Signed-out "your projects are at risk" reminder. When accounts are enabled and a REAL project (never
// the tutorial / onboarding example) opens, it nudges the user: their work lives only in this browser -
// sign in to save to the cloud, or download a copy. Shows on the first open, then every 2 opens, until
// "Don't remind me again". Counters persist in localStorage.

const KEY = 'ffx-save-reminder';
interface Store { opens: number; dontRemind: boolean }
function read(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); return { opens: o.opens ?? 0, dontRemind: !!o.dontRemind }; } } catch { /* ignore */ }
  return { opens: 0, dontRemind: false };
}
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export function SaveReminderModal() {
  const enabled = useAuthStore((s) => s.enabled);
  const status = useAuthStore((s) => s.status);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const exportProject = useProjectStore((s) => s.exportProject);
  const onboardingActive = useOnboardingStore((s) => s.active);
  const introPending = useTutorialIntroStore((s) => s.pending);
  const tourActive = useTutorialStore((s) => s.active);

  const [show, setShow] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const handled = useRef<string | null>(null);

  const isTutorial = onboardingActive || introPending || tourActive;

  useEffect(() => {
    if (!enabled || status !== 'signed-out' || !activeProjectId) return;
    if (handled.current === activeProjectId) return;
    // The tutorial/onboarding example project is never counted or nagged.
    if (isTutorial) { handled.current = activeProjectId; return; }
    handled.current = activeProjectId;
    const s = read();
    if (s.dontRemind) return;
    const opens = s.opens + 1;
    write({ opens, dontRemind: false });
    if (opens % 2 === 1) setShow(true); // first open (1), then every 2 opens (3, 5, ...)
  }, [enabled, status, activeProjectId, isTutorial]);

  if (!show) {
    return showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null;
  }

  const download = () => { if (activeProjectId) void exportProject(activeProjectId); };
  const dontRemind = () => { const s = read(); write({ opens: s.opens, dontRemind: true }); setShow(false); };

  return (
    <Modal onClose={() => setShow(false)} size="sm" icon={<AlertTriangle size={16} className="text-amber-400" />} title="Your projects are at risk">
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-slate-300">
          You are not signed in, so this project is saved only in this browser. If you clear your cache
          or switch devices, it will be lost. Sign in to save it to the cloud, or download a copy to keep
          it safe.
        </p>
        <button
          onClick={() => { setShow(false); setShowAuth(true); }}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-yellow-400 to-orange-500 py-2 text-[12px] font-bold text-black shadow transition-[filter] hover:brightness-110"
        >
          <LogIn size={14} /> Sign in to save to the cloud
        </button>
        <div className="flex items-center justify-between gap-2">
          <button onClick={download} className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/5">
            <Download size={13} /> Download project
          </button>
          <div className="flex items-center gap-3">
            <button onClick={dontRemind} className="text-[10.5px] text-slate-500 transition-colors hover:text-slate-300">Don&apos;t remind me again</button>
            <Button variant="secondary" size="comfortable" onClick={() => setShow(false)}>Keep working</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
