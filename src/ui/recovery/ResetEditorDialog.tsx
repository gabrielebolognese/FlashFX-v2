import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { useRecoveryStore } from '../../store/recovery';
import { editorRecovery } from '../../engine/recovery';
import { useState } from 'react';

export function ResetEditorDialog() {
  const show = useRecoveryStore((s) => s.showResetDialog);
  const closeResetDialog = useRecoveryStore((s) => s.closeResetDialog);
  const stats = useRecoveryStore((s) => s.stats);
  const [resetting, setResetting] = useState(false);

  if (!show) return null;

  const handleReset = async () => {
    setResetting(true);
    await editorRecovery.resetEditor();
    setResetting(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] rounded-xl bg-[#0e1c32] border border-[#1f2636] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#1a2a42]">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10">
            <RotateCcw size={16} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-100">Reset Editor</h2>
            <p className="text-[11px] text-slate-500">Rebuild the rendering engine</p>
          </div>
          <button
            onClick={closeResetDialog}
            disabled={resetting}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[12.5px] leading-relaxed text-slate-300">
            Reset Editor will clear all temporary caches and rebuild the rendering
            engine. Your projects and assets will not be deleted.
          </p>

          <div className="rounded-lg bg-[#0a1628] border border-[#161c28] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">
              Will be cleared
            </div>
            <ul className="text-[11.5px] text-slate-400 space-y-0.5">
              <li>GPU texture &amp; thumbnail caches ({stats.totalTextures})</li>
              <li>Decoded video frame caches ({stats.cachedFrames})</li>
              <li>Text glyph atlas &amp; render state</li>
              <li>WebGPU device, pipelines &amp; buffers (recreated)</li>
            </ul>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-emerald-400/90">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>Projects, assets, videos, images, audio and preferences are preserved.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#1a2a42] bg-[#0b0e15]">
          <button
            onClick={closeResetDialog}
            disabled={resetting}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-slate-300 hover:bg-white/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60 flex items-center gap-1.5"
          >
            <RotateCcw size={13} className={resetting ? 'animate-spin' : ''} />
            {resetting ? 'Resetting...' : 'Reset Editor'}
          </button>
        </div>
      </div>
    </div>
  );
}
