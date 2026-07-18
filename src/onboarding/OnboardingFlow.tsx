import { useState, useEffect, useRef, useCallback } from 'react';
import { useOnboardingStore } from './store';
import { Monitor, Smartphone, MousePointer2, Square, Upload, Check, ArrowRight, MousePointerClick } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ShaderAnimation } from '../ui/components/ShaderAnimation';

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function rgb01ToHex(c: [number, number, number]): string {
  const r = Math.round(c[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(c[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(c[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function OnboardingFlow() {
  const active = useOnboardingStore((s) => s.active);
  const step = useOnboardingStore((s) => s.step);
  const skip = useOnboardingStore((s) => s.skip);

  if (!active) return null;

  const showSkipButton = step !== 'welcome' && step !== 'askOnboarding';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-8">
        {step === 'welcome' && <WelcomeStep />}
        {step === 'askOnboarding' && <AskOnboardingStep />}
        {step === 'letsStart' && <LetsStartStep />}
        {step === 'bgColor' && <BgColorStep />}
        {step === 'shapeMode' && <ShapeModeStep />}
        {step === 'brandAssets' && <BrandAssetsStep />}
        {step === 'contentType' && <ContentTypeStep />}
        {step === 'tutorial' && <TutorialStep />}
      </div>
      {showSkipButton && (
        <button
          onClick={skip}
          className="absolute bottom-5 right-5 z-20 text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded hover:bg-white/5"
        >
          Skip onboarding
        </button>
      )}
    </div>
  );
}

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <ShaderAnimation />
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}

function TypewriterText({ text, className, onComplete, duration = 2500 }: { text: string; className?: string; onComplete?: () => void; duration?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const intervalMs = Math.max(15, Math.floor(duration / text.length));
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [text, duration]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="animate-pulse">|</span>}
    </span>
  );
}

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} ${className}`}>
      {children}
    </div>
  );
}

function OnboardingButton({ children, onClick, variant = 'primary', className = '' }: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const base = 'rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer';
  const variants = {
    primary: 'bg-[#f7b500] text-[#0a1628] hover:bg-[#ffc83d] shadow-lg shadow-[#f7b500]/20 hover:shadow-[#f7b500]/30 hover:scale-[1.03]',
    secondary: 'bg-[#1a2a42] text-slate-200 hover:bg-[#243554] border border-[#2a3a50]',
    ghost: 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
  };

  if (variant === 'primary') {
    return (
      <button onClick={onClick} className={`group flex items-center gap-2 px-6 py-2.5 ${base} ${variants[variant]} ${className}`}>
        <span>{children}</span>
        <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
      </button>
    );
  }

  return (
    <button onClick={onClick} className={`px-6 py-2.5 ${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function WelcomeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const [typewriterDone, setTypewriterDone] = useState(false);

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-4xl md:text-5xl font-light text-white tracking-tight">
        <TypewriterText text="Welcome to FlashFX" onComplete={() => setTypewriterDone(true)} />
      </h1>
      {typewriterDone && (
        <FadeIn delay={400}>
          <OnboardingButton onClick={() => setStep('askOnboarding')} className="mt-12">
            Next
          </OnboardingButton>
        </FadeIn>
      )}
    </div>
  );
}

function AskOnboardingStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const skip = useOnboardingStore((s) => s.skip);
  const [subtitleDone, setSubtitleDone] = useState(false);
  const [hintDone, setHintDone] = useState(false);

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-4xl md:text-5xl font-light text-white tracking-tight">
        Welcome to FlashFX
      </h1>
      <p className="text-xl text-slate-200 mt-6">
        <TypewriterText text="Do you want to start onboarding?" duration={1800} onComplete={() => setSubtitleDone(true)} />
      </p>
      {subtitleDone && (
        <>
          <FadeIn delay={200}>
            <p className="text-sm text-slate-500 mt-3">
              <TypewriterText text="(will make you have everything set up to edit faster)" duration={1500} onComplete={() => setHintDone(true)} />
            </p>
          </FadeIn>
          {hintDone && (
            <FadeIn delay={200} className="flex items-center gap-4 mt-10">
              <OnboardingButton onClick={() => setStep('letsStart')} variant="primary">
                Yes, show me
              </OnboardingButton>
              <OnboardingButton onClick={skip} variant="ghost">
                No, skip
              </OnboardingButton>
            </FadeIn>
          )}
        </>
      )}
    </div>
  );
}

function LetsStartStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const [typewriterDone, setTypewriterDone] = useState(false);

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-3xl font-light text-white">
        <TypewriterText text="Let's start with your defaults." duration={2000} onComplete={() => setTypewriterDone(true)} />
      </h2>
      {typewriterDone && (
        <FadeIn delay={300}>
          <div className="mt-10">
            <OnboardingButton onClick={() => setStep('bgColor')}>Continue</OnboardingButton>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function BgColorStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const bgColor = useOnboardingStore((s) => s.bgColor);
  const setBgColor = useOnboardingStore((s) => s.setBgColor);
  const [hex, setHex] = useState(rgb01ToHex(bgColor));
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [titleDone, setTitleDone] = useState(false);

  const handleChange = (newHex: string) => {
    setHex(newHex);
    setBgColor(hexToRgb01(newHex));
  };

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-light text-white mb-8">
        <TypewriterText text="Choose your default background color" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <FadeIn delay={200}>
          <div className="relative flex items-center gap-6">
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1.5">
                <MousePointerClick size={12} className="text-slate-500" />
                <TypewriterText text="click to change" duration={1000} />
              </p>
              <div className="text-[10px] text-slate-600 font-mono">{hex.toUpperCase()}</div>
            </div>
            <button
              onClick={() => colorInputRef.current?.click()}
              className="w-80 h-80 rounded-2xl border-2 border-[#2a3a50]/50 shadow-2xl cursor-pointer transition-all duration-300 hover:border-[#f7b500]/40 hover:shadow-[0_0_40px_rgba(247,181,0,0.1)] relative overflow-hidden"
              style={{ backgroundColor: hex }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-32 h-20 border border-white/30 rounded" />
              </div>
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={hex}
              onChange={(e) => handleChange(e.target.value)}
              className="absolute opacity-0 pointer-events-none"
            />
          </div>
          <FadeIn delay={400} className="flex items-center gap-4 mt-10">
            <OnboardingButton onClick={() => setStep('shapeMode')} variant="primary">Done</OnboardingButton>
            <OnboardingButton onClick={() => { setBgColor([0.08, 0.09, 0.12]); setStep('shapeMode'); }} variant="ghost">
              Keep Default
            </OnboardingButton>
          </FadeIn>
        </FadeIn>
      )}
    </div>
  );
}

function ShapeModeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const shapeMode = useOnboardingStore((s) => s.shapeMode);
  const setShapeMode = useOnboardingStore((s) => s.setShapeMode);
  const [titleDone, setTitleDone] = useState(false);

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-light text-white mb-2">
        <TypewriterText text="How would you like to create shapes?" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <>
          <FadeIn>
            <p className="text-sm text-slate-400 mb-8">
              <TypewriterText text="Choose your preferred shape creation method." duration={1500} />
            </p>
          </FadeIn>
          <FadeIn delay={300} className="flex items-center gap-8">
            <ShapeModeCard
              selected={shapeMode === 'fast'}
              onClick={() => setShapeMode('fast')}
              title="Fast Creation"
              desc="Click a tool and the shape appears instantly at a default size."
              mode="fast"
            />
            <ShapeModeCard
              selected={shapeMode === 'drag'}
              onClick={() => setShapeMode('drag')}
              title="Drag to Create"
              desc="Click and drag on the canvas to define the shape's size."
              mode="drag"
            />
          </FadeIn>
          <FadeIn delay={500} className="mt-8">
            <OnboardingButton
              onClick={() => setStep('brandAssets')}
              variant="primary"
              className={shapeMode ? '' : 'opacity-40 pointer-events-none'}
            >
              Continue
            </OnboardingButton>
          </FadeIn>
        </>
      )}
    </div>
  );
}

