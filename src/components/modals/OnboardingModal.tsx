import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const ONBOARDING_SEEN_KEY = 'flashfx_onboarding_v3_seen';

interface PageContent {
  title: string;
  body: React.ReactNode;
  videoUrl: string;
}

const purpleAccent = 'rgba(168, 85, 247, 0.85)';

const FeatureList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="mt-3 space-y-1.5">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
        <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: purpleAccent }} />
        {item}
      </li>
    ))}
  </ul>
);


const PAGES: PageContent[] = [
  {
    title: 'FlashFX exits from MVP stage',
    videoUrl: 'https://www.youtube.com/embed/xnFCDLNqI3w',
    body: (
      <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
        <p>
          FlashFX has moved beyond the MVP stage and is now released as version 1.0 — a fully production-ready motion graphics platform built for creators who demand precision and performance. After months of rigorous testing, iteration, and refinement, the platform has arrived at a state of genuine stability.
        </p>
        <p>
          Core systems are finalized. The rendering pipeline, animation engine, keyframe editor, and export infrastructure have all been hardened for real-world production use. Performance bottlenecks have been eliminated, and the UI has been polished to reflect a product that is ready to ship work, not just prototype it.
        </p>
        <p>
          This is not just a version bump. The transition from MVP to 1.0 represents a fundamental shift in how FlashFX operates — from exploratory validation to confident execution. Every feature now exists with intention, every interaction has been considered, and every system has been built to last.
        </p>
        <FeatureList items={[
          'Stable, production-ready rendering and export pipeline',
          'Finalized animation engine with full keyframe interpolation support',
          'Optimized performance across large and complex projects',
          'UI polished to reflect a complete, intentional product vision',
        ]} />
      </div>
    ),
  },
  {
    title: 'A new way to design',
    videoUrl: 'https://www.youtube.com/embed/xnFCDLNqI3w',
    body: (
      <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
        <p>
          Version 1.0 introduces a fundamentally rethought design workflow, giving you far greater control over how shapes are created, sized, and configured before you even place them on the canvas.
        </p>
        <p>
          A new default shapes system lets you define your own starting dimensions, fill colors, stroke weights, and opacity for every shape type. Instead of placing a generic rectangle and manually adjusting it each time, you set your defaults once and every new shape respects them automatically. This dramatically speeds up repetitive design work and keeps your output consistent across sequences.
        </p>
        <p>
          Precise numeric size controls are now accessible directly in the toolbar, so you can type exact pixel values without needing to drag handles or use the properties panel for basic geometry adjustments.
        </p>
        <FeatureList items={[
          'Per-shape default settings: size, fill, stroke, opacity',
          'Numeric size input directly from the toolbar',
          'Instant shape duplication with inherited defaults',
          'Persistent defaults saved across sessions',
        ]} />
      </div>
    ),
  },
  {
    title: 'Polished premiumness',
    videoUrl: 'https://www.youtube.com/embed/xnFCDLNqI3w',
    body: (
      <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
        <p>
          The entire interface has been redesigned from the ground up to feel more intentional, more refined, and more capable — without sacrificing the speed and clarity that makes FlashFX productive.
        </p>
        <p>
          The layout has been compressed and reorganized to reclaim space for newly introduced systems including 3D, pen tool, and advanced adjustments. Every panel, every toolbar, every modal has been audited and improved to reduce cognitive load and surface the right controls at the right time.
        </p>
        <p>
          The following systems have received dedicated reworks in this release:
        </p>
        <FeatureList items={[
          'Better snapping visualization — real-time guides with distance indicators',
          'Timeline rework — cleaner track layout, improved clip interaction, marker support',
          'Toolbar rework — consolidated tools, smarter grouping, reduced visual noise',
          'Text properties panel rework — unified typography controls with live preview',
        ]} />
      </div>
    ),
  },
  {
    title: 'Draw your imagination',
    videoUrl: 'https://www.youtube.com/embed/xnFCDLNqI3w',
    body: (
      <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
        <p>
          The line and pen tools have been completely rebuilt from scratch. What was previously a simple line-drawing utility is now a full freeform vector drawing system that puts expressive control directly in your hands.
        </p>
        <p>
          The pen tool now supports smooth Bezier curves, anchor point manipulation, and closed path creation, giving you the same vector drawing power you'd expect from a dedicated illustration application — directly inside your animation timeline.
        </p>
        <p>
          Lines support configurable cap styles, dash patterns, and animated stroke draw-on effects, so you can create handwritten-style reveals, technical diagrams, and expressive brush strokes all within the same project.
        </p>
        <FeatureList items={[
          'Rebuilt pen tool with full Bezier curve support',
          'Anchor point editing with individual handle control',
          'Closed path creation and fill support for drawn shapes',
          'Animated stroke draw-on and draw-off effects',
          'Configurable line cap styles, dash patterns, and join types',
          'Pressure-simulated stroke weight variation',
        ]} />
      </div>
    ),
  },
];

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const [page, setPage] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const current = PAGES[page];
  const isLast = page === PAGES.length - 1;
  const isFirst = page === 0;

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    }
    onClose();
  };

  const goNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setPage(p => p + 1);
    }
  };

  const goPrev = () => {
    if (!isFirst) setPage(p => p - 1);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[10002] p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', animation: 'onboardFadeIn 0.25s ease-out' }}
    >
      <style>{`
        @keyframes onboardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes onboardSlideIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes onboardPageIn {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        className="relative flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: '1060px',
          height: '660px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          background: 'linear-gradient(135deg, #0d0d14 0%, #111118 60%, #0a0a10 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.45)',
          boxShadow: '0 0 60px rgba(168, 85, 247, 0.12), 0 24px 80px rgba(0,0,0,0.7)',
          animation: 'onboardSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-2">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-300 hover:bg-white/8 transition-all"
          >
            Skip
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg transition-colors text-gray-600 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          key={page}
          className="flex flex-1 min-h-0"
          style={{ animation: 'onboardPageIn 0.25s ease-out' }}
        >
          <div className="flex flex-col px-9 py-8 flex-1 min-w-0 overflow-y-auto">
            <div className="mb-3">
              <span
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: 'rgba(168, 85, 247, 0.7)' }}
              >
                {page + 1} of {PAGES.length}
              </span>
            </div>

            <h2
              className="font-bold text-white leading-tight mb-5"
              style={{
                fontSize: 'clamp(1.1rem, 1.8vw, 1.55rem)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              {current.title}
            </h2>

            <div className="flex-1">
              {current.body}
            </div>

            <div className="pt-6 flex items-center gap-2 border-t border-white/5 mt-4">
              {!isFirst && (
                <button
                  onClick={goPrev}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/8 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
              )}

              <label className="flex items-center gap-2 cursor-pointer select-none ml-auto mr-4">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={e => setDontShowAgain(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
                />
                <span className="text-xs text-gray-500">Don't show again</span>
              </label>

              <div className="flex items-center gap-3">
                {isLast ? (
                  <button
                    onClick={handleClose}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(124,58,237,0.95) 100%)',
                      boxShadow: '0 0 24px rgba(168,85,247,0.35)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Start designing
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold transition-all text-white"
                    style={{ background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.38)' }}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 flex items-center justify-center py-8 pr-8"
            style={{ width: '38%' }}
          >
            <div
              className="relative overflow-hidden rounded-xl w-full"
              style={{
                aspectRatio: '9/16',
                maxHeight: '100%',
                border: '1px solid rgba(168,85,247,0.28)',
                boxShadow: '0 0 30px rgba(168,85,247,0.07)',
              }}
            >
              <iframe
                src={`${current.videoUrl}?rel=0&modestbranding=1`}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.45), transparent)' }}
        />
      </div>
    </div>
  );
};

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_SEEN_KEY);
}
