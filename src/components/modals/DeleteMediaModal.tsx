import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface DeleteMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  count: number;
  hasUsedMedia: boolean;
  onConfirm: () => void;
}

const M = {
  bg:     '#1a2840',
  border: '#2d4468',
  text:   '#e2e8f0',
  muted:  '#607898',
  label:  '#94a3b8',
  input:  '#0f1e32',
  warn:   '#fbbf24',
  warnBg: 'rgba(251,191,36,0.07)',
  warnBd: 'rgba(251,191,36,0.25)',
  red:    '#ef4444',
  redBg:  'rgba(239,68,68,0.10)',
  redBd:  'rgba(239,68,68,0.40)',
};

const DeleteMediaModal: React.FC<DeleteMediaModalProps> = ({
  isOpen,
  onClose,
  count,
  hasUsedMedia,
  onConfirm,
}) => {
  const [hovConfirm, setHovConfirm] = useState(false);
  const [hovCancel,  setHovCancel]  = useState(false);

  if (!isOpen) return null;

  const label = count === 1
    ? 'Are you sure you want to delete this media from the media pool?'
    : `Are you sure you want to delete ${count} items from the media pool?`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: M.bg, border: `1px solid ${M.border}`, width: '100%', maxWidth: 380 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${M.border}` }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: M.text, letterSpacing: 0.2 }}>Delete Media</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', color: M.muted }}
            onMouseEnter={e => (e.currentTarget.style.color = M.text)}
            onMouseLeave={e => (e.currentTarget.style.color = M.muted)}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {hasUsedMedia && (
            <div style={{ background: M.warnBg, border: `1px solid ${M.warnBd}`, padding: '9px 11px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle style={{ width: 13, height: 13, color: M.warn, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: M.warn, lineHeight: 1.5 }}>
                {count === 1
                  ? 'This media is currently used in your project. Removing it may affect your canvas or timeline.'
                  : 'Some of these items are currently used in your project. Removing them may affect your canvas or timeline.'}
              </span>
            </div>
          )}

          <div style={{ fontSize: 13, color: M.label, lineHeight: 1.55 }}>{label}</div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            <button
              onClick={onClose}
              onMouseEnter={() => setHovCancel(true)}
              onMouseLeave={() => setHovCancel(false)}
              style={{
                padding: '8px 0',
                background: hovCancel ? 'rgba(255,255,255,0.05)' : M.input,
                border: `1px solid ${M.border}`,
                color: M.label,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              onMouseEnter={() => setHovConfirm(true)}
              onMouseLeave={() => setHovConfirm(false)}
              style={{
                padding: '8px 0',
                background: hovConfirm ? 'rgba(239,68,68,0.18)' : M.redBg,
                border: `1px solid ${M.redBd}`,
                color: M.red,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteMediaModal;
