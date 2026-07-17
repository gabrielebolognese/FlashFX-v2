// Keyboard layout as pure data — swapping to ISO or AZERTY means replacing
// this file. The renderer in KeyboardShortcutsSettingsTab stays the same.

export interface KeyDef {
  label: string;
  subLabel?: string;
  code: string;
  // Width multiplier relative to BASE_UNIT (default = 1)
  w?: number;
  // Height multiplier relative to BASE_UNIT (default = 1)
  h?: number;
  isModifier?: boolean;
  isSpecial?: boolean;
}

export type KeyRow = KeyDef[];

// Key that acts as a gap / invisible spacer
const gap = (w = 1): KeyDef => ({ label: '', code: '__gap__', w, isSpecial: true });

// ── Main keyboard ────────────────────────────────────────────────────────────

export const QWERTY_MAIN: KeyRow[] = [
  // Function row
  [
    { label: 'Esc', code: 'Escape', w: 1, isSpecial: true },
    gap(0.5),
    { label: 'F1',  code: 'F1',  w: 1 },
    { label: 'F2',  code: 'F2',  w: 1 },
    { label: 'F3',  code: 'F3',  w: 1 },
    { label: 'F4',  code: 'F4',  w: 1 },
    gap(0.5),
    { label: 'F5',  code: 'F5',  w: 1 },
    { label: 'F6',  code: 'F6',  w: 1 },
    { label: 'F7',  code: 'F7',  w: 1 },
    { label: 'F8',  code: 'F8',  w: 1 },
    gap(0.5),
    { label: 'F9',  code: 'F9',  w: 1 },
    { label: 'F10', code: 'F10', w: 1 },
    { label: 'F11', code: 'F11', w: 1 },
    { label: 'F12', code: 'F12', w: 1 },
  ],
  // Number row
  [
    { label: '`', subLabel: '~', code: 'Backquote' },
    { label: '1', subLabel: '!', code: 'Digit1' },
    { label: '2', subLabel: '@', code: 'Digit2' },
    { label: '3', subLabel: '#', code: 'Digit3' },
    { label: '4', subLabel: '$', code: 'Digit4' },
    { label: '5', subLabel: '%', code: 'Digit5' },
    { label: '6', subLabel: '^', code: 'Digit6' },
    { label: '7', subLabel: '&', code: 'Digit7' },
    { label: '8', subLabel: '*', code: 'Digit8' },
    { label: '9', subLabel: '(', code: 'Digit9' },
    { label: '0', subLabel: ')', code: 'Digit0' },
    { label: '-', subLabel: '_', code: 'Minus' },
    { label: '=', subLabel: '+', code: 'Equal' },
    { label: 'Backspace', code: 'Backspace', w: 2, isSpecial: true },
  ],
  // QWERTY row
  [
    { label: 'Tab',  code: 'Tab',   w: 1.5, isSpecial: true },
    { label: 'Q',    code: 'KeyQ' },
    { label: 'W',    code: 'KeyW' },
    { label: 'E',    code: 'KeyE' },
    { label: 'R',    code: 'KeyR' },
    { label: 'T',    code: 'KeyT' },
    { label: 'Y',    code: 'KeyY' },
    { label: 'U',    code: 'KeyU' },
    { label: 'I',    code: 'KeyI' },
    { label: 'O',    code: 'KeyO' },
    { label: 'P',    code: 'KeyP' },
    { label: '[', subLabel: '{', code: 'BracketLeft' },
    { label: ']', subLabel: '}', code: 'BracketRight' },
    { label: '\\', subLabel: '|', code: 'Backslash', w: 1.5, isSpecial: true },
  ],
  // Home row
  [
    { label: 'Caps Lock', code: 'CapsLock', w: 1.75, isModifier: true },
    { label: 'A', code: 'KeyA' },
    { label: 'S', code: 'KeyS' },
    { label: 'D', code: 'KeyD' },
    { label: 'F', code: 'KeyF' },
    { label: 'G', code: 'KeyG' },
    { label: 'H', code: 'KeyH' },
    { label: 'J', code: 'KeyJ' },
    { label: 'K', code: 'KeyK' },
    { label: 'L', code: 'KeyL' },
    { label: ';', subLabel: ':', code: 'Semicolon' },
    { label: "'", subLabel: '"', code: 'Quote' },
    { label: 'Enter', code: 'Enter', w: 2.25, isSpecial: true },
  ],
  // Shift row
  [
    { label: 'Shift', code: 'ShiftLeft', w: 2.25, isModifier: true },
    { label: 'Z', code: 'KeyZ' },
    { label: 'X', code: 'KeyX' },
    { label: 'C', code: 'KeyC' },
    { label: 'V', code: 'KeyV' },
    { label: 'B', code: 'KeyB' },
    { label: 'N', code: 'KeyN' },
    { label: 'M', code: 'KeyM' },
    { label: ',', subLabel: '<', code: 'Comma' },
    { label: '.', subLabel: '>', code: 'Period' },
    { label: '/', subLabel: '?', code: 'Slash' },
    { label: 'Shift', code: 'ShiftRight', w: 2.75, isModifier: true },
  ],
  // Bottom row
  [
    { label: 'Ctrl',  code: 'ControlLeft',  w: 1.25, isModifier: true },
    { label: 'Win',   code: 'MetaLeft',     w: 1.25, isSpecial: true },
    { label: 'Alt',   code: 'AltLeft',      w: 1.25, isModifier: true },
    { label: 'Space', code: 'Space',        w: 6.25, isSpecial: true },
    { label: 'Alt',   code: 'AltRight',     w: 1.25, isModifier: true },
    { label: 'Win',   code: 'MetaRight',    w: 1.25, isSpecial: true },
    { label: 'Ctrl',  code: 'ControlRight', w: 1.25, isModifier: true },
  ],
];

