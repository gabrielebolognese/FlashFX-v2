import { SpotlightPosition, TutorialStep } from '../types/tutorial';

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    target: 'toolbar',
    title: 'Toolbar',
    message: 'Use the toolbar to create shapes, text, and lines. Click any tool to add elements to your canvas.',
    position: 'bottom'
  },
  {
    id: 2,
    target: 'image-button',
    title: 'Add Images',
    message: 'Click the + icon to add images - upload from your computer, search online, or generate with AI.',
    position: 'bottom'
  },
  {
    id: 3,
    target: 'layers-panel',
    title: 'Layers Panel',
    message: 'The Layers Panel shows all elements on your canvas. Click to select, drag to reorder layers.',
    position: 'right'
  },
  {
    id: 4,
    target: 'media-tab',
    title: 'Media Tab',
    message: 'Switch to the Media tab to manage all your project images and assets in one place.',
    position: 'right'
  },
  {
    id: 5,
    target: 'properties-panel',
    title: 'Properties Panel',
    message: 'Edit selected shapes here - change colors, sizes, positions, and apply effects.',
    position: 'left'
  },
  {
    id: 6,
    target: 'layout-bar',
    title: 'Layout Bar',
    message: 'Use the Layout Bar to switch between Design, Edit, and Advanced modes, save your project, and access settings. You\'re ready to create!',
    position: 'top'
  }
];

export const TUTORIAL_COMPLETED_KEY = 'flashfx_tutorial_completed';

export function getSpotlightPosition(target: string): SpotlightPosition | null {
  const element = document.querySelector(`[data-tutorial-target="${target}"]`);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const padding = 8;

  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + (padding * 2),
    height: rect.height + (padding * 2),
    borderRadius: 12
  };
}

export function getPanelPosition(
  spotlight: SpotlightPosition,
  position: 'top' | 'bottom' | 'left' | 'right',
  panelWidth: number = 400,
  panelHeight: number = 200
): { top: number; left: number } {
  const gap = 20;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  let top = 0;
  let left = 0;

  switch (position) {
    case 'bottom':
      top = spotlight.top + spotlight.height + gap;
      left = spotlight.left + (spotlight.width / 2) - (panelWidth / 2);
      break;
    case 'top':
      top = spotlight.top - panelHeight - gap;
      left = spotlight.left + (spotlight.width / 2) - (panelWidth / 2);
      break;
    case 'right':
      top = spotlight.top + (spotlight.height / 2) - (panelHeight / 2);
      left = spotlight.left + spotlight.width + gap;
      break;
    case 'left':
      top = spotlight.top + (spotlight.height / 2) - (panelHeight / 2);
      left = spotlight.left - panelWidth - gap;
      break;
  }

  left = Math.max(20, Math.min(left, windowWidth - panelWidth - 20));
  top = Math.max(20, Math.min(top, windowHeight - panelHeight - 20));

  return { top, left };
}

export function scrollElementIntoView(target: string): void {
  const element = document.querySelector(`[data-tutorial-target="${target}"]`);

  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }
}

export function isTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTutorialCompleted(completed: boolean): void {
  try {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, completed.toString());
  } catch (error) {
    console.error('Failed to save tutorial completion status:', error);
  }
}
