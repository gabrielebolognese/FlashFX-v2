import { FlashFXLogo } from '../../ui/components/FlashFXLogo';

// Full-screen loader shown from the moment a project opens until its scene, assets, and first
// frame have finished loading. Opening a scene does heavy synchronous work (deserialize +
// resolve + the first WebGPU render) that briefly janks the main thread; without this the
// editor mounted looking frozen. The spinner + progress bar are pure CSS transform/opacity
// animations, which run on the compositor thread and keep moving even while JS is blocked.
export function ProjectLoadingSplash() {
  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0f16] text-slate-200 flex flex-col items-center justify-center gap-5">
      <FlashFXLogo size={30} />
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[#f7b500]/25 border-t-[#f7b500] rounded-full animate-spin" />
        <div className="text-[13px] font-medium text-slate-300">Loading project…</div>
      </div>
      {/* Indeterminate progress sliver — opacity/transform only, so it animates through jank. */}
      <div className="w-48 h-1 rounded-full bg-[#141c28] overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-[#f7b500] animate-ffx-loadbar" />
      </div>
    </div>
  );
}
