import { ReviewViewport } from '../panels/review/ReviewViewport';
import { AudioMeter } from '../panels/review/AudioMeter';
import { KeyframeOverview } from '../panels/review/KeyframeOverview';
import { ReviewTimeline } from '../panels/review/ReviewTimeline';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { usePanelStore, type EditorWorkspace } from '../../store/panels';
import { LayoutDashboard, Scissors, Sparkles, Eye } from 'lucide-react';

const WORKSPACES: { id: EditorWorkspace; label: string; icon: typeof Eye }[] = [
  { id: 'design', label: 'Design', icon: LayoutDashboard },
  { id: 'edit', label: 'Edit', icon: Scissors },
  { id: 'animate', label: 'Animate', icon: Sparkles },
  { id: 'review', label: 'Review', icon: Eye },
];

export function ReviewLayout() {
  const workspace = usePanelStore((s) => s.editorWorkspace);
  const setWorkspace = usePanelStore((s) => s.setEditorWorkspace);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      {/* Mode bar */}
      <div className="h-7 min-h-[28px] flex items-center px-3 bg-[#0e1c32] border-b border-[#1a2a42] gap-3 flex-shrink-0">
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#06101a] border border-[#1a2a42]">
          {WORKSPACES.map(({ id, label, icon: Icon }) => {
            const active = workspace === id;
            return (
              <button
                key={id}
                onClick={() => setWorkspace(id)}
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
        <span className="text-[10px] text-slate-600 ml-auto">Read-only review mode</span>
      </div>

      {/* Top section: 55% - Canvas + Meter | Keyframe Overview */}
      <div className="flex flex-row min-h-0 min-w-0 flex-1" style={{ maxHeight: '55%' }}>
        {/* Left: Audio Meter + Canvas */}
        <div className="flex flex-row min-h-0 min-w-0" style={{ width: '55%' }}>
          {/* Audio meter */}
          <div className="flex-shrink-0 min-h-0 border-r border-[#1a2a42] bg-[#06101a]" style={{ width: '52px' }}>
            <PanelErrorBoundary name="AudioMeter">
              <AudioMeter />
            </PanelErrorBoundary>
          </div>
          {/* Canvas */}
          <div className="flex-1 min-h-0 min-w-0">
            <PanelErrorBoundary name="ReviewViewport">
              <ReviewViewport />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* Right: Keyframe Overview */}
        <div className="flex-1 min-h-0 min-w-0 border-l border-[#1a2a42]">
          <PanelErrorBoundary name="KeyframeOverview">
            <KeyframeOverview />
          </PanelErrorBoundary>
        </div>
      </div>

      {/* Bottom section: 45% - Review Timeline */}
      <div className="min-w-0 min-h-0 overflow-hidden border-t border-[#1a2a42] flex-1">
        <PanelErrorBoundary name="ReviewTimeline">
          <ReviewTimeline />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
