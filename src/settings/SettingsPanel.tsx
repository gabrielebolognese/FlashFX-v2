import {
  X, Settings, MousePointer, Clock, Palette, Droplets, Type,
  Layout, Diamond, Wand2, Film, Volume2, Keyboard, Gauge,
  Wrench, Code2, Save, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { useSettingsStore } from './store';
import { SETTINGS_TABS } from './tabs';
import { SettingControl } from './SettingControl';
import type { SettingTab, SettingSection } from './types';

const ICON_MAP: Record<string, typeof Settings> = {
  Settings, MousePointer, Clock, Palette, Droplets, Type,
  Layout, Diamond, Wand2, Film, Volume2, Keyboard, Gauge,
  Wrench, Code2,
};

export function SettingsPanel() {
  const open = useSettingsStore((s) => s.open);
  const close = useSettingsStore((s) => s.closeSettings);
  const activeTab = useSettingsStore((s) => s.activeTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const showResetConfirm = useSettingsStore((s) => s.showResetConfirm);

  if (!open) return null;

  const currentTab = SETTINGS_TABS.find((t) => t.id === activeTab) ?? SETTINGS_TABS[0];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative w-[860px] max-w-[90vw] h-[620px] max-h-[85vh] bg-[#0a1628] border border-[#1a2a42] rounded-xl shadow-2xl flex overflow-hidden">
        <SettingsSidebar
          activeTab={activeTab}
          onSelect={setActiveTab}
          onClose={close}
        />
        <SettingsContent tab={currentTab} />
      </div>

      {showResetConfirm && <ResetConfirmDialog />}
    </div>
  );
}

function SettingsSidebar({
  activeTab,
  onSelect,
  onClose,
}: {
  activeTab: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const saveNow = useSettingsStore((s) => s.saveNow);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  return (
    <div className="w-[180px] flex-shrink-0 bg-[#06101a] border-r border-[#1a2a42] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2a42]">
        <span className="text-[12px] font-semibold text-slate-200">Settings</span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1.5 px-1.5">
        {SETTINGS_TABS.map((tab) => {
          const Icon = ICON_MAP[tab.icon] ?? Settings;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors mb-0.5 ${
                isActive
                  ? 'bg-[#f7b500]/10 text-[#f7b500]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              <Icon size={12} className="flex-shrink-0" />
              <span className="text-[10px] font-medium truncate">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-[#1a2a42] flex flex-col gap-1">
        <button
          onClick={saveNow}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-medium text-slate-300 hover:text-slate-100 hover:bg-white/[0.04] rounded transition-colors"
        >
          <Save size={10} />
          Save Settings
        </button>
        <button
          onClick={resetToDefaults}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/[0.05] rounded transition-colors"
        >
          <RotateCcw size={10} />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

function SettingsContent({ tab }: { tab: SettingTab }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex-shrink-0 px-6 py-4 border-b border-[#1a2a42]">
        <h2 className="text-[13px] font-semibold text-slate-200">{tab.label}</h2>
        <p className="text-[9px] text-slate-500 mt-0.5">
          {tab.sections.length} {tab.sections.length === 1 ? 'section' : 'sections'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-5">
          {tab.sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: SettingSection }) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
          {section.title}
        </h3>
        {section.description && (
          <p className="text-[9px] text-slate-500 mt-0.5">{section.description}</p>
        )}
      </div>

      <div className="bg-[#06101a]/50 border border-[#1a2a42] rounded-lg px-3 py-1.5">
        {section.controls.map((control, idx) => (
          <div key={control.id}>
            {idx > 0 && <div className="border-t border-[#1a2a42]/50 my-0.5" />}
            <SettingControl control={control} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResetConfirmDialog() {
  const confirmReset = useSettingsStore((s) => s.confirmReset);
  const cancelReset = useSettingsStore((s) => s.cancelReset);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={cancelReset} />
      <div className="relative bg-[#0e1c32] border border-[#1a2a42] rounded-lg shadow-2xl p-5 w-[340px]">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-400" />
          <h3 className="text-[12px] font-semibold text-slate-200">Reset All Settings?</h3>
        </div>
        <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">
          This will restore all settings to their factory defaults. Your current
          customizations will be permanently lost. This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={cancelReset}
            className="px-3 py-1.5 text-[10px] font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmReset}
            className="px-3 py-1.5 text-[10px] font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
          >
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  );
}