function ShapeModeCard({ selected, onClick, title, desc, mode }: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  mode: 'fast' | 'drag';
}) {
  return (
    <button
      onClick={onClick}
      className={`w-72 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer overflow-hidden ${
        selected
          ? 'border-[#f7b500] bg-[#f7b500]/5 shadow-lg shadow-[#f7b500]/10'
          : 'border-[#1a2a42] bg-[#0a1628]/80 hover:border-[#2a3a50] hover:bg-[#0e1c32]'
      }`}
    >
      {/* Two 16:9 video placeholders */}
      <div className="p-4 pb-2">
        <div className="flex gap-2">
          <div className="flex-1 aspect-video rounded-lg bg-[#0e1c32] border border-[#1a2a42] flex items-center justify-center">
            {mode === 'fast' ? (
              <MousePointer2 size={18} className="text-[#f7b500]/40" />
            ) : (
              <Square size={18} className="text-[#3898ec]/40" />
            )}
          </div>
          <div className="flex-1 aspect-video rounded-lg bg-[#0e1c32] border border-[#1a2a42] flex items-center justify-center">
            {mode === 'fast' ? (
              <MousePointer2 size={18} className="text-[#f7b500]/20" />
            ) : (
              <Square size={18} className="text-[#3898ec]/20" />
            )}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
        {selected && (
          <div className="mt-3 flex items-center gap-1 text-[#f7b500] text-xs font-medium">
            <Check size={12} /> Selected
          </div>
        )}
      </div>
    </button>
  );
}

function BrandAssetsStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const [colors, setColors] = useState<string[]>(['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<{ name: string; url: string }[]>([]);
  const [titleDone, setTitleDone] = useState(false);

  const handleColorClick = (index: number) => {
    setEditingIndex(index);
    setTimeout(() => colorInputRef.current?.click(), 50);
  };

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingIndex === null) return;
    const newHex = e.target.value;
    setColors((prev) => {
      const next = [...prev];
      next[editingIndex] = newHex;
      return next;
    });
  }, [editingIndex]);

  const handleColorCommit = useCallback(async () => {
    if (editingIndex === null) return;
    const hex = colors[editingIndex];
    if (hex !== '#ffffff') {
      try {
        await supabase?.from('brand_colors').insert({ hex, sort_order: editingIndex });
      } catch { /* swallow */ }
    }
    setEditingIndex(null);
  }, [editingIndex, colors]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      setAssets((prev) => [...prev, { name: file.name, url }]);
      try {
        await supabase?.from('brand_assets').insert({
          name: file.name,
          url,
          is_logo: false,
          sort_order: assets.length,
          width: 0,
          height: 0,
        });
      } catch { /* swallow */ }
    }
    setUploading(false);
    e.target.value = '';
  }, [assets.length]);

  return (
    <div className="flex flex-col items-center text-center max-w-xl">
      <h2 className="text-2xl font-light text-white mb-2">
        <TypewriterText text="Set up your brand" duration={1800} onComplete={() => setTitleDone(true)} />
      </h2>

      {titleDone && (
        <>
          <FadeIn>
            <p className="text-sm text-slate-400 mb-10">
              <TypewriterText text="Click a circle to set your brand colors. Import logos and assets below." duration={2000} />
            </p>
          </FadeIn>

          {/* Colors: 5 clickable circles */}
          <FadeIn delay={300} className="w-full">
            <div className="flex items-center justify-center gap-5 mb-10">
              {colors.map((c, i) => (
                <button
                  key={i}
                  onClick={() => handleColorClick(i)}
                  className={`w-14 h-14 rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-110 hover:shadow-lg ${
                    c === '#ffffff'
                      ? 'border-[#2a3a50] hover:border-slate-400'
                      : 'border-transparent shadow-md'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c === '#ffffff' ? 'Click to set color' : c.toUpperCase()}
                />
              ))}
            </div>
            <input
              ref={colorInputRef}
              type="color"
              value={editingIndex !== null ? colors[editingIndex] : '#ffffff'}
              onChange={handleColorChange}
              onBlur={handleColorCommit}
              className="absolute opacity-0 pointer-events-none"
            />
          </FadeIn>

          {/* Assets: import button + row */}
          <FadeIn delay={500} className="w-full">
            <div className="flex flex-col items-center">
              {assets.length > 0 && (
                <div className="flex items-center gap-3 mb-5 flex-wrap justify-center">
                  {assets.map((a, i) => (
                    <div key={i} className="w-14 h-14 rounded-lg border border-[#2a3a50] overflow-hidden bg-[#0e1c32] shadow-md">
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium text-slate-200 bg-[#1a2a42]/80 rounded-lg hover:bg-[#243554] transition-all duration-200 border border-[#2a3a50] hover:border-[#3a4a60] hover:scale-[1.02]"
              >
                <Upload size={14} />
                {uploading ? 'Importing...' : 'Import Assets'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </FadeIn>

          <FadeIn delay={700} className="flex items-center gap-4 mt-10">
            <OnboardingButton onClick={() => setStep('contentType')} variant="primary">Done</OnboardingButton>
            <OnboardingButton onClick={() => setStep('contentType')} variant="ghost">Not now</OnboardingButton>
          </FadeIn>
        </>
      )}
    </div>
  );
}

function ContentTypeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);
  const contentType = useOnboardingStore((s) => s.contentType);
  const setContentType = useOnboardingStore((s) => s.setContentType);
  const [titleDone, setTitleDone] = useState(false);

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-light text-white mb-2">
        <TypewriterText text="What will you create the most?" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <>
          <FadeIn>
            <p className="text-sm text-slate-400 mb-8">
              <TypewriterText text="This sets your default project format." duration={1500} />
            </p>
          </FadeIn>
          <FadeIn delay={300} className="flex items-center gap-6">
            <ContentCard
              selected={contentType === 'long'}
              onClick={() => setContentType('long')}
              icon={<Monitor size={32} className="text-[#3898ec]" />}
              title="Long Form Content"
              desc="Horizontal (16:9) - YouTube, presentations, ads"
              aspect="landscape"
            />
            <ContentCard
              selected={contentType === 'short'}
              onClick={() => setContentType('short')}
              icon={<Smartphone size={32} className="text-[#f7b500]" />}
              title="Short Form Content"
              desc="Vertical (9:16) - Reels, TikTok, Shorts"
              aspect="portrait"
            />
          </FadeIn>
          <FadeIn delay={500} className="mt-8">
            <OnboardingButton
              onClick={() => setStep('tutorial')}
              variant="primary"
              className={contentType ? '' : 'opacity-40 pointer-events-none'}
            >
              Continue
            </OnboardingButton>
          </FadeIn>
        </>
      )}
    </div>
  );
}

function ContentCard({ selected, onClick, icon, title, desc, aspect }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  aspect: 'landscape' | 'portrait';
}) {
  return (
    <button
      onClick={onClick}
      className={`w-56 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer overflow-hidden ${
        selected
          ? 'border-[#f7b500] bg-[#f7b500]/5 shadow-lg shadow-[#f7b500]/10'
          : 'border-[#1a2a42] bg-[#0a1628]/80 hover:border-[#2a3a50] hover:bg-[#0e1c32]'
      }`}
    >
      <div className={`w-full bg-[#0e1c32] flex items-center justify-center ${aspect === 'landscape' ? 'h-28' : 'h-36'}`}>
        <div className={`border border-[#2a3a50] rounded flex items-center justify-center ${
          aspect === 'landscape' ? 'w-24 h-14' : 'w-14 h-24'
        }`} style={{ backgroundColor: 'rgba(10, 22, 40, 0.8)' }}>
          {icon}
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
        {selected && (
          <div className="mt-2 flex items-center gap-1 text-[#f7b500] text-xs font-medium">
            <Check size={12} /> Selected
          </div>
        )}
      </div>
    </button>
  );
}

function TutorialStep() {
  const complete = useOnboardingStore((s) => s.complete);
  const setWantsTutorial = useOnboardingStore((s) => s.setWantsTutorial);
  const [titleDone, setTitleDone] = useState(false);
  const [subtitleDone, setSubtitleDone] = useState(false);

  const handleYes = () => {
    setWantsTutorial(true);
    complete();
  };

  const handleNo = () => {
    setWantsTutorial(false);
    complete();
  };

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="text-2xl font-light text-white mb-3">
        <TypewriterText text="Would you like to see a tutorial project?" duration={2200} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <FadeIn>
          <p className="text-sm text-[#f7b500] font-medium mb-8">
            <TypewriterText text="EXTREMELY recommended if you never used the software" duration={1800} onComplete={() => setSubtitleDone(true)} />
          </p>
        </FadeIn>
      )}
      {subtitleDone && (
        <FadeIn delay={200} className="flex items-center gap-4">
          <OnboardingButton onClick={handleYes} variant="primary">Yes</OnboardingButton>
          <OnboardingButton onClick={handleNo} variant="secondary">No</OnboardingButton>
        </FadeIn>
      )}
    </div>
  );
}
