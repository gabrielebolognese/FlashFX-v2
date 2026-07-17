import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
}

const M = {
  bg:      '#1a2840',
  border:  '#2d4468',
  text:    '#e2e8f0',
  muted:   '#607898',
  label:   '#94a3b8',
  dim:     '#3a5070',
  input:   '#0f1e32',
  danger:  '#f87171',
  dangerD: '#ef4444',
  dangerBg:'rgba(248,113,113,0.08)',
  warnBg:  'rgba(248,113,113,0.07)',
  warnBorder: 'rgba(248,113,113,0.25)',
};

const DeleteProjectModal: React.FC<DeleteProjectModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
}) => {
  const [countdown, setCountdown] = useState(2);
  const [timerDone, setTimerDone] = useState(false);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(2);
    setTimerDone(false);
    setUnderstood(false);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setTimerDone(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const canDelete = timerDone && understood;

  const handleConfirm = () => {
    if (!canDelete) return;
    onConfirm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: M.bg, border: `1px solid ${M.border}`, width: '100%', maxWidth: 400 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${M.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <AlertTriangle style={{ width: 15, height: 15, color: M.danger, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: M.text, letterSpacing: 0.2 }}>Delete project</span>
          </div>
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
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Project name display */}
          <div>
            <div style={{ fontSize: 11, color: M.label, marginBottom: 5 }}>Project</div>
            <div style={{
              background: M.input,
              border: `1px solid ${M.border}`,
              padding: '7px 10px',
              fontSize: 13,
              color: M.text,
              fontWeight: 500,
            }}>
              {projectName}
            </div>
          </div>

          {/* Warning box */}
          <div style={{
            background: M.warnBg,
            border: `1px solid ${M.warnBorder}`,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
          }}>
            <AlertTriangle style={{ width: 13, height: 13, color: M.danger, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: M.danger, lineHeight: 1.5 }}>
              This action is permanent. All project data, assets, and timelines will be removed immediately.
            </span>
          </div>

          {/* Checkbox */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setUnderstood(v => !v)}
              style={{
                width: 14,
                height: 14,
                flexShrink: 0,
                marginTop: 1,
                border: `1px solid ${understood ? M.danger : M.border}`,
                background: understood ? M.dangerBg : M.input,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {understood && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke={M.danger} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span
              onClick={() => setUnderstood(v => !v)}
              style={{ fontSize: 12, color: understood ? M.label : M.muted, lineHeight: 1.5 }}
            >
              I understand that upon deletion the project is unrecoverable.
            </span>
          </label>

          {/* Delete button */}
          <DeleteBtn canDelete={canDelete} timerDone={timerDone} countdown={countdown} onClick={handleConfirm} />
        </div>
      </div>
    </div>
  );
};

const DeleteBtn: React.FC<{
  canDelete: boolean;
  timerDone: boolean;
  countdown: number;
  onClick: () => void;
}> = ({ canDelete, timerDone, countdown, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const label = !timerDone
    ? `Wait ${countdown}s…`
    : canDelete
      ? 'Delete Project'
      : 'Delete Project';

  return (
    <button
      onClick={onClick}
      disabled={!canDelete}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        padding: '9px 0',
        background: canDelete && hovered ? 'rgba(248,113,113,0.1)' : '#0f1e32',
        border: `1px solid ${canDelete ? '#f87171' : '#2d4468'}`,
        color: canDelete ? '#f87171' : '#3a5070',
        fontSize: 13,
        fontWeight: canDelete ? 600 : 400,
        cursor: canDelete ? 'pointer' : 'not-allowed',
        letterSpacing: 0.3,
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
};

export default DeleteProjectModal;
