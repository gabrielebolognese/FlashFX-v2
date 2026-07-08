import { useState, useEffect } from 'react';
import { Diamond, Activity } from 'lucide-react';
import { KeyframeTimeline } from './KeyframeTimeline';
import { InterpolationGraph } from './InterpolationGraph';

type AnimationView = 'keyframes' | 'graph';

const STORAGE_KEY = 'ffx-animation-panel-view';

function loadView(): AnimationView {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'graph' ? 'graph' : 'keyframes';
  } catch {
    return 'keyframes';
  }
}

export function AnimationPanel() {
  const [view, setView] = useState<AnimationView>(() => loadView());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* noop */
    }
  }, [view]);

  return (
    <div className="flex flex-col h-full bg-[#081220]">
      <div className="h-[26px] min-h-[26px] flex items-center px-2 gap-1 border-b border-[#1a2a42] bg-[#081220]">
        <TabButton
          active={view === 'keyframes'}
          onClick={() => setView('keyframes')}
          icon={<Diamond size={10} />}
          label="Keyframes"
        />
        <TabButton
          active={view === 'graph'}
          onClick={() => setView('graph')}
          icon={<Activity size={10} />}
          label="Graph Editor"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'keyframes' ? <KeyframeTimeline /> : <InterpolationGraph />}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
        active
          ? 'bg-[#f7b500]/10 text-[#f7b500] border border-[#f7b500]/30'
          : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-[#122240]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