// ── Navigation cluster ───────────────────────────────────────────────────────

export const NAV_CLUSTER: KeyRow[] = [
  [
    { label: 'Ins',  code: 'Insert',   isSpecial: true },
    { label: 'Home', code: 'Home',     isSpecial: true },
    { label: 'PgUp', code: 'PageUp',   isSpecial: true },
  ],
  [
    { label: 'Del',  code: 'Delete',   isSpecial: true },
    { label: 'End',  code: 'End',      isSpecial: true },
    { label: 'PgDn', code: 'PageDown', isSpecial: true },
  ],
  // empty row spacer
  [gap(3)],
  // Arrow keys — classic inverted-T layout
  [
    gap(1),
    { label: '↑', code: 'ArrowUp', isSpecial: true },
    gap(1),
  ],
  [
    { label: '←', code: 'ArrowLeft',  isSpecial: true },
    { label: '↓', code: 'ArrowDown',  isSpecial: true },
    { label: '→', code: 'ArrowRight', isSpecial: true },
  ],
];

// ── Numpad ───────────────────────────────────────────────────────────────────

export const NUMPAD: KeyRow[] = [
  [
    { label: 'Num', subLabel: 'Lock', code: 'NumLock',      isSpecial: true },
    { label: '/',  code: 'NumpadDivide',   isSpecial: true },
    { label: '*',  code: 'NumpadMultiply', isSpecial: true },
    { label: '-',  code: 'NumpadSubtract', isSpecial: true },
  ],
  [
    { label: '7',  subLabel: 'Home', code: 'Numpad7' },
    { label: '8',  subLabel: '↑',    code: 'Numpad8' },
    { label: '9',  subLabel: 'PgUp', code: 'Numpad9' },
    { label: '+',  code: 'NumpadAdd', h: 2, isSpecial: true },
  ],
  [
    { label: '4',  subLabel: '←', code: 'Numpad4' },
    { label: '5',  code: 'Numpad5' },
    { label: '6',  subLabel: '→', code: 'Numpad6' },
  ],
  [
    { label: '1',  subLabel: 'End',  code: 'Numpad1' },
    { label: '2',  subLabel: '↓',    code: 'Numpad2' },
    { label: '3',  subLabel: 'PgDn', code: 'Numpad3' },
    { label: 'Enter', code: 'NumpadEnter', h: 2, isSpecial: true },
  ],
  [
    { label: '0',  subLabel: 'Ins', code: 'Numpad0', w: 2 },
    { label: '.',  subLabel: 'Del', code: 'NumpadDecimal' },
  ],
];

// Map from KeyboardEvent.code → normalized key string used in ShortcutBinding
export const CODE_TO_KEY: Record<string, string> = {
  Escape: 'Escape',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4',
  F5: 'F5', F6: 'F6', F7: 'F7', F8: 'F8',
  F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  Backquote: '`',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Minus: '-', Equal: '=', Backspace: 'Backspace',
  Tab: 'Tab',
  KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyT: 't',
  KeyY: 'y', KeyU: 'u', KeyI: 'i', KeyO: 'o', KeyP: 'p',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  CapsLock: 'CapsLock',
  KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyG: 'g',
  KeyH: 'h', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
  Semicolon: ';', Quote: "'", Enter: 'Enter',
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  KeyZ: 'z', KeyX: 'x', KeyC: 'c', KeyV: 'v', KeyB: 'b',
  KeyN: 'n', KeyM: 'm', Comma: ',', Period: '.', Slash: '/',
  ControlLeft: 'Control', ControlRight: 'Control',
  MetaLeft: 'Meta', MetaRight: 'Meta',
  AltLeft: 'Alt', AltRight: 'Alt',
  Space: ' ',
  Insert: 'Insert', Home: 'Home', PageUp: 'PageUp',
  Delete: 'Delete', End: 'End', PageDown: 'PageDown',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  NumLock: 'NumLock',
  NumpadDivide: '/', NumpadMultiply: '*', NumpadSubtract: '-',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3',
  Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7',
  Numpad8: '8', Numpad9: '9',
  NumpadAdd: '+', NumpadDecimal: '.', NumpadEnter: 'Enter',
};

// Normalize a ShortcutBinding key to the keyboard code for visual highlighting
export function keyToCode(key: string): string | null {
  const lk = key.toLowerCase();
  for (const [code, k] of Object.entries(CODE_TO_KEY)) {
    if (k.toLowerCase() === lk) return code;
  }
  // Special cases
  if (key === ' ' || key === 'Space') return 'Space';
  if (key === 'Delete') return 'Delete';
  if (key === 'Backspace') return 'Backspace';
  if (key === 'Enter') return 'Enter';
  if (key === 'Escape') return 'Escape';
  if (key === 'ArrowUp') return 'ArrowUp';
  if (key === 'ArrowDown') return 'ArrowDown';
  if (key === 'ArrowLeft') return 'ArrowLeft';
  if (key === 'ArrowRight') return 'ArrowRight';
  return null;
}
