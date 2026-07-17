import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Sequence, FRAME_RATE_PRESETS } from '../../types/sequence';
import { othersSettingsService } from '../../services/OthersSettingsService';

interface CreateSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, frameRate: number, duration: number) => void;
  editingSequence?: Sequence | null;
}

const DURATION_PRESETS = [
  { value: 1,  label: '1s'  },
  { value: 2,  label: '2s'  },
  { value: 3,  label: '3s'  },
  { value: 5,  label: '5s'  },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m'  },
];

const M = {
  bg:      '#1a2840',
  border:  '#2d4468',
  text:    '#e2e8f0',
  muted:   '#607898',
  label:   '#94a3b8',
  input:   '#0f1e32',
  accent:  '#e8a020',
  accentBg:'rgba(232,160,32,0.12)',
  accentBd:'rgba(232,160,32,0.55)',
  warn:    '#fbbf24',
  warnBg:  'rgba(251,191,36,0.07)',
  warnBd:  'rgba(251,191,36,0.25)',
  row:     '#162035',
};

const CreateSequenceModal: React.FC<CreateSequenceModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  editingSequence,
}) => {
  const [name,      setName]      = useState('');
  const [frameRate, setFrameRate] = useState(30);
  const [duration,  setDuration]  = useState(5);

  useEffect(() => {
    if (!isOpen) return;
    if (editingSequence) {
      setName(editingSequence.name);
      setFrameRate(editingSequence.frameRate);
      setDuration(editingSequence.duration);
    } else {
      setName('');
      const seqDefaults = othersSettingsService.getSequence();
      setFrameRate(seqDefaults.enabled ? seqDefaults.frameRate : 30);
      setDuration(seqDefaults.enabled ? seqDefaults.duration : 5);
    }
  }, [editingSequence, isOpen]);

  const handleCreate = () => {
    if (canCreate) onCreate(name.trim(), frameRate, duration);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  const handleClose = () => {
    const seqDefaults = othersSettingsService.getSequence();
    setName('');
    setFrameRate(seqDefaults.enabled ? seqDefaults.frameRate : 30);
    setDuration(seqDefaults.enabled ? seqDefaults.duration : 5);
    onClose();
  };

  const totalFrames = Math.ceil(duration * frameRate);
  const canCreate   = !!(name.trim() && frameRate > 0 && frameRate <= 240 && duration > 0 && duration <= 3600);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: M.bg, border: `1px solid ${M.border}`, width: '100%', maxWidth: 420 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${M.border}` }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: M.text, letterSpacing: 0.2 }}>
            {editingSequence ? 'Edit Sequence' : 'Create Sequence'}
          </span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', color: M.muted }}
            onMouseEnter={e => (e.currentTarget.style.color = M.text)}
            onMouseLeave={e => (e.currentTarget.style.color = M.muted)}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name */}
          <div>
            <div style={{ fontSize: 11, color: M.label, marginBottom: 5 }}>Sequence name</div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="My Animation"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: M.input, border: `1px solid ${M.border}`,
                padding: '7px 10px', fontSize: 13, color: M.text,
                outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = M.accentBd)}
              onBlur={e  => (e.currentTarget.style.borderColor = M.border)}
            />
          </div>

          {/* Frame Rate */}
          <div>
            <div style={{ fontSize: 11, color: M.label, marginBottom: 6 }}>Frame rate</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: 8 }}>
              {FRAME_RATE_PRESETS.map(p => {
                const active = frameRate === p.value;
                return (
                  <PresetBtn
                    key={p.value}
                    label={String(p.value)}
                    active={active}
                    onClick={() => setFrameRate(p.value)}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: M.muted, whiteSpace: 'nowrap' }}>Custom fps</div>
              <input
                type="number"
                min={1}
                max={240}
                value={frameRate}
                onChange={e => setFrameRate(Math.max(1, Math.min(240, parseInt(e.target.value) || 1)))}
                style={{
                  flex: 1, background: M.input, border: `1px solid ${M.border}`,
                  padding: '6px 9px', fontSize: 13, color: M.text, outline: 'none',
                  minWidth: 0,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = M.accentBd)}
                onBlur={e  => (e.currentTarget.style.borderColor = M.border)}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <div style={{ fontSize: 11, color: M.label, marginBottom: 6 }}>Duration</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 8 }}>
              {DURATION_PRESETS.map(p => {
                const active = duration === p.value;
                return (
                  <PresetBtn
                    key={p.value}
                    label={p.label}
                    active={active}
                    onClick={() => setDuration(p.value)}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: M.muted, whiteSpace: 'nowrap' }}>Custom seconds</div>
              <input
                type="number"
                min={0.1}
                max={3600}
                step={0.1}
                value={duration}
                onChange={e => setDuration(Math.max(0.1, Math.min(3600, parseFloat(e.target.value) || 0.1)))}
                style={{
                  flex: 1, background: M.input, border: `1px solid ${M.border}`,
                  padding: '6px 9px', fontSize: 13, color: M.text, outline: 'none',
                  minWidth: 0,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = M.accentBd)}
                onBlur={e  => (e.currentTarget.style.borderColor = M.border)}
              />
            </div>
          </div>

          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <InfoCell label="Total frames"    value={totalFrames.toLocaleString()} />
            <InfoCell label="Frame duration"  value={`${(1000 / frameRate).toFixed(2)}ms`} />
            <InfoCell label="Duration"        value={duration >= 60 ? `${Math.floor(duration/60)}m ${(duration%60).toFixed(1)}s` : `${duration}s`} />
            <InfoCell label="Est. render"     value={`~${Math.round((totalFrames * 1920 * 1080 * 3) / 1024 / 1024 * 0.1)}MB`} />
          </div>

          {/* Large frame warning */}
          {totalFrames > 1800 && (
            <div style={{ background: M.warnBg, border: `1px solid ${M.warnBd}`, padding: '9px 11px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle style={{ width: 13, height: 13, color: M.warn, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: M.warn, lineHeight: 1.5 }}>
                Large frame count. Rendering may take longer and use more memory.
              </span>
            </div>
          )}

          {/* Create button */}
          <CreateBtn canCreate={canCreate} label={editingSequence ? 'Update Sequence' : 'Create Sequence'} onClick={handleCreate} />
        </div>
      </div>
    </div>
  );
};

const PresetBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '5px 0',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        background: active ? M.accentBg : hov ? 'rgba(255,255,255,0.04)' : M.input,
        border: `1px solid ${active ? M.accentBd : M.border}`,
        color: active ? M.accent : M.label,
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        letterSpacing: 0.2,
      }}
    >
      {label}
    </button>
  );
};

const InfoCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ background: M.input, border: `1px solid ${M.border}`, padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: 11, color: M.muted }}>{label}</span>
    <span style={{ fontSize: 12, color: M.text, fontFamily: 'monospace' }}>{value}</span>
  </div>
);

const CreateBtn: React.FC<{ canCreate: boolean; label: string; onClick: () => void }> = ({ canCreate, label, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!canCreate}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        padding: '9px 0',
        background: canCreate ? (hov ? 'rgba(232,160,32,0.18)' : M.accentBg) : M.input,
        border: `1px solid ${canCreate ? M.accentBd : M.border}`,
        color: canCreate ? M.accent : M.muted,
        fontSize: 13,
        fontWeight: canCreate ? 600 : 400,
        cursor: canCreate ? 'pointer' : 'not-allowed',
        letterSpacing: 0.3,
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
};

export default CreateSequenceModal;
