import { usePanelStore, type EditorWorkspace } from '../../store/panels';
import { PanelContainer } from './PanelContainer';
import { Viewport } from '../panels/Viewport';
import { PreviewControls } from '../panels/PreviewControls';
import { CanvasToolbar } from '../panels/CanvasToolbar';
import { Inspector } from '../panels/Inspector';
import { TimelinePanel } from '../panels/TimelinePanel';
import { AnimationPanel } from '../panels/AnimationPanel';
import { MediaPool } from '../panels/MediaPool';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';

const SHORT_WORKSPACE: Record<
  Exclude<EditorWorkspace, 'review'>,
  { showTimeline: boolean; showAnimationPanel: boolean; bottomHeight: string }
> = {
  design: { showTimeline: false, showAnimationPanel: false, bottomHeight: '0px' },
  edit: { showTimeline: true, showAnimationPanel: false, bottomHeight: '47%' },
  animate: { showTimeline: true, showAnimationPanel: true, bottomHeight: '47%' },
};

export function ShortFormLayout() {
  const panels = usePanelStore((s) => s.panels);
  const workspace = usePanelStore((s) => s.editorWorkspace) as Exclude<EditorWorkspace, 'review'>;
  const layout = SHORT_WORKSPACE[workspace];

  return (
    <div className="flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden bg-[#06101a]">
      {/* Left 70%: media pool + inspector (top) / timeline (bottom) */}
      <div className="flex flex-col min-h-0 min-w-0" style={{ width: '70%' }}>
        {/* Top panels: media pool + inspector */}
        <div className="flex-1 flex flex-row min-h-0 min-w-0">
          {/* Media Pool */}
          <div className="min-h-0 overflow-hidden" style={{ width: workspace === 'design' ? '50%' : '42%' }}>
            <MediaPool />
          </div>

          {/* Inspector */}
          {panels.properties.visible && (
            <div className="flex-1 min-h-0 overflow-hidden border-l border-[#1a2a42]/40">
              <PanelContainer id="properties" title="Properties">
                <PanelErrorBoundary name="Inspector">
                  <Inspector />
                </PanelErrorBoundary>
              </PanelContainer>
            </div>
          )}
        </div>

        {/* Bottom: Timeline + (Animate only) animation panel */}
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
            {layout.showAnimationPanel && (
              <div className="min-w-0 min-h-0 overflow-hidden border-l border-[#1a2a42]/40" style={{ width: '33.34%' }}>
                <AnimationPanel />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right 30%: Canvas (full height) */}
      <div className="flex-shrink-0 min-h-0 min-w-0 flex flex-col bg-[#050d18] border-l border-[#1a2a42]/40" style={{ width: '30%' }}>
        <CanvasToolbar />
        <PanelErrorBoundary name="Viewport">
          <Viewport />
        </PanelErrorBoundary>
        <PreviewControls />
      </div>
    </div>
  );
}
