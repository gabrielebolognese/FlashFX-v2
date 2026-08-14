import { Viewport } from '../panels/Viewport';
import { PreviewControls } from '../panels/PreviewControls';
import { TimelinePanel } from '../panels/TimelinePanel';
import { InterpolationGraph } from '../panels/InterpolationGraph';
import { AnimationBuilderWorkspace } from '../../animation-builder/ui/AnimationBuilderPanel';

export function BuilderLayout() {
  return (
    <div className="flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden">
      {/* Left 2/3: editor panels */}
      <div className="flex flex-col min-h-0 min-w-0" style={{ width: '64%' }}>
        {/* Top: Interpolation Graph + Canvas Preview */}
        <div className="flex flex-row min-h-0 min-w-0" style={{ height: '60%' }}>
          <div className="min-h-0 min-w-0 overflow-hidden border-r border-hairline" style={{ width: '45%' }}>
            <InterpolationGraph />
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#08111f]">
            <Viewport />
            <PreviewControls />
          </div>
        </div>
        {/* Bottom: Timeline (reduced height - 40% of original) */}
        <div className="min-w-0 min-h-0 overflow-hidden border-t border-hairline" style={{ height: '40%' }}>
          <TimelinePanel />
        </div>
      </div>

      {/* Right 36%: Animation Builder */}
      <div className="min-h-0 min-w-0 overflow-hidden border-l border-hairline" style={{ width: '36%' }}>
        <AnimationBuilderWorkspace />
      </div>
    </div>
  );
}
