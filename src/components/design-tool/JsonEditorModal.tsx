/**
 * JsonEditorModal — Element JSON editor
 *
 * Syntax colors and typography are driven by CSS custom properties set on the
 * `.ffx-editor-root` element (and on :root as a fallback). These variables are
 * written by CodeEditorDefaultsService whenever the user changes a setting.
 * Do NOT hardcode token colors here — always reference the CSS variable names
 * defined in CodeEditorDefaultsService.CSS_VARS.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DesignElement } from '../../types/design';
import type { ElementAnimation } from '../../animation-engine/types';
import { codeEditorDefaultsService, CSS_VARS } from '../../services/CodeEditorDefaultsService';

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'bracket' | 'punctuation' | 'whitespace';

interface Token {
  type: TokenType;
  value: string;
}

export function tokenizeJson(json: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < json.length) {
    const ch = json[i];

    if (/\s/.test(ch)) {
      let ws = '';
      while (i < json.length && /\s/.test(json[i])) ws += json[i++];
      tokens.push({ type: 'whitespace', value: ws });
      continue;
    }

    if (ch === '"') {
      let str = '"';
      i++;
      while (i < json.length) {
        if (json[i] === '\\' && i + 1 < json.length) {
          str += json[i] + json[i + 1];
          i += 2;
        } else if (json[i] === '"') {
          str += '"';
          i++;
          break;
        } else {
          str += json[i++];
        }
      }
      let j = i;
      while (j < json.length && (json[j] === ' ' || json[j] === '\t')) j++;
      tokens.push({ type: json[j] === ':' ? 'key' : 'string', value: str });
      continue;
    }

    if ('{}[]'.includes(ch)) {
      tokens.push({ type: 'bracket', value: ch });
      i++;
      continue;
    }

    if (ch === ':' || ch === ',') {
      tokens.push({ type: 'punctuation', value: ch });
      i++;
      continue;
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let num = '';
      while (i < json.length && /[-+\d.eE]/.test(json[i])) num += json[i++];
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (json.startsWith('true', i)) { tokens.push({ type: 'boolean', value: 'true' }); i += 4; continue; }
    if (json.startsWith('false', i)) { tokens.push({ type: 'boolean', value: 'false' }); i += 5; continue; }
    if (json.startsWith('null', i)) { tokens.push({ type: 'null', value: 'null' }); i += 4; continue; }

    tokens.push({ type: 'whitespace', value: ch });
    i++;
  }

  return tokens;
}

// Token type → CSS variable name.
// Colors are NEVER hardcoded here — they are set via CSS custom properties
// by CodeEditorDefaultsService and read by the browser at paint time.
const TOKEN_CSS_VAR: Record<TokenType, string | undefined> = {
  key:         `var(${CSS_VARS.tokenKey})`,
  string:      `var(${CSS_VARS.tokenString})`,
  number:      `var(${CSS_VARS.tokenNumber})`,
  boolean:     `var(${CSS_VARS.tokenNumber})`,
  null:        `var(${CSS_VARS.tokenNull})`,
  bracket:     `var(${CSS_VARS.tokenBracket})`,
  punctuation: `var(${CSS_VARS.tokenPunctuation})`,
  whitespace:  undefined,
};

export function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(o).sort()) sorted[key] = sortObjectKeys(o[key]);
    return sorted;
  }
  return obj;
}

const SCROLLBAR_STYLE = `
  .ffx-json-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .ffx-json-scroll::-webkit-scrollbar-track { background: transparent; }
  .ffx-json-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 0; }
  .ffx-json-scroll:hover::-webkit-scrollbar-thumb { background: #30363d; }
`;

interface JsonEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  element: DesignElement | null;
  onSave: (updatedElement: DesignElement) => void;
  elementAnimation?: ElementAnimation | null;
}

const JsonEditorModal: React.FC<JsonEditorModalProps> = ({
  isOpen,
  onClose,
  element,
  onSave,
  elementAnimation,
}) => {
  const [jsonString, setJsonString] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy');
  const rootRef = useRef<HTMLDivElement>(null);

  // Apply CSS variables from settings to this editor's root element
  useEffect(() => {
    if (!rootRef.current) return;
    const s = codeEditorDefaultsService.getDefaults();
    codeEditorDefaultsService.writeVars(rootRef.current, s);
  }, [isOpen]);

  const buildJson = useCallback((el: DesignElement, anim?: ElementAnimation | null): string => {
    const data: Record<string, unknown> = { ...el };
    if (anim) data.keyframes = anim;
    return JSON.stringify(sortObjectKeys(data), null, 2);
  }, []);

  useEffect(() => {
    if (element) {
      const json = buildJson(element, elementAnimation);
      setJsonString(json);
      setEditText(json);
      setEditMode(false);
      setErrorLine(null);
      setErrorMessage('');
    }
  }, [element, elementAnimation, buildJson]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopyLabel('Copied');
      setTimeout(() => setCopyLabel('Copy'), 1500);
    });
  }, [jsonString]);

  const handleEnableEdit = useCallback(() => {
    setEditText(jsonString);
    setEditMode(true);
    setErrorLine(null);
    setErrorMessage('');
  }, [jsonString]);

  const handleCancel = useCallback(() => {
    setEditMode(false);
    setErrorLine(null);
    setErrorMessage('');
  }, []);

  const handleApply = useCallback(() => {
    try {
      const parsed = JSON.parse(editText) as DesignElement;
      if (!parsed.id || !parsed.type) throw new Error('Missing required fields: id, type');
      onSave(parsed);
      setJsonString(editText);
      setEditMode(false);
      setErrorLine(null);
      setErrorMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      setErrorMessage(msg);
      const posMatch = msg.match(/position (\d+)/i) || msg.match(/at position (\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        setErrorLine(editText.slice(0, pos).split('\n').length);
      } else {
        setErrorLine(null);
      }
    }
  }, [editText, onSave]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = editText.slice(0, start) + '  ' + editText.slice(end);
      setEditText(newText);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    if (e.key === 'Escape') handleCancel();
  }, [editText, handleCancel]);

  if (!isOpen) return null;

  const s = codeEditorDefaultsService.getDefaults();
  const FONT_FAMILY = `'${s.fontFamily}', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`;
  const LINE_H = s.lineHeight;
  const FONT_SIZE = s.fontSize;
  const LETTER_SPACING = s.letterSpacing;
  const SHOW_GUTTER = s.showLineNumbers;
  const WORD_WRAP = s.wordWrap;
  const HIGHLIGHT_ACTIVE = s.highlightActiveLine;

  const displayLines = (editMode ? editText : jsonString).split('\n');
  const contentHeight = displayLines.length * LINE_H;
  const tokens = !editMode ? tokenizeJson(jsonString) : [];

  const btnBase: React.CSSProperties = {
    padding: '3px 8px',
    background: 'transparent',
    border: `1px solid var(${CSS_VARS.gutterBorder})`,
    color: `var(${CSS_VARS.tokenDefault})`,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    borderRadius: 0,
    flexShrink: 0,
    transition: 'border-color 0.15s',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{SCROLLBAR_STYLE}</style>
      <div
        ref={rootRef}
        className="ffx-editor-root"
        style={{
          width: 'min(90vw, 920px)',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: `var(${CSS_VARS.editorBg})`,
          border: `1px solid var(${CSS_VARS.gutterBorder})`,
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          borderBottom: `1px solid var(${CSS_VARS.gutterBorder})`,
          background: `var(${CSS_VARS.gutterBg})`,
          flexShrink: 0,
          gap: 8,
        }}>
          <span style={{
            color: `var(${CSS_VARS.tokenDefault})`,
            fontSize: 11,
            fontFamily: FONT_FAMILY,
            opacity: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {element ? `Element JSON  —  ${element.name}  (${element.type})` : 'Element JSON'}
          </span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            {!editMode ? (
              <button onClick={handleEnableEdit} style={btnBase}>Edit</button>
            ) : (
              <>
                <button onClick={handleCancel} style={btnBase}>Cancel</button>
                <button onClick={handleApply} style={{ ...btnBase, color: `var(${CSS_VARS.tokenKey})`, borderColor: `color-mix(in srgb, var(${CSS_VARS.tokenKey}) 30%, transparent)` }}>Apply</button>
              </>
            )}
            <button onClick={handleCopy} style={btnBase}>{copyLabel}</button>
            <button onClick={onClose} style={{ ...btnBase, color: `var(${CSS_VARS.lineNumberColor})`, borderColor: 'transparent' }}>Close</button>
          </div>
        </div>

        {!element ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: `var(${CSS_VARS.lineNumberColor})`,
            fontSize: FONT_SIZE,
            fontFamily: FONT_FAMILY,
          }}>
            Select an element to view its JSON
          </div>
        ) : (
          <div
            className="ffx-json-scroll"
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              background: `var(${CSS_VARS.editorBg})`,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', minWidth: 0, width: '100%' }}>
              {SHOW_GUTTER && (
                <div style={{
                  position: 'sticky',
                  left: 0,
                  width: 40,
                  flexShrink: 0,
                  background: `var(${CSS_VARS.gutterBg})`,
                  borderRight: `1px solid var(${CSS_VARS.gutterBorder})`,
                  zIndex: 1,
                  userSelect: 'none',
                }}>
                  {displayLines.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: LINE_H,
                        lineHeight: `${LINE_H}px`,
                        textAlign: 'right',
                        paddingRight: 8,
                        fontSize: 11,
                        fontFamily: FONT_FAMILY,
                        color: errorLine === i + 1 ? `var(${CSS_VARS.errorColor})` : `var(${CSS_VARS.lineNumberColor})`,
                        borderLeft: errorLine === i + 1 ? `2px solid var(${CSS_VARS.errorColor})` : '2px solid transparent',
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ flexGrow: 1, minWidth: 0, height: contentHeight, position: 'relative' }}>
                {editMode ? (
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      padding: `0 12px`,
                      background: `var(${CSS_VARS.editorBg})`,
                      color: `var(${CSS_VARS.tokenDefault})`,
                      fontFamily: FONT_FAMILY,
                      fontSize: FONT_SIZE,
                      lineHeight: `${LINE_H}px`,
                      letterSpacing: `${LETTER_SPACING}px`,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      tabSize: 2,
                      whiteSpace: WORD_WRAP ? 'pre-wrap' : 'pre',
                      overflowWrap: WORD_WRAP ? 'break-word' : 'normal',
                      overflow: 'hidden',
                      boxSizing: 'border-box',
                    }}
                    spellCheck={false}
                  />
                ) : (
                  <pre style={{
                    margin: 0,
                    padding: `0 12px`,
                    fontSize: FONT_SIZE,
                    fontFamily: FONT_FAMILY,
                    lineHeight: `${LINE_H}px`,
                    letterSpacing: `${LETTER_SPACING}px`,
                    color: `var(${CSS_VARS.tokenDefault})`,
                    whiteSpace: WORD_WRAP ? 'pre-wrap' : 'pre',
                    tabSize: 2,
                  }}>
                    {s.syntaxHighlighting
                      ? tokens.map((token, idx) => {
                          const color = TOKEN_CSS_VAR[token.type];
                          return color
                            ? <span key={idx} style={{ color }}>{token.value}</span>
                            : <React.Fragment key={idx}>{token.value}</React.Fragment>;
                        })
                      : jsonString}
                  </pre>
                )}
                {HIGHLIGHT_ACTIVE && !editMode && (
                  <style>{`.ffx-editor-root pre span:hover { background: var(${CSS_VARS.activeLineBg}); }`}</style>
                )}
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div style={{
            padding: '5px 12px',
            background: 'rgba(0,0,0,0.4)',
            borderTop: `1px solid color-mix(in srgb, var(${CSS_VARS.errorColor}) 25%, transparent)`,
            flexShrink: 0,
            color: `var(${CSS_VARS.errorColor})`,
            fontSize: 11,
            fontFamily: FONT_FAMILY,
          }}>
            {errorLine ? `Line ${errorLine}: ` : ''}{errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonEditorModal;
