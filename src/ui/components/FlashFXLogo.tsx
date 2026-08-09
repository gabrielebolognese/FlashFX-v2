// FlashFX brand lockup for the app header — inline SVG mark (amber rounded square + lightning
// bolt) next to the wordmark. Inline (not an <img>) so it stays crisp at any DPI and never
// flashes on load. Mirrors public/flashfx-mark.svg (favicon) and public/og-image.svg.

interface Props {
  /** Mark height in px (the wordmark scales with it). */
  size?: number;
  /** Hide the "FlashFX" wordmark, showing the mark only. */
  markOnly?: boolean;
  className?: string;
}

export function FlashFXLogo({ size = 20, markOnly = false, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`} aria-label="FlashFX">
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true" className="flex-shrink-0">
        <defs>
          <linearGradient id="ffxLogoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc83d" />
            <stop offset="1" stopColor="#f7b500" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ffxLogoGrad)" />
        <polygon points="13 3.5 5 13.5 11 13.5 10 20.5 19 9.5 12.5 9.5" fill="#0a0f16" />
      </svg>
      {!markOnly && (
        <span className="font-bold tracking-tight leading-none" style={{ fontSize: Math.round(size * 0.72) }}>
          <span className="text-slate-100">Flash</span>
          <span className="text-[#f7b500]">FX</span>
        </span>
      )}
    </span>
  );
}
