import { GraduationCap, Play } from 'lucide-react';
import { launchTutorial, markTutorialSeen } from './launch';

// First-open hero: shown over the Dashboard when the user has never seen the tutorial and has no
// projects yet. Big CTA that spins up a fresh 16:9 project and starts the self-driving demo.
export function TutorialLaunch({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#070b11]/90 backdrop-blur-sm">
      <div className="max-w-lg w-[92vw] text-center px-8 py-10 rounded-2xl bg-[#0e1c32] border border-[#26405f] shadow-2xl">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f7b500] to-[#e09000] flex items-center justify-center">
          <GraduationCap size={28} className="text-[#0a0f16]" />
        </div>
        <h1 className="text-xl font-semibold text-slate-100">Welcome to FlashFX</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          It’s a big app. Let’s not throw you in the deep end — watch FlashFX build a motion piece
          for you, then take the wheel.
        </p>
        <button
          onClick={() => { void launchTutorial(); }}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold bg-[#f7b500] hover:bg-[#ffc21a] text-[#0e1c32] transition-colors"
        >
          <Play size={16} /> Start the Tutorial
        </button>
        <div className="mt-4">
          <button onClick={() => { markTutorialSeen(); onDismiss(); }} className="text-[12px] text-slate-500 hover:text-slate-300">
            Skip to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
