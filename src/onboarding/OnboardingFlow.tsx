import { useState, useEffect, useRef, useCallback } from 'react';
import { useOnboardingStore } from './store';
import { Monitor, Smartphone, MousePointer2, Upload, Check, ArrowRight, MousePointerClick, Sparkles } from 'lucide-react';
import { brandColorsDb, brandAssetsDb, libraryId } from '../project-system/storage/libraryDb';
import { invalidateBrandColorCache } from '../ui/components/BrandColorPicker';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useTutorialIntroStore, TUTORIAL_EXAMPLE_FPS, TUTORIAL_EXAMPLE_DURATION_FRAMES } from '../tutorial/introStore';

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
    <div className="fixed inset-0 z-top flex items-center justify-center overflow-hidden bg-surface-sunken">
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
          className="absolute bottom-5 right-5 z-20 text-caption text-tertiary hover:text-secondary transition-colors px-3 py-1.5 rounded hover:bg-white/5"
        >
          Skip onboarding
        </button>
      )}
    </div>
  );
}

// Plain text (the typewriter animation and its shader background were removed). The name +
// onComplete are kept so the steps' progressive reveals still work: onComplete fires once on
// mount, so gated content appears immediately. `duration` is accepted (callers still pass it)
// but ignored.
function TypewriterText({ text, className, onComplete }: { text: string; className?: string; onComplete?: () => void; duration?: number }) {
  const cb = useRef(onComplete);
  cb.current = onComplete;
  useEffect(() => { cb.current?.(); }, []);
  return <span className={className}>{text}</span>;
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
  const base = 'rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer';
  const variants = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover',
    secondary: 'bg-surface-3 text-primary hover:bg-surface-4 border border-hairline',
    ghost: 'text-secondary hover:text-primary hover:bg-white/5',
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
      <h1 className="text-4xl md:text-5xl font-light text-primary tracking-tight">
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
      <h1 className="text-4xl md:text-5xl font-light text-primary tracking-tight">
        Welcome to FlashFX
      </h1>
      <p className="text-xl text-primary mt-6">
        <TypewriterText text="Do you want to start onboarding?" duration={1800} onComplete={() => setSubtitleDone(true)} />
      </p>
      {subtitleDone && (
        <>
          <FadeIn delay={200}>
            <p className="text-sm text-tertiary mt-3">
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
      <h2 className="text-3xl font-light text-primary">
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
      <h2 className="text-2xl font-light text-primary mb-3">
        <TypewriterText text="Choose your default background color" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      <p className="mb-8 max-w-md text-sm leading-relaxed text-secondary">
        This becomes the background of every new project. You can change it anytime while editing.
      </p>
      {titleDone && (
        <FadeIn delay={200}>
          <div className="relative flex items-center gap-6">
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs text-secondary whitespace-nowrap flex items-center gap-1.5">
                <MousePointerClick size={12} className="text-tertiary" />
                <TypewriterText text="click to change" duration={1000} />
              </p>
              <div className="text-[10px] text-muted font-mono">{hex.toUpperCase()}</div>
            </div>
            <button
              onClick={() => colorInputRef.current?.click()}
              className="w-80 h-80 rounded-2xl border-2 border-hairline shadow-overlay cursor-pointer transition-all duration-300 hover:border-accent relative overflow-hidden"
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
      <h2 className="text-2xl font-light text-primary mb-2">
        <TypewriterText text="How would you like to create shapes?" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <>
          <FadeIn>
            <p className="mb-8 max-w-lg text-sm leading-relaxed text-secondary">
              Pick how new shapes are drawn. Fast creation drops a shape at a set size the moment you
              click the tool; drag to create lets you draw it out to any size. You can always change
              this later in the editor.
            </p>
          </FadeIn>
          <FadeIn delay={300} className="flex items-center gap-8">
            <ShapeModeCard
              selected={shapeMode === 'fast'}
              onClick={() => setShapeMode('fast')}
              title="Fast Creation"
              desc="Pick the tool, then click once on the canvas. The shape drops in at a set size."
              mode="fast"
            />
            <ShapeModeCard
              selected={shapeMode === 'drag'}
              onClick={() => setShapeMode('drag')}
              title="Drag to Create"
              desc="Pick the tool, then drag on the canvas to draw the shape at any size you want."
              mode="drag"
              recommended
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

function ShapeModeCard({ selected, onClick, title, desc, mode, recommended }: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  mode: 'fast' | 'drag';
  recommended?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-72 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer overflow-hidden ${
        selected
          ? 'border-accent bg-accent-wash shadow-overlay'
          : 'border-hairline bg-surface-1 hover:border-hairline hover:bg-surface-2'
      }`}
    >
      <ShapeModeDemo mode={mode} />
      <div className="px-4 pb-4 pt-2">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {recommended && (
            <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Recommended
            </span>
          )}
        </div>
        <p className="text-xs text-secondary leading-relaxed">{desc}</p>
        {selected && (
          <div className="mt-3 flex items-center gap-1 text-accent text-xs font-medium">
            <Check size={12} /> Selected
          </div>
        )}
      </div>
    </button>
  );
}

// A looping mini-editor demo of each shape-creation mode.
// fast: the cursor clicks the rectangle tool and a rectangle appears.
// drag: the cursor presses and drags on the canvas and the rectangle grows to fit.
function ShapeModeDemo({ mode }: { mode: 'fast' | 'drag' }) {
  return (
    <div className="relative m-4 mb-2 aspect-video overflow-hidden rounded-lg border border-hairline bg-surface-2">
      {/* mini tool rail; the rectangle tool flashes when "clicked" in fast mode */}
      <div className="absolute inset-y-0 left-0 flex w-[14%] flex-col items-center gap-1 border-r border-hairline bg-surface-3 pt-1.5">
        <div className={`h-3.5 w-3.5 rounded-sm border ${mode === 'fast' ? 'ffx-demo-tool-fast' : 'border-hairline bg-surface-4'}`} />
        <div className="h-3.5 w-3.5 rounded-full border border-hairline bg-surface-4" />
      </div>

      {/* the shape being created */}
      {mode === 'fast' ? (
        <>
          {/* click ripple on the canvas; makes it clear the shape lands where you click */}
          <span
            className="ffx-demo-click-fast absolute rounded-full border border-accent"
            style={{ left: '44%', top: '44%', width: '16px', height: '16px' }}
          />
          <div
            className="ffx-demo-rect-fast absolute rounded-sm border border-accent bg-accent-wash"
            style={{ left: '42%', top: '41%', width: '38px', height: '24px' }}
          />
        </>
      ) : (
        <div
          className="ffx-demo-rect-drag absolute rounded-sm border border-accent bg-accent-wash"
          style={{ left: '26%', top: '28%', width: '48%', height: '52%', transformOrigin: 'top left' }}
        />
      )}

      {/* animated cursor */}
      <MousePointer2
        size={13}
        fill="white"
        className={`absolute text-white ${mode === 'fast' ? 'ffx-demo-cursor-fast' : 'ffx-demo-cursor-drag'}`}
        style={{ left: '46%', top: '44%', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.7))' }}
      />
    </div>
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
        await brandColorsDb.put({ id: libraryId(), hex, sortOrder: editingIndex });
        invalidateBrandColorCache();
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
      let width = 0;
      let height = 0;
      if (file.type.startsWith('image/')) {
        const img = new window.Image();
        img.src = url;
        await new Promise<void>((resolve) => {
          img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; resolve(); };
          img.onerror = () => resolve();
        });
      }
      try {
        await brandAssetsDb.put({
          id: libraryId(),
          name: file.name,
          blob: file,
          isLogo: false,
          sortOrder: assets.length,
          width,
          height,
        });
      } catch { /* swallow */ }
    }
    setUploading(false);
    e.target.value = '';
  }, [assets.length]);

  return (
    <div className="flex flex-col items-center text-center max-w-xl">
      <h2 className="text-2xl font-light text-primary mb-2">
        <TypewriterText text="Set up your brand (optional)" duration={1800} onComplete={() => setTitleDone(true)} />
      </h2>

      {titleDone && (
        <>
          <FadeIn>
            <p className="mb-10 max-w-lg text-sm leading-relaxed text-secondary">
              Your brand kit is a saved set of colours and logos that follows you into every project,
              so you don&apos;t have to re-pick them each time. Set them up now, or skip and add them
              later. You can always change them.
            </p>
          </FadeIn>

          {/* Colors: 5 clickable circles */}
          <FadeIn delay={300} className="w-full">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-primary">Brand colours</h3>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-tertiary">
                Click a circle to pick a colour. These become quick-pick swatches in every colour picker in the editor.
              </p>
            </div>
            <div className="flex items-center justify-center gap-5 mb-10">
              {colors.map((c, i) => (
                <button
                  key={i}
                  onClick={() => handleColorClick(i)}
                  className={`w-14 h-14 rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-110 hover:shadow-lg ${
                    c === '#ffffff'
                      ? 'border-hairline hover:border-slate-400'
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
              <div className="mb-3 text-center">
                <h3 className="text-sm font-semibold text-primary">Logos &amp; assets</h3>
                <p className="mx-auto max-w-md text-xs leading-relaxed text-tertiary">
                  Import images you reuse often, like logos, watermarks and overlays. They&apos;ll be one click away in the media pool.
                </p>
              </div>
              {assets.length > 0 && (
                <div className="flex items-center gap-3 mb-5 flex-wrap justify-center">
                  {assets.map((a, i) => (
                    <div key={i} className="w-14 h-14 rounded-lg border border-hairline overflow-hidden bg-surface-2 shadow-md">
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium text-primary bg-surface-3 rounded-lg hover:bg-surface-4 transition-all duration-200 border border-hairline hover:border-hairline hover:scale-[1.02]"
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
      <h2 className="text-2xl font-light text-primary mb-2">
        <TypewriterText text="What will you create the most?" duration={2000} onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <>
          <FadeIn>
            <p className="mb-8 max-w-lg text-sm leading-relaxed text-secondary">
              This sets your default project format and canvas size. You can still pick either format
              for any individual project later.
            </p>
          </FadeIn>
          <FadeIn delay={300} className="flex items-center gap-6">
            <ContentCard
              selected={contentType === 'long'}
              onClick={() => setContentType('long')}
              icon={<Monitor size={32} className="text-info" />}
              title="Long Form Content"
              desc="Horizontal (16:9) - YouTube, presentations, ads"
              aspect="landscape"
            />
            <ContentCard
              selected={contentType === 'both'}
              onClick={() => setContentType('both')}
              title="Both"
              desc="A mix of both - you'll choose the format for each project."
              aspect="both"
            />
            <ContentCard
              selected={contentType === 'short'}
              onClick={() => setContentType('short')}
              icon={<Smartphone size={32} className="text-accent" />}
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
  icon?: React.ReactNode;
  title: string;
  desc: string;
  aspect: 'landscape' | 'portrait' | 'both';
}) {
  return (
    <button
      onClick={onClick}
      className={`w-56 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer overflow-hidden ${
        selected
          ? 'border-accent bg-accent-wash shadow-overlay'
          : 'border-hairline bg-surface-1 hover:border-hairline hover:bg-surface-2'
      }`}
    >
      <div className={`w-full bg-surface-2 flex items-center justify-center gap-2 ${
        aspect === 'landscape' ? 'h-28' : aspect === 'portrait' ? 'h-36' : 'h-32'
      }`}>
        {aspect === 'both' ? (
          <>
            <div className="flex h-10 w-16 items-center justify-center rounded border border-hairline" style={{ backgroundColor: 'var(--ffx-surface-1)' }}>
              <Monitor size={16} className="text-info" />
            </div>
            <div className="flex h-14 w-9 items-center justify-center rounded border border-hairline" style={{ backgroundColor: 'var(--ffx-surface-1)' }}>
              <Smartphone size={16} className="text-accent" />
            </div>
          </>
        ) : (
          <div className={`border border-hairline rounded flex items-center justify-center ${
            aspect === 'landscape' ? 'w-24 h-14' : 'w-14 h-24'
          }`} style={{ backgroundColor: 'var(--ffx-surface-1)' }}>
            {icon}
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-primary mb-1">{title}</h3>
        <p className="text-xs text-secondary leading-relaxed">{desc}</p>
        {selected && (
          <div className="mt-2 flex items-center gap-1 text-accent text-xs font-medium">
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

  const handleYes = () => {
    setWantsTutorial(true);
    // Signal the editor-mounted <TutorialIntro> to run the example flow, then open a fresh
    // example project (the intro waits ~2s in it, then plays the bar-chart-race choreography).
    useTutorialIntroStore.getState().requestIntro();
    complete();
    void useProjectStore.getState().createAndOpenProject({
      name: 'Tutorial Example',
      width: 1920,
      height: 1080,
      frameRate: TUTORIAL_EXAMPLE_FPS,
      durationFrames: TUTORIAL_EXAMPLE_DURATION_FRAMES,
      videoFormat: 'long',
    });
  };

  const handleNo = () => {
    setWantsTutorial(false);
    complete();
  };

  return (
    <div className="flex max-w-xl flex-col items-center text-center">
      <h2 className="mb-4 text-3xl font-light text-primary md:text-4xl">
        <TypewriterText text="Start with an example project?" onComplete={() => setTitleDone(true)} />
      </h2>
      {titleDone && (
        <>
          <FadeIn>
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1 text-sm font-semibold text-accent">
              <Sparkles size={14} /> Highly recommended
            </div>
            <p className="mb-9 max-w-lg text-base leading-relaxed text-secondary">
              We&apos;ll open a ready-made project so you can look around and see how layers, the
              timeline, and keyframes fit together. If you&apos;ve never used FlashFX, this is the
              fastest way to get comfortable. You learn by poking at something real instead of
              staring at a blank canvas.
            </p>
          </FadeIn>
          <FadeIn delay={200} className="flex items-center gap-4">
            <OnboardingButton onClick={handleYes} variant="primary">Yes, open the example</OnboardingButton>
            <OnboardingButton onClick={handleNo} variant="secondary">Skip for now</OnboardingButton>
          </FadeIn>
        </>
      )}
    </div>
  );
}
