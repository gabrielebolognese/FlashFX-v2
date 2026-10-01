// Flash's expression set, kept in its own module so the component files stay fast-refresh-friendly
// (only-export-components). Add a feeling here and handle it in FlashAvatar's pose().

export type FlashExpression =
  | 'idle' | 'wave' | 'thumbsUp' | 'point' | 'thinking' | 'working' | 'celebrate'
  | 'love' | 'wow' | 'cool' | 'shrug' | 'facepalm' | 'sleep' | 'hype';

export const FLASH_EXPRESSIONS: FlashExpression[] = [
  'idle', 'wave', 'thumbsUp', 'point', 'thinking', 'working', 'celebrate',
  'love', 'wow', 'cool', 'shrug', 'facepalm', 'sleep', 'hype',
];
