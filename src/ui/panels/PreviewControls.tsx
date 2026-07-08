import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Zap,
  CropIcon,
  Wind,
  Boxes,
  Grid3x3,
  Sun,
  Layers,
  EyeOff,
  Circle,
  LayoutDashboard,
  Scissors,
  Sparkles,
  Eye,
} from 'lucide-react';
import {
  usePreviewStore,
  PREVIEW_QUALITY_ORDER,
  PREVIEW_QUALITY_LABELS,
  type PreviewQuality,
} from '../../store/preview';
import { usePanelStore, type EditorWorkspace } from '../../store/panels';

export function PreviewControls() {
  const quality = usePreviewStore((s) => s.quality);
  const setQuality = usePreviewStore((s) => s.setQuality);
  const transparencyGrid = usePreviewStore((s) => s.transparencyGrid);
  const toggleTransparencyGrid = usePreviewStore((s) => s.toggleTransparencyGrid);
  const globalMotionBlur = usePreviewStore((s) => s.globalMotionBlur);
  const toggleGlobalMotionBlur = usePreviewStore((s) => s.toggleGlobalMotionBlur);
  const pixelPreview = usePreviewStore((s) => s.pixelPreview);
  const togglePixelPreview = usePreviewStore((s) => s.togglePixelPreview);
  const regionOfInterest = usePreviewStore((s) => s.regionOfInterest);
  const toggleRegionOfInterest = usePreviewStore((s) => s.toggleRegionOfInterest);
  const fastDraft = usePreviewStore((s) => s.fastDraft);
  const toggleFastDraft = usePreviewStore((s) => s.toggleFastDraft);

  return (
    <div className="h-[28px] min-h-[28px] flex items-center gap-1 px-2 bg-[#081220] border-t border-[#1a2a42] select-none">
      {/* Resolution dropdown */}
      <QualitySelect quality={quality} onChange={setQuality} />

      <Divider />

      {/* Fast Draft / Fast Preview */}
      <ToggleButton
        icon={<Zap size={12} />}
        active={fastDraft}
        onClick={toggleFastDraft}
        title="Fast Preview (Draft mode)"
        activeColor="text-amber-400"
      />

      {/* Region of Interest */}
      <ToggleButton
        icon={<CropIcon size={12} />}
        active={regionOfInterest}
        onClick={toggleRegionOfInterest}
        title="Region of Interest"
        activeColor="text-cyan-400"
      />

      <Divider />

      {/* Global Motion Blur (timeline-level) */}
      <ToggleButton
        icon={<Wind size={12} />}
        active={globalMotionBlur}
        onClick={toggleGlobalMotionBlur}
        title="Global Motion Blur"
        activeColor="text-cyan-400"
      />

      {/* Draft 3D */}
      <ToggleButton
        icon={<Boxes size={12} />}
        active={false}
        onClick={() => {}}
        title="Draft 3D (no 3D layers yet)"
        disabled
        activeColor="text-emerald-400"
      />

      <Divider />

      {/* Transparency grid */}
      <ToggleButton
        icon={<Grid3x3 size={12} />}
        active={transparencyGrid}
        onClick={toggleTransparencyGrid}
        title="Transparency Grid"
        activeColor="text-slate-200"
      />

      {/* Continuous rasterization (vector quality) — visual preview only */}
      <ToggleButton
        icon={<Sun size={12} />}
        active={pixelPreview}
        onClick={togglePixelPreview}
        title="Pixel Preview (nearest-neighbor)"
        activeColor="text-yellow-400"
      />

      <Divider />

      {/* Frame Blending placeholder */}
      <ToggleButton
        icon={<Layers size={12} />}
        active={false}
        onClick={() => {}}
        title="Frame Blending (not implemented)"
        disabled
        activeColor="text-[#f7b500]"
      />

      {/* Shy layers placeholder */}
      <ToggleButton
        icon={<EyeOff size={12} />}
        active={false}
        onClick={() => {}}
        title="Shy Layers (not implemented)"
        disabled
        activeColor="text-orange-400"
      />

      {/* Solo placeholder */}
      <ToggleButton
        icon={<Circle size={12} />}
        active={false}
        onClick={() => {}}
        title="Solo (not implemented)"
        disabled
        activeColor="text-fuchsia-400"
      />

      <div className="ml-auto flex items-center gap-2">
        <WorkspaceSwitch />
        <span className="text-[10px] text-slate-500 font-mono">
          Preview {PREVIEW_QUALITY_LABELS[quality]}
        </span>
      </div>
    </div>
  );
}

const WORKSPACES: { id: EditorWorkspace; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: 'design', label: 'Design', icon: LayoutDashboard, hint: 'Layout & composition' },
  { id: 'edit', label: 'Edit', icon: Scissors, hint: 'Timeline & clip editing' },
  { id: 'animate', label: 'Animate', icon: Sparkles, hint: 'Motion graphics & keyframes' },
  { id: 'review', label: 'Review', icon: Eye, hint: 'Playback review & inspection' },
];

function WorkspaceSwitch() {
  const workspace = usePanelStore((s) => s.editorWorkspace);
  const setWorkspace = usePanelStore((s) => s.setEditorWorkspace);

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#0e1c32] border border-[#1a2a42]">
      {WORKSPACES.map(({ id, label, icon: Icon, hint }) => {
        const active = workspace === id;
        return (
          <button
            key={id}
            onClick={() => setWorkspace(id)}
            title={hint}
            className={`flex items-center gap-1 h-5 px-2 rounded text-[10px] font-medium transition-colors ${
              active
                ? 'bg-[#f7b500]/10 text-[#ffc83d]'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-[#1a2a42] mx-1" />;
}

interface ToggleButtonProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  activeColor?: string;
}

function ToggleButton({ icon, active, onClick, title, disabled, activeColor }: ToggleButtonProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
        disabled
          ? 'text-slate-700 cursor-not-allowed opacity-50'
          : active
            ? `${activeColor ?? 'text-[#f7b500]'} bg-[#1a2a42]`
            : 'text-slate-500 hover:text-slate-200 hover:bg-[#1a2a42]'
      }`}
    >
      {icon}
    </button>
  );
}

interface QualitySelectProps {
  quality: PreviewQuality;
  onChange: (q: PreviewQuality) => void;
}

function QualitySelect({ quality, onChange }: QualitySelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium transition-colors ${
          quality !== 'full'
            ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            : 'bg-[#1a2a42] text-slate-300 hover:bg-[#1c3155]'
        }`}
        title="Preview Resolution"
      >
        <span>{PREVIEW_QUALITY_LABELS[quality]}</span>
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-50 min-w-[100px] rounded-md bg-[#0e1c32] border border-[#243a5c] shadow-xl py-1">
          {PREVIEW_QUALITY_ORDER.map((q) => (
            <button
              key={q}
              onClick={() => {
                onChange(q);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-[10px] hover:bg-[#1a2a42] flex items-center justify-between ${
                quality === q ? 'text-amber-400' : 'text-slate-300'
              }`}
            >
              <span>{PREVIEW_QUALITY_LABELS[q]}</span>
              <span className="text-[9px] text-slate-500">
                {q === 'full' ? '100%' : q === 'half' ? '50%' : q === 'third' ? '33%' : '25%'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
