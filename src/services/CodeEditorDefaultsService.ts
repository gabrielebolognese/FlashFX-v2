/**
 * CodeEditorDefaultsService
 *
 * Settings panel tab — Tab 2 of 6 planned settings tabs.
 * Stores user preferences for the JSON code editors (element editor + project editor).
 *
 * Persistence: localStorage key `flashfx_codeeditor_defaults`.
 * All changes are saved immediately on update; no Apply button required.
 *
 * CSS variable names are mirrored in JsonEditorModal.tsx and ProjectJSONEditor.tsx.
 * Colors are applied by writing CSS custom properties to each editor's root element —
 * the tokenizer reads var(--ffx-token-*) at paint time, never hardcoded values.
 */

const STORAGE_KEY = 'flashfx_codeeditor_defaults';

// ─── CSS variable names ────────────────────────────────────────────────────────
// These exact names are referenced in the editor components. Do not rename them
// without updating the corresponding usages in JsonEditorModal and ProjectJSONEditor.
export const CSS_VARS = {
  tokenKey:         '--ffx-token-key',
  tokenString:      '--ffx-token-string',
  tokenNumber:      '--ffx-token-number',
  tokenNull:        '--ffx-token-null',
  tokenBracket:     '--ffx-token-bracket',
  tokenPunctuation: '--ffx-token-punctuation',
  tokenDefault:     '--ffx-token-default',
  editorBg:         '--ffx-editor-bg',
  gutterBg:         '--ffx-gutter-bg',
  lineNumberColor:  '--ffx-line-number-color',
  activeLineBg:     '--ffx-active-line-bg',
  gutterBorder:     '--ffx-gutter-border',
  selectionBg:      '--ffx-selection-bg',
  errorColor:       '--ffx-error-color',
  fontSize:         '--ffx-editor-font-size',
  lineHeight:       '--ffx-editor-line-height',
  letterSpacing:    '--ffx-editor-letter-spacing',
} as const;

// ─── Typed Settings Interface ──────────────────────────────────────────────────

export interface CodeEditorSettings {
  // Typography
  /** Font size in px, 8–24. Default: 12 (hardcoded value in JsonEditorModal) */
  fontSize: number;
  /** Monospace font family selected from the existing font stack. Default: 'JetBrains Mono' */
  fontFamily: string;
  /** Line height in px, 14–32. Default: 18 (LINE_H constant in editors) */
  lineHeight: number;
  /** Letter spacing in px, -1–3. Default: 0 */
  letterSpacing: number;

  // Syntax token colors — defaults match TOKEN_COLORS in JsonEditorModal.tsx
  /** Color for object key tokens. Default: '#79b8ff' */
  tokenKeyColor: string;
  /** Color for string value tokens. Default: '#85e89d' */
  tokenStringColor: string;
  /** Color for number and boolean tokens. Default: '#ffab70' */
  tokenNumberColor: string;
  /** Color for null tokens. Default: '#8b949e' */
  tokenNullColor: string;
  /** Color for bracket/brace tokens ({, }, [, ]). Default: '#8b949e' */
  tokenBracketColor: string;
  /** Color for colon and comma tokens. Default: '#8b949e' */
  tokenPunctuationColor: string;
  /** Default text color for untyped content. Default: '#c9d1d9' (TEXT constant) */
  tokenDefaultColor: string;

  // Editor chrome colors — defaults match constants in JsonEditorModal.tsx
  /** Editor background color. Default: '#0d1117' (EDITOR_BG constant) */
  editorBg: string;
  /** Gutter (line number area) background color. Default: '#161b22' (GUTTER_BG constant) */
  gutterBg: string;
  /** Line number text color. Default: '#484f58' (MUTED constant) */
  lineNumberColor: string;
  /** Active line highlight background. Default: '#161b22' */
  activeLineBg: string;
  /** Border between gutter and code area. Default: '#21262d' (GUTTER_BORDER constant) */
  gutterBorderColor: string;
  /** Text selection background color. Default: '#264f78' */
  selectionBg: string;
  /** Error line highlight color. Default: '#f85149' */
  errorColor: string;

  // Behavior toggles
  /** Show line number gutter. Default: true */
  showLineNumbers: boolean;
  /** Wrap long lines. Default: false */
  wordWrap: boolean;
  /** Highlight the active/hovered line. Default: true */
  highlightActiveLine: boolean;
  /** Enable syntax token coloring. Default: true */
  syntaxHighlighting: boolean;
}

