import type { Canvas } from './request';

// A deliberately VARIED test set — different tones, durations, subject counts, and aspect ratios.
// This is the seed of the eval harness: it exists to show whether the prompt produces consistent
// work or lucky one-offs, so the descriptions are chosen to stress different corners, not as filler.

export interface DirectorTestCase {
  name: string;
  description: string;
  canvas: Canvas;
}

export const DIRECTOR_TEST_CASES: DirectorTestCase[] = [
  // Short, single-idea, brand — should be 1–2 panels, calm/elegant, small palette.
  { name: 'coffee-logo', description: 'logo intro for a specialty coffee roaster', canvas: { width: 1920, height: 1080 } },
  // Punchy, energetic, vertical — fast beat, spring likely, portrait format.
  { name: 'sale-promo', description: 'bold 48-hour flash sale promo for a sneaker drop', canvas: { width: 1080, height: 1920 } },
  // Informational, multi-step — should be 3–4 panels that progress, staggered lists.
  { name: 'how-it-works', description: 'a three-step "how it works" explainer for a budgeting app', canvas: { width: 1920, height: 1080 } },
  // Data / cloner territory — many repeated elements → a cloner, not 40 shapes.
  { name: 'particle-hero', description: 'abstract particle field forming a constellation then a wordmark', canvas: { width: 1920, height: 1080 } },
  // Elegant, slow, square — long beat, restrained palette, minimal motion.
  { name: 'perfume-teaser', description: 'elegant teaser for a luxury perfume launch', canvas: { width: 1080, height: 1080 } },
  // Corporate, neutral — serious tone, no spring, textPrimary contrast matters.
  { name: 'quarterly-update', description: 'corporate quarterly results title card for an earnings video', canvas: { width: 1920, height: 1080 } },
  // Playful, kids — rounded shapes, bright palette, bouncy.
  { name: 'kids-app', description: 'playful splash animation for a kids learning game', canvas: { width: 1080, height: 1920 } },
  // Text-heavy quote — one hero text element, careful contrast, minimal structure.
  { name: 'quote-card', description: 'a single inspirational quote appearing word by word', canvas: { width: 1080, height: 1080 } },
  // Longer sequence — near the 8s edge; tests panel count discipline (not padding).
  { name: 'product-tour', description: 'a 7-second highlight reel of a smart-home thermostat features', canvas: { width: 1920, height: 1080 } },
  // Minimal, technical — sharp shape language, geometric, restrained.
  { name: 'dev-tool', description: 'minimal launch teaser for a developer CLI tool', canvas: { width: 1920, height: 1080 } },
];
