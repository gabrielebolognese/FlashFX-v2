import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { CameraLayer } from '../../core/types';
import { CameraSettingsDialog } from './CameraSettingsDialog';

// A camera is a custom object: its only inline control is the button that opens the full
// AE-style Camera Settings dialog (presets, coupled lens fields, depth of field). Everything
// else — placing it in space — happens in the 3D View below it in the inspector.
export function CameraPanel({ layer }: { layer: CameraLayer }) {
  const [showDialog, setShowDialog] = useState(false);
  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-[#122240] hover:bg-[#1a2f52] border border-[#1a2a42] text-[11px] font-medium text-slate-200 transition-colors"
      >
        <SlidersHorizontal size={12} /> Camera Settings…
      </button>
      {showDialog && <CameraSettingsDialog layer={layer} onClose={() => setShowDialog(false)} />}
    </>
  );
}
