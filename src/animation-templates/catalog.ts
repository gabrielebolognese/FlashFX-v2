import type { AnimationTemplate, TemplateCategory } from './types';
import { calendarMonth } from './categories/calendar';
import { titleRise, lowerThirdSlide } from './categories/titles';
import { bulletList } from './categories/lists';
import { barChartGrow } from './categories/charts';
import { logoPop } from './categories/logo';

// The animation-template library. Add a template = author a builder in categories/ and list it here.

export const ANIMATION_TEMPLATES: AnimationTemplate[] = [
  calendarMonth,
  titleRise,
  lowerThirdSlide,
  bulletList,
  barChartGrow,
  logoPop,
];

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
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
