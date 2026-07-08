import { useState } from 'react';
import { SplineScene } from '@/components/ui/splite';
import { Card } from '@/components/ui/card';
import { Spotlight } from '@/components/ui/spotlight';
import { X, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'flashfx_intro_seen';

function shouldShow(): boolean {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return true;
  }
}

export function IntroPopup() {
  const [visible, setVisible] = useState(shouldShow);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-md animate-[fadeIn_0.3s_ease]">
      <Card className="w-full max-w-5xl h-[70vh] min-h-[400px] bg-black/[0.96] border-[#1a2a42] relative overflow-hidden shadow-2xl shadow-black/80 rounded-2xl">
        <Spotlight
          className="-top-40 left-0 md:left-60 md:-top-20"
          fill="white"
        />

        <button
          onClick={dismiss}
          className="absolute top-4 right-4 z-30 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex h-full">
          <div className="flex-1 p-8 md:p-12 lg:p-14 relative z-10 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-[#f7b500]" />
              <span className="text-xs font-semibold tracking-widest uppercase text-[#f7b500]">
                New Release
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 leading-[1.1]">
              Introducing
              <br />
              <span className="text-[#f7b500] bg-clip-text text-transparent bg-gradient-to-b from-[#f7b500] to-[#d4960a]">FlashFX 3D</span>
            </h1>
            <p className="mt-6 text-neutral-300 max-w-md text-base leading-relaxed font-medium">
              A new dimension for your motion design. Create stunning 3D compositions,
              animate with physics, and bring your ideas to life like never before.
            </p>
            <button
              onClick={dismiss}
              className="mt-8 px-7 py-3.5 bg-[#f7b500] hover:bg-[#ffc83d] text-black text-sm font-bold rounded-lg transition-all duration-200 hover:scale-[1.03] shadow-lg shadow-[#f7b500]/40 w-fit cursor-pointer"
            >
              Get Started
            </button>
          </div>

          <div className="flex-1 relative hidden md:block">
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
