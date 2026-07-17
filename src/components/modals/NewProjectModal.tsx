import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, ChevronDown } from 'lucide-react';

interface CanvasSettings {
  width: number;
  height: number;
}

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, canvasSettings: CanvasSettings) => void;
}

const PRESETS = [
  { name: '4K UHD',            width: 3840, height: 2160 },
  { name: 'Full HD',           width: 1920, height: 1080 },
  { name: 'HD',                width: 1280, height: 720  },
  { name: 'Square',            width: 1080, height: 1080 },
  { name: 'Instagram Story',   width: 1080, height: 1920 },
  { name: 'YouTube Thumbnail', width: 1280, height: 720  },
  { name: 'Twitter Post',      width: 1200, height: 675  },
  { name: 'Facebook Cover',    width: 820,  height: 312  },
  { name: 'Custom',            width: 0,    height: 0    },
];

const MAX_RATIO = 5;

const M = {
  bg:       '#1a2840',
  panel:    '#152030',
  border:   '#2d4468',
  input:    '#0f1e32',
  text:     '#e2e8f0',
  muted:    '#607898',
  label:    '#94a3b8',
  dim:      '#4a6480',
  accent:   '#f59e0b',
  accentD:  '#d97706',
  dropBg:   '#1e2e48',
  dropHover:'#253858',
  preview:  '#0c1828',
};

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [projectName, setProjectName] = useState('');
  const [canvasWidth, setCanvasWidth] = useState(3840);
  const [canvasHeight, setCanvasHeight] = useState(2160);
  const [selectedPreset, setSelectedPreset] = useState<string>('4K UHD');
  const [dropOpen, setDropOpen] = useState(false);
  const [ratioError, setRatioError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { validateRatio(canvasWidth, canvasHeight); }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const validateRatio = (w: number, h: number): boolean => {
    if (w <= 0 || h <= 0) { setRatioError('Width and height must be greater than 0'); return false; }
    const ratio = Math.max(w / h, h / w);
    if (ratio > MAX_RATIO) {
      setRatioError(w > h ? `Width cannot exceed ${MAX_RATIO}× the height` : `Height cannot exceed ${MAX_RATIO}× the width`);
      return false;
    }
    setRatioError(null);
    return true;
  };

  const selectPreset = (p: typeof PRESETS[0]) => {
    if (p.name !== 'Custom') { setCanvasWidth(p.width); setCanvasHeight(p.height); }
    setSelectedPreset(p.name);
    setDropOpen(false);
  };

  const handleWidth = (v: number) => {
    const c = Math.max(100, Math.min(16000, v));
    setCanvasWidth(c);
    setSelectedPreset(PRESETS.find(p => p.width === c && p.height === canvasHeight)?.name ?? 'Custom');
  };

  const handleHeight = (v: number) => {
    const c = Math.max(100, Math.min(16000, v));
    setCanvasHeight(c);
    setSelectedPreset(PRESETS.find(p => p.width === canvasWidth && p.height === c)?.name ?? 'Custom');
  };

  const handleCreate = () => {
    if (!projectName.trim() || ratioError || canvasWidth <= 0 || canvasHeight <= 0) return;
    onCreate(projectName.trim(), { width: canvasWidth, height: canvasHeight });
    reset(); onClose();
  };

  const reset = () => {
    setProjectName(''); setCanvasWidth(3840); setCanvasHeight(2160);
    setSelectedPreset('4K UHD'); setRatioError(null); setDropOpen(false);
  };

  const handleClose = () => { reset(); onClose(); };
  const canCreate = !!projectName.trim() && !ratioError && canvasWidth > 0 && canvasHeight > 0;

  const previewMax = 200;
  const maxDim = Math.max(canvasWidth, canvasHeight);
  const previewW = Math.max(40, Math.round((canvasWidth / maxDim) * previewMax));
  const previewH = Math.max(20, Math.round((canvasHeight / maxDim) * previewMax));
  const ratio = canvasWidth && canvasHeight ? (canvasWidth / canvasHeight).toFixed(2) : '—';

  const inputStyle: React.CSSProperties = {
    background: M.input,
    border: `1px solid ${M.border}`,
    borderRadius: 2,
    color: M.text,
    fontSize: 12,
    padding: '5px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: M.label,
    marginBottom: 5,
    display: 'block',
  };

  const currentLabel = selectedPreset === 'Custom'
    ? 'Custom'
    : PRESETS.find(p => p.name === selectedPreset)
      ? `${selectedPreset}`
      : 'Select preset';

  const currentDims = selectedPreset !== 'Custom'
    ? PRESETS.find(p => p.name === selectedPreset)
    : null;

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: M.bg, border: `1px solid ${M.border}`, borderRadius: 0, width: '100%', maxWidth: 420, overflow: 'visible' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${M.border}` }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: M.text, letterSpacing: 0.2 }}>Create project</span>
          <button onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', color: M.muted }}
            onMouseEnter={e => (e.currentTarget.style.color = M.text)}
            onMouseLeave={e => (e.currentTarget.style.color = M.muted)}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Project Name */}
          <div>
            <label style={labelStyle}>Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canCreate && handleCreate()}
              placeholder="Untitled project"
              autoFocus
              style={{ ...inputStyle, padding: '7px 10px', fontSize: 13 }}
              onFocus={e => (e.currentTarget.style.borderColor = M.accent)}
              onBlur={e => (e.currentTarget.style.borderColor = M.border)}
            />
          </div>

          {/* Canvas Preset — Custom Dropdown */}
          <div>
            <label style={labelStyle}>Canvas Preset</label>
            <div ref={dropRef} style={{ position: 'relative' }}>
              {/* Trigger */}
              <button
                onClick={() => setDropOpen(v => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: M.input,
                  border: `1px solid ${dropOpen ? M.accent : M.border}`,
                  borderRadius: 2,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  color: M.text,
                }}
              >
                <span style={{ fontSize: 12 }}>{currentLabel}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {currentDims && (
                    <span style={{ fontSize: 11, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {currentDims.width} × {currentDims.height}
                    </span>
                  )}
                  <ChevronDown style={{ width: 13, height: 13, color: M.dim, transform: dropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </div>
              </button>

              {/* Dropdown List */}
              {dropOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: M.dropBg,
                  border: `1px solid ${M.border}`,
                  borderTop: 'none',
                  zIndex: 200,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}>
                  {PRESETS.map(p => {
                    const isActive = selectedPreset === p.name;
                    return (
                      <PresetRow
                        key={p.name}
                        name={p.name}
                        width={p.width}
                        height={p.height}
                        isActive={isActive}
                        onClick={() => selectPreset(p)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Canvas Size Row */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: M.label, whiteSpace: 'nowrap', width: 78, flexShrink: 0 }}>Canvas Size</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: M.muted, marginBottom: 3 }}>Width</div>
                <input
                  type="number" min={100} max={16000} value={canvasWidth}
                  onChange={e => handleWidth(parseInt(e.target.value) || 100)}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = M.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = M.border)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: M.muted, marginBottom: 3 }}>Height</div>
                <input
                  type="number" min={100} max={16000} value={canvasHeight}
                  onChange={e => handleHeight(parseInt(e.target.value) || 100)}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = M.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = M.border)}
                />
              </div>
              <span style={{ fontSize: 11, color: M.muted, flexShrink: 0, marginTop: 16 }}>px</span>
            </div>
          </div>

          {/* Canvas Preview */}
          <div style={{ background: '#0b1828', border: `1px solid ${M.border}`, padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
            <div style={{
              background: M.preview,
              border: `1px solid ${M.border}`,
              width: previewW,
              height: previewH,
            }} />
            <span style={{ fontSize: 10, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>
              {canvasWidth} × {canvasHeight} px &nbsp;·&nbsp; {ratio}:1
            </span>
          </div>

          {/* Ratio Error */}
          {ratioError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 2 }}>
              <AlertCircle style={{ width: 13, height: 13, color: '#f87171', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#f87171' }}>{ratioError}</span>
            </div>
          )}

          {/* Create Button */}
          <CreateBtn canCreate={canCreate} onClick={handleCreate} />
        </div>
      </div>
    </div>
  );
};

const PresetRow: React.FC<{
  name: string;
  width: number;
  height: number;
  isActive: boolean;
  onClick: () => void;
}> = ({ name, width, height, isActive, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const isCustom = name === 'Custom';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        cursor: 'pointer',
        background: isActive ? 'rgba(245,158,11,0.12)' : hovered ? '#253858' : 'transparent',
        borderLeft: isActive ? '2px solid #f59e0b' : '2px solid transparent',
      }}
    >
      <span style={{ fontSize: 12, color: isActive ? '#f59e0b' : '#e2e8f0', fontWeight: isActive ? 500 : 400 }}>
        {name}
      </span>
      {!isCustom && (
        <span style={{ fontSize: 11, color: isActive ? '#d4a547' : '#607898', fontVariantNumeric: 'tabular-nums' }}>
          {width} × {height}
        </span>
      )}
    </div>
  );
};

const CreateBtn: React.FC<{ canCreate: boolean; onClick: () => void }> = ({ canCreate, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!canCreate}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%',
        padding: '9px 0',
        background: canCreate ? (h ? '#d97706' : '#f59e0b') : '#0f1e32',
        border: `1px solid ${canCreate ? '#d97706' : '#2d4468'}`,
        borderRadius: 2,
        color: canCreate ? '#fff' : '#3a5070',
        fontSize: 13,
        fontWeight: canCreate ? 600 : 400,
        cursor: canCreate ? 'pointer' : 'not-allowed',
        letterSpacing: 0.3,
      }}
    >
      Create Project
    </button>
  );
};

export default NewProjectModal;