// ─── Factory Defaults ──────────────────────────────────────────────────────────
// Every value is sourced directly from the hardcoded constants in JsonEditorModal.tsx
// and ProjectJSONEditor.tsx as read during the audit of those files.

export const CODE_EDITOR_FACTORY_DEFAULTS: CodeEditorSettings = {
  fontSize:               12,
  fontFamily:             'JetBrains Mono',
  lineHeight:             18,
  letterSpacing:          0,

  tokenKeyColor:          '#79b8ff',
  tokenStringColor:       '#85e89d',
  tokenNumberColor:       '#ffab70',
  tokenNullColor:         '#8b949e',
  tokenBracketColor:      '#8b949e',
  tokenPunctuationColor:  '#8b949e',
  tokenDefaultColor:      '#c9d1d9',

  editorBg:               '#0d1117',
  gutterBg:               '#161b22',
  lineNumberColor:        '#484f58',
  activeLineBg:           '#161b22',
  gutterBorderColor:      '#21262d',
  selectionBg:            '#264f78',
  errorColor:             '#f85149',

  showLineNumbers:        true,
  wordWrap:               false,
  highlightActiveLine:    true,
  syntaxHighlighting:     true,
};

// ─── Service Class ─────────────────────────────────────────────────────────────

class CodeEditorDefaultsService {
  /** Returns merged settings: localStorage overrides applied on top of factory defaults. */
  getDefaults(): CodeEditorSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...CODE_EDITOR_FACTORY_DEFAULTS, ...(JSON.parse(raw) as Partial<CodeEditorSettings>) };
      }
    } catch {
      // Corrupt localStorage entry — fall through to factory defaults
    }
    return { ...CODE_EDITOR_FACTORY_DEFAULTS };
  }

  /** Persists a partial patch immediately and writes CSS variables to all editor roots. */
  update(patch: Partial<CodeEditorSettings>): void {
    const current = this.getDefaults();
    const next = { ...current, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage quota exceeded — skip persistence silently
    }
    this.applyCssVars(next);
  }

  /** Clears persisted preferences and resets CSS variables to factory defaults. */
  resetToFactory(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.applyCssVars(CODE_EDITOR_FACTORY_DEFAULTS);
  }

  getFactoryDefaults(): CodeEditorSettings {
    return { ...CODE_EDITOR_FACTORY_DEFAULTS };
  }

  /**
   * Writes all CSS custom properties to every editor root element on the page.
   * Editor components apply these via var(--ffx-token-*) in their inline styles.
   * Call once on app startup and on every settings change.
   */
  applyCssVars(s: CodeEditorSettings): void {
    const roots = document.querySelectorAll<HTMLElement>('.ffx-editor-root');
    roots.forEach(el => this.writeVars(el, s));
    // Also write to :root so editors that open after the call pick up the values
    this.writeVars(document.documentElement, s);
  }

  writeVars(el: HTMLElement, s: CodeEditorSettings): void {
    el.style.setProperty(CSS_VARS.tokenKey,         s.tokenKeyColor);
    el.style.setProperty(CSS_VARS.tokenString,      s.tokenStringColor);
    el.style.setProperty(CSS_VARS.tokenNumber,      s.tokenNumberColor);
    el.style.setProperty(CSS_VARS.tokenNull,        s.tokenNullColor);
    el.style.setProperty(CSS_VARS.tokenBracket,     s.tokenBracketColor);
    el.style.setProperty(CSS_VARS.tokenPunctuation, s.tokenPunctuationColor);
    el.style.setProperty(CSS_VARS.tokenDefault,     s.tokenDefaultColor);
    el.style.setProperty(CSS_VARS.editorBg,         s.editorBg);
    el.style.setProperty(CSS_VARS.gutterBg,         s.gutterBg);
    el.style.setProperty(CSS_VARS.lineNumberColor,  s.lineNumberColor);
    el.style.setProperty(CSS_VARS.activeLineBg,     s.activeLineBg);
    el.style.setProperty(CSS_VARS.gutterBorder,     s.gutterBorderColor);
    el.style.setProperty(CSS_VARS.selectionBg,      s.selectionBg);
    el.style.setProperty(CSS_VARS.errorColor,       s.errorColor);
    el.style.setProperty(CSS_VARS.fontSize,         `${s.fontSize}px`);
    el.style.setProperty(CSS_VARS.lineHeight,       `${s.lineHeight}px`);
    el.style.setProperty(CSS_VARS.letterSpacing,    `${s.letterSpacing}px`);
  }
}

export const codeEditorDefaultsService = new CodeEditorDefaultsService();
