import type { AnimationTemplate, TemplateCategory } from './types';
import { beachScene, forestScene, nightScene } from './categories/scenes';
import { sunsetScene, rainScene, cityScene, snowScene } from './categories/weather';
import { galaxyScene } from './categories/galaxy';
import { phoneMessages } from './categories/ui';
import { penWriting, clockTick, fireworks } from './categories/fun';
import { rocketLaunch, coffeeSteam, confettiPop, loadingSpinner } from './categories/delight';
import { calendarMonth } from './categories/calendar';
import { titleRise, lowerThirdSlide } from './categories/titles';
import { bulletList } from './categories/lists';
import { barChartGrow } from './categories/charts';
import { logoPop } from './categories/logo';

// The animation-template library. Add a template = author a builder in categories/ and list it here.

export const ANIMATION_TEMPLATES: AnimationTemplate[] = [
  beachScene,
  forestScene,
  nightScene,
  sunsetScene,
  rainScene,
  cityScene,
  snowScene,
  galaxyScene,
  phoneMessages,
  loadingSpinner,
  penWriting,
  clockTick,
  fireworks,
  rocketLaunch,
  coffeeSteam,
  confettiPop,
  calendarMonth,
  titleRise,
  lowerThirdSlide,
  bulletList,
  barChartGrow,
  logoPop,
];

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  scenes: 'Scenes',
  ui: 'UI',
  fun: 'Fun',
  calendar: 'Calendar',
  titles: 'Titles',
  lists: 'Lists',
  charts: 'Charts',
  logo: 'Logo',
};

const BY_ID = new Map(ANIMATION_TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): AnimationTemplate | undefined {
  return BY_ID.get(id);
}
