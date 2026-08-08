// Shown while a `?template=` deep link creates + seeds its project, so the user never sees the
// dashboard flash before landing in the editor.
export function TemplateSplash() {
  return (
    <div className="h-screen w-screen bg-[#0a0f16] text-slate-200 flex flex-col items-center justify-center gap-4">
      <div className="w-6 h-6 border-[1.5px] border-[#f7b500]/30 border-t-[#f7b500] rounded-full animate-spin" />
      <div className="text-[13px] text-slate-400">Setting up your scene…</div>
    </div>
  );
}
