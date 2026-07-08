import { usePanelStore, type EditorWorkspace } from '../../store/panels';
import { PanelContainer } from './PanelContainer';
import { ReviewLayout } from './ReviewLayout';
import { ShortFormLayout } from './ShortFormLayout';
import { ShortFormReviewLayout } from './ShortFormReviewLayout';
import { Viewport } from '../panels/Viewport';
import { PreviewControls } from '../panels/PreviewControls';
import { CanvasToolbar } from '../panels/CanvasToolbar';
import { Inspector } from '../panels/Inspector';
import { TimelinePanel } from '../panels/TimelinePanel';
import { AnimationPanel } from '../panels/AnimationPanel';
import { MediaPool } from '../panels/MediaPool';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';

const WORKSPACE_LAYOUT: Record<
  Exclude<EditorWorkspace, 'review'>,
  { mediaWidth: string; inspectorWidth: string; bottomHeight: string; showAnimationPanel: boolean; showTimeline: boolean }
> = {
  design: { mediaWidth: '30%', inspectorWidth: '30%', bottomHeight: '0px', showAnimationPanel: false, showTimeline: false },
  edit: { mediaWidth: '25%', inspectorWidth: '27.5%', bottomHeight: '47%', showAnimationPanel: false, showTimeline: true },
  animate: { mediaWidth: '22.5%', inspectorWidth: '27.5%', bottomHeight: '47%', showAnimationPanel: true, showTimeline: true },
};

export function PanelLayout() {
  const panels = usePanelStore((s) => s.panels);
  const workspace = usePanelStore((s) => s.editorWorkspace);
  const videoFormat = usePanelStore((s) => s.videoFormat);

  if (videoFormat === 'short') {
    if (workspace === 'review') return <ShortFormReviewLayout />;
    return <ShortFormLayout />;
  }

  if (workspace === 'review') {
    return <ReviewLayout />;
  }

  const layout = WORKSPACE_LAYOUT[workspace];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[#06101a]">
      {/* Upper region: media pool + canvas + inspector */}
      <div className="flex-1 flex flex-row min-h-0 min-w-0">
        {/* Media Pool */}
        <div
          className="flex-shrink-0 min-h-0 overflow-hidden"
          style={{ width: layout.mediaWidth }}
        >
          <MediaPool />
        </div>

        {/* Canvas - takes remaining space */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#050d18] border-l border-[#1a2a42]/40">
          <CanvasToolbar />
          <PanelErrorBoundary name="Viewport">
            <Viewport />
          </PanelErrorBoundary>
          <PreviewControls />
        </div>

        {/* Inspector - far right */}
        {panels.properties.visible && (
          <div
            className="flex-shrink-0 min-h-0 overflow-hidden border-l border-[#1a2a42]/40"
            style={{ width: layout.inspectorWidth }}
          >
            <PanelContainer id="properties" title="Properties">
              <PanelErrorBoundary name="Inspector">
                <Inspector />
              </PanelErrorBoundary>
            </PanelContainer>
          </div>
        )}
      </div>

      {/* Bottom workspace: main timeline + (Animate only) keyframes/graph */}
      {layout.showTimeline && panels.timeline.visible && (
        <div
          className="flex-shrink-0 min-w-0 overflow-hidden border-t border-[#1a2a42]/60 flex flex-row shadow-[0_-1px_3px_rgba(0,0,0,0.3)]"
          style={{ height: layout.bottomHeight }}
        >
          <div
            className="min-w-0 min-h-0 overflow-hidden"
            style={{ width: layout.showAnimationPanel ? '66.66%' : '100%' }}
          >
            <PanelErrorBoundary name="Timeline">
              <TimelinePanel />
            </PanelErrorBoundary>
          </div>
          <div
            className="min-w-0 min-h-0 overflow-hidden border-l border-[#1a2a42]/40"
            style={{
              width: layout.showAnimationPanel ? '33.34%' : '0',
              display: layout.showAnimationPanel ? 'block' : 'none',
            }}
          >
            <AnimationPanel />
          </div>
        </div>
      )}
    </div>
  );
}
