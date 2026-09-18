// The manual Full-editor tour: a fixed sequence of spotlight + prompt steps the user clicks through
// after switching to the Full editor (the example forest scene stays put - nothing is rebuilt). Every
// 'next' step advances on the Next button; the single 'select' step advances when the user selects a
// layer on the canvas. It never advances on its own.

export interface TourStep {
  id: string;
  /** data-tutorial-id target for the spotlight (or 'canvas'). */
  spotlight: string;
  text: string;
  /** 'next' = advance on the Next button; 'select' = advance when the user selects a layer. */
  advance: 'next' | 'select';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'canvas',
    spotlight: 'canvas',
    advance: 'next',
    text: 'This is where you can see the video you are building.',
  },
  {
    id: 'timeline',
    spotlight: 'timeline',
    advance: 'next',
    text: 'Here you can see all layers in chronological order (horizontally) and in view order (vertically). The layers on TOP have priority on the canvas.',
  },
  {
    id: 'select',
    spotlight: 'canvas',
    advance: 'select',
    text: 'Click something to select it.',
  },
  {
    id: 'inspector',
    spotlight: 'inspector',
    advance: 'next',
    text: 'Here is where you can edit EVERYTHING of a selected object. To make things easier for you, under each tab there is a tutorial button to understand the app step by step.',
  },
  {
    id: 'media',
    spotlight: 'media-pool',
    advance: 'next',
    text: "Here is where you will manage all of your assets, organized by type (video, audio, images). Assets are PER PROJECT, unless you save them in the SAVED tab.",
  },
  {
    id: 'topbar',
    spotlight: 'top-bar',
    advance: 'next',
    text: 'This is your control panel for the project. You will get used to it once you have a little more experience.',
  },
  {
    id: 'export',
    spotlight: 'export',
    advance: 'next',
    text: 'This is the most important button of all: the export. Now create something beautiful, export it, and show everyone what you can do with FlashFX.',
  },
];
