import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Toolbar } from './ui/panels/Toolbar';
import { PanelLayout } from './ui/layout/PanelLayout';
import { BuilderLayout } from './ui/layout/BuilderLayout';
import { useEditorStore } from './store/editor';
import { useHistoryStore } from './store/history';
import { useTimelineStore } from './store/timeline';
import { usePanelStore } from './store/panels';
import { ProjectApp, useProjectStore } from './project-system';
import { useAnimationBuilderStore } from './animation-builder';
import { ArrowLeft, LayoutGrid, Workflow, Settings2 } from 'lucide-react';
import { ResetEditorDialog } from './ui/recovery/ResetEditorDialog';
import { EmergencyRecoveryOverlay } from './ui/recovery/EmergencyRecoveryOverlay';
import { CaptionGenerationModal } from './ui/panels/CaptionGenerationModal';
import { SilenceStripperModal } from './ui/panels/SilenceStripperModal';
import { ClipContextMenu } from './ui/panels/ClipContextMenu';
import { ContextMenuProvider, ContextMenuRenderer } from './ui/context-menu';
import { SettingsPanel, SettingsCssInjector } from './settings';
import { useSettingsStore } from './settings/store';
import { OnboardingFlow, useOnboardingStore } from './onboarding';

const LazyIntroPopup = lazy(() => import('@/components/ui/IntroPopup').then(m => ({ default: m.IntroPopup })));

function Editor() {
  const createGroup = useEditorStore((s) => s.createGroup);
  const ungroupSelection = useEditorStore((s) => s.ungroupSelection);
  const removeLayers = useEditorStore((s) => s.removeLayers);
  const selection = useEditorStore((s) => s.selection);
  const trimSplit = useEditorStore((s) => s.trimSplit);
  const trimLeft = useEditorStore((s) => s.trimLeft);
  const trimRight = useEditorStore((s) => s.trimRight);
  const trimCutUp = useEditorStore((s) => s.trimCutUp);
  const trimCutDown = useEditorStore((s) => s.trimCutDown);
  const copySelection = useEditorStore((s) => s.copySelection);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const closeProject = useProjectStore((s) => s.closeProject);
  const workspace = useAnimationBuilderStore((s) => s.workspace);
  const setWorkspace = useAnimationBuilderStore((s) => s.setWorkspace);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTextInput =
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target.tagName === 'INPUT' && (!target.getAttribute('type') || ['text', 'search', 'url', 'email', 'password', 'number', 'tel'].includes(target.getAttribute('type')!)));

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.altKey && e.key === 'g') {
        e.preventDefault();
        createGroup();
      }
      if (e.altKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        ungroupSelection();
      }

      if (e.key === 'F2' && !isTextInput) {
        e.preventDefault();
        const { selection, startRenameLayer } = useEditorStore.getState();
        const targetId = selection.activeId ?? selection.selectedIds[0];
        if (targetId) startRenameLayer(targetId);
        return;
      }

      // Trim operations
      if (!isTextInput) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          e.preventDefault();
          copySelection();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
          e.preventDefault();
          pasteClipboard();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
          e.preventDefault();
          duplicateSelection();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault();
          trimSplit();
          return;
        }
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey) {
          e.preventDefault();
          trimCutUp();
          return;
        }
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && e.altKey && !e.shiftKey) {
          e.preventDefault();
          trimCutDown();
          return;
        }
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          trimSplit();
          return;
        }
        if (e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          trimLeft();
          return;
        }
        if (e.key === 'w' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          trimRight();
          return;
        }
      }

      // Spacebar always toggles playback unless actively typing text.
      if (e.key === ' ') {
        if (isTextInput) return;
        e.preventDefault();
        const ts = useTimelineStore.getState();
        if (ts.isPlaying) ts.pause();
        else ts.play();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selection.selectedIds.length > 0 || selection.activeId)) {
        if (isTextInput) return;
        e.preventDefault();
        const ids = selection.selectedIds.length > 0
          ? selection.selectedIds
          : selection.activeId ? [selection.activeId] : [];
        removeLayers(ids);
      }
      // Enter blurs any focused input/button so global shortcuts resume.
      if (e.key === 'Enter' && !isTextInput && target !== document.body) {
        (target as HTMLElement).blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createGroup, ungroupSelection, removeLayers, selection.selectedIds, selection.activeId, undo, redo, trimSplit, trimLeft, trimRight, trimCutUp, trimCutDown, copySelection, pasteClipboard, duplicateSelection]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#06101a] text-slate-300 overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-stretch bg-[#0a1628] border-b border-[#1a2a42] shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        <button
          onClick={closeProject}
          className="flex items-center gap-1.5 px-3 text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors border-r border-[#1a2a42]"
          title="Back to Projects"
        >
          <ArrowLeft size={14} />
          <span className="text-[11px] font-medium">Projects</span>
        </button>
        <div className="flex-1 min-w-0">
          <Toolbar />
        </div>
        {/* Animation Builder Mode Toggle */}
        <button
          onClick={() => setWorkspace(workspace === 'editor' ? 'builder' : 'editor')}
          className={`flex items-center gap-1.5 px-3 transition-colors border-l border-[#1a2a42] ${
            workspace === 'builder'
              ? 'bg-[#f7b500]/8 text-[#f7b500] border-b-2 border-b-[#f7b500]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
          }`}
          title="Animation Builder Mode"
        >
          <Workflow size={13} />
          <span className="text-[11px] font-medium">Builder</span>
        </button>
        {workspace === 'editor' && <PanelsMenu />}
      </div>
      {workspace === 'editor' ? <PanelLayout /> : <BuilderLayout />}
      <ResetEditorDialog />
      <EmergencyRecoveryOverlay />
      <ClipContextMenu />
      <CaptionGenerationModal />
      <SilenceStripperModal />
      <SettingsPanel />
      <SettingsCssInjector />
      <Suspense fallback={null}>
        <LazyIntroPopup />
      </Suspense>
    </div>
  );
}

