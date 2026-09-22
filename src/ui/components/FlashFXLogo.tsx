// FlashFX brand lockup - the real app icon (public/android-chrome-192x192.png, the same mark used for
// the favicon / apple-touch-icon / PWA) next to the wordmark. Using the shipped icon keeps one brand
// everywhere (header, login, splash), instead of a separate placeholder mark.

interface Props {
  /** Mark height in px (the wordmark scales with it). */
  size?: number;
  /** Hide the "FlashFX" wordmark, showing the icon only. */
  markOnly?: boolean;
  className?: string;
}

export function FlashFXLogo({ size = 20, markOnly = false, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`} aria-label="FlashFX">
      <img
        src="/android-chrome-192x192.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="flex-shrink-0 rounded-[22%] object-contain"
      />
      {!markOnly && (
        <span className="font-bold tracking-tight leading-none" style={{ fontSize: Math.round(size * 0.72) }}>
          <span className="text-slate-100">Flash</span>
          <span className="text-accent">FX</span>
        </span>
      )}
    </span>
  );
}
