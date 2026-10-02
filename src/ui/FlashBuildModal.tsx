import { FlashAvatar } from './FlashAvatar';

// The pop-up where Flash asks to take the wheel before an AI build. Shown before a scene is generated
// (see AiChatPanel.send): Flash appears, repeats back what you asked for, and offers to build it.
export function FlashBuildModal({ prompt, onConfirm, onCancel }: { prompt: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-surface-2 border border-hairline rounded-2xl shadow-overlay overflow-hidden">
        <div className="flex items-start gap-3 p-5">
          <div className="shrink-0 -mt-1">
            <FlashAvatar expression="point" height={92} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold text-slate-100 mb-1">Build this?</h3>
            <p className="text-[12px] text-slate-300 leading-relaxed mb-2.5">
              You want me to build this? I will take the wheel for a bit and build it in the editor. Sit back and relax.
            </p>
            <div className="text-[12px] text-slate-200 bg-surface-3 border border-hairline rounded-lg px-3 py-2 mb-3 max-h-24 overflow-auto">
              {prompt}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
              >
                Not yet
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-accent hover:bg-accent-hover text-on-accent transition-colors"
              >
                Let's go
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
