import { useEffect } from 'react';
import { Captions, Scissors } from 'lucide-react';
import { useClipContextMenu } from '../../store/clipContextMenu';
import { useEditorStore } from '../../store/editor';
import { useCaptionStore } from '../../store/captions';
import { useSilenceStore } from '../../store/silenceStripper';

// Lightweight right-click menu for timeline clips. Currently exposes caption
// generation for video and audio clips; renders nothing for other layer types.
export function ClipContextMenu() {
  const open = useClipContextMenu((s) => s.open);
  const x = useClipContextMenu((s) => s.x);
  const y = useClipContextMenu((s) => s.y);
  const layerId = useClipContextMenu((s) => s.layerId);
  const hide = useClipContextMenu((s) => s.hide);

  const layer = useEditorStore((s) => s.composition.layers.find((l) => l.id === layerId) ?? null);
  const openCaptions = useCaptionStore((s) => s.open);
  const openSilence = useSilenceStore((s) => s.open);

  useEffect(() => {
    if (!open) return;
    const onDown = () => hide();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', hide);
    };
  }, [open, hide]);

  if (!open || !layer) return null;
  if (layer.type !== 'video' && layer.type !== 'audio') return null;

  const assetId = layer.type === 'video' ? layer.video.assetId : layer.audio.assetId;

  const handleGenerate = () => {
    openCaptions({
      layerId: layer.id,
      assetId,
      clipStartFrame: layer.inPoint,
      name: layer.name,
    });
    hide();
  };

  const handleStripSilence = () => {
    openSilence(layer.id);
    hide();
  };

  // Keep the menu inside the viewport.
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 80);

  return (
    <div
      className="fixed z-[120] min-w-[180px] bg-[#0e1c32] border border-[#1a2a42] rounded-md shadow-2xl py-1"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={handleGenerate}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-[#1a2a42] hover:text-white transition-colors"
      >
        <Captions size={13} className="text-cyan-400" />
        Generate Captions
      </button>
      <button
        onClick={handleStripSilence}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-[#1a2a42] hover:text-white transition-colors"
      >
        <Scissors size={13} className="text-cyan-400" />
        Strip Silence
      </button>
    </div>
  );
}
