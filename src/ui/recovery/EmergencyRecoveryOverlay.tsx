import { AlertOctagon, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useRecoveryStore } from '../../store/recovery';
import { editorRecovery } from '../../engine/recovery';

// Shown when the rendering engine cannot initialize (e.g. repeated device loss
// or a failed WebGPU init). Guarantees the user always has a recovery path and
// is never trapped in a blank, unrecoverable editor.
export function EmergencyRecoveryOverlay() {
  const initFailed = useRecoveryStore((s) => s.initFailed);
  const lastError = useRecoveryStore((s) => s.lastError);
  const [resetting, setResetting] = useState(false);

  if (!initFailed) return null;

  const handleReset = async () => {
    setResetting(true);
    await editorRecovery.resetEditor();
    setResetting(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#06080d]/95 backdrop-blur-md">
      <div className="w-[460px] text-center px-8 py-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 mx-auto mb-5">
          <AlertOctagon size={26} className="text-red-400" />
        </div>
        <h1 className="text-lg font-semibold text-slate-100 mb-2">
          Rendering system failed to initialize.
        </h1>
        <p className="text-[13px] leading-relaxed text-slate-400 mb-1">
          The editor could not start the GPU rendering engine. Resetting will
          rebuild it from scratch. Your projects and assets are safe.
        </p>
        {lastError && (
          <p className="text-[11px] font-mono text-red-400/70 mb-5 mt-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 break-words">
            {lastError}
          </p>
        )}
        <button
          onClick={handleReset}
          disabled={resetting}
          className="mt-4 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-[#f7b500] text-white hover:bg-[#f7b500] disabled:opacity-60 inline-flex items-center gap-2"
        >
          <RotateCcw size={15} className={resetting ? 'animate-spin' : ''} />
          {resetting ? 'Rebuilding engine...' : 'Reset Editor'}
        </button>
      </div>
    </div>
  );
}