function PanelsMenu() {
  const panels = usePanelStore((s) => s.panels);
  const toggleVisible = usePanelStore((s) => s.toggleVisible);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const items: { id: 'properties' | 'timeline' | 'layers'; label: string }[] = [
    { id: 'properties', label: 'Inspector' },
    { id: 'timeline', label: 'Timelines' },
    { id: 'layers', label: 'Layers' },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 h-full text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors border-l border-[#1a2a42] ${open ? 'bg-white/[0.04] text-slate-200' : ''}`}
        title="Toggle Panels"
      >
        <LayoutGrid size={13} />
        <span className="text-[11px] font-medium">Panels</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#0e1c32] border border-[#1a2a42] rounded-lg shadow-2xl py-1 min-w-[160px] backdrop-blur-sm">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleVisible(item.id)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-300 hover:bg-white/[0.04] transition-colors"
            >
              <span>{item.label}</span>
              <span className={`w-2 h-2 rounded-full ${panels[item.id].visible ? 'bg-[#f7b500]' : 'bg-slate-700'}`} />
            </button>
          ))}
          <div className="border-t border-[#1a2a42] my-1" />
          <button
            onClick={() => { openSettings(); setOpen(false); }}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-[11px] text-slate-300 hover:bg-white/[0.04] transition-colors"
          >
            <Settings2 size={12} />
            <span>Settings</span>
          </button>
          <div className="border-t border-[#1a2a42] my-1" />
          <button
            onClick={() => {
              items.forEach((item) => {
                if (!panels[item.id].visible) toggleVisible(item.id);
              });
              setOpen(false);
            }}
            className="w-full px-3 py-1.5 text-[11px] text-[#f7b500] hover:bg-white/[0.04] transition-colors text-left"
          >
            Show All Panels
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const onboardingActive = useOnboardingStore((s) => s.active);
  const onboardingStep = useOnboardingStore((s) => s.step);
  const bgColor = useOnboardingStore((s) => s.bgColor);
  const shapeMode = useOnboardingStore((s) => s.shapeMode);
  const contentType = useOnboardingStore((s) => s.contentType);

  useEffect(() => {
    if (onboardingStep !== 'done') return;
    // Store background color preference for new projects
    localStorage.setItem('ffx-default-bg-color', JSON.stringify(bgColor));
    // Store shape creation mode preference
    if (shapeMode) {
      localStorage.setItem('ffx-shape-creation-mode', shapeMode);
    }
    // Store content type preference
    if (contentType) {
      localStorage.setItem('ffx-default-video-format', contentType);
    }
  }, [onboardingStep, bgColor, shapeMode, contentType]);

  if (onboardingActive) {
    return <OnboardingFlow />;
  }

  return (
    <ContextMenuProvider>
      <ProjectApp editorComponent={Editor} />
      <ContextMenuRenderer />
    </ContextMenuProvider>
  );
}

export default App;
