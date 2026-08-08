// Full-screen loader shown while a `?template=` deep link creates its project and warms the WebGPU
// renderer behind it (launchTemplate pre-rolls frames, then lifts this into a smoothly-playing scene).
export function TemplateSplash() {
  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0f16] text-slate-200 flex flex-col items-center justify-center gap-4">
      <div className="w-7 h-7 border-2 border-[#f7b500]/25 border-t-[#f7b500] rounded-full animate-spin" />
      <div className="text-[13px] font-medium text-slate-300">Loading editor…</div>
      <div className="text-[11px] text-slate-500">Warming up your scene</div>
    </div>
  );
}
