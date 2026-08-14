import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Toolbar } from './ui/panels/Toolbar';
import { SceneSwitcher } from './ui/panels/SceneSwitcher';
import { PanelLayout } from './ui/layout/PanelLayout';
import { BuilderLayout } from './ui/layout/BuilderLayout';
import { useEditorStore } from './store/editor';
import { useHistoryStore } from './store/history';
import { useTimelineStore } from './store/timeline';
import { usePanelStore } from './store/panels';
import { ProjectApp, useProjectStore } from './project-system';
import { useAnimationBuilderStore } from './animation-builder';
import { ArrowLeft, LayoutGrid, Settings2, GraduationCap, Sparkles, Download, ListChecks } from 'lucide-react';
import { ExportModal } from './ui/panels/ExportModal';
import { AiChatPanel } from './ui/panels/AiChatPanel';
import { TasksPanel } from './ui/panels/TasksPanel';
import { ResetEditorDialog } from './ui/recovery/ResetEditorDialog';
import { EmergencyRecoveryOverlay } from './ui/recovery/EmergencyRecoveryOverlay';
import { CaptionGenerationModal } from './ui/panels/CaptionGenerationModal';
import { AutoCaptionProgress } from './ui/panels/AutoCaptionProgress';
import { SubtitleReviewPanel } from './ui/panels/SubtitleReviewPanel';
import { SilenceStripperModal } from './ui/panels/SilenceStripperModal';
import { RenameModal } from './ui/panels/RenameModal';
import { useRenameModalStore } from './store/renameModal';
import { ClipContextMenu } from './ui/panels/ClipContextMenu';
import { ContextMenuProvider, ContextMenuRenderer } from './ui/context-menu';
import { SettingsPanel, SettingsCssInjector } from './settings';
import { useSettingsStore, getSettingValue } from './settings/store';
import { nudgeDelta } from './core/nudge';
import { computeAlignment, computeDistribution, type AlignAxis, type DistributeMode } from './core/align';
import { CommandPalette } from './ui/panels/CommandPalette';
import { useCommandPaletteStore } from './ui/commands/store';
import { useShapeToolStore, isVectorTool } from './store/shapeTool';
import { usePathEditStore } from './store/pathEdit';
import { resolveExitStep } from './core/selection';
import { OnboardingFlow, useOnboardingStore } from './onboarding';
import { TutorialRunner } from './tutorial/TutorialRunner';
import { launchTutorial } from './tutorial/launch';
import { AgentBuildOverlay } from './ui/agent-build/AgentBuildOverlay';

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
  const aiChatOpen = usePanelStore((s) => s.aiChatOpen);
  const toggleAiChat = usePanelStore((s) => s.toggleAiChat);
  const tasksOpen = usePanelStore((s) => s.tasksOpen);
  const toggleTasks = usePanelStore((s) => s.toggleTasks);
  const [showExport, setShowExport] = useState(false);
  const aiEditorWorkspace = usePanelStore((s) => s.editorWorkspace);
  // AI chat works in every mode except preview/review (that mode is a full-screen player).
  const showAiChat = aiChatOpen && !(workspace === 'editor' && aiEditorWorkspace === 'review');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inputType = target.tagName === 'INPUT' ? (target.getAttribute('type') || 'text').toLowerCase() : '';
      // A numeric "data box" (DragInput scrubby field, or a number/range input): NOT free text.
      // Space should play the video here, not type a space (the user's complaint).
      const isDataField = target.tagName === 'INPUT' && (target.dataset.scrubby === 'true' || inputType === 'number' || inputType === 'range');
      // Genuine text entry — where a space is a real character and Esc exits the field. This is the
      // "text editing mode" exception (e.g. the text-layer content textarea, name/search fields).
      const isTextEntry =
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target.tagName === 'INPUT' && !isDataField && ['text', 'search', 'url', 'email', 'password'].includes(inputType));
      // Any focused input/textarea/contenteditable — used to gate letter-key shortcuts so they
      // don't fire while a field (data OR text) is focused.
      const isTextInput = isTextEntry || isDataField || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl/Cmd+S → save (works from anywhere, incl. text inputs). Without this,
      // the reflex to save opens the browser's Save-Page dialog and persists nothing.
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !e.shiftKey) {
        e.preventDefault();
        const { activeProjectId, saveCurrentProject } = useProjectStore.getState();
        if (activeProjectId) saveCurrentProject().catch((err) => console.error('Save failed:', err));
        return;
      }

      // Command palette: Ctrl/Cmd+/ (primary, Figma-style) or Ctrl/Cmd+K (alias).
      // Ctrl+/ opens from anywhere; Ctrl+K defers to native/link behavior in a text
      // input (browser address-bar + hyperlink both claim Cmd+K).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
          && (e.key === '/' || e.key === 'k' || e.key === 'K')) {
        if ((e.key === 'k' || e.key === 'K') && isTextInput) return;
        e.preventDefault();
        useCommandPaletteStore.getState().togglePalette();
        return;
      }

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

      // M19 — Batch rename (Ctrl/Cmd+R) for a multi-selection. preventDefault so the browser
      // doesn't reload. Single-layer rename stays on F2.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R') && !isTextInput) {
        if (useEditorStore.getState().selection.selectedIds.length >= 2) {
          e.preventDefault();
          useRenameModalStore.getState().open();
          return;
        }
      }

      // M12 — Shift+Enter ascends one group/isolation level. Handled BEFORE the plain-Enter
      // branch below (which matches Enter without a shift guard) so it isn't swallowed.
      if (e.key === 'Enter' && e.shiftKey && !isTextInput) {
        const st = useEditorStore.getState();
        if (st.activeGroupId || st.composition.layers.find((l) => l.id === st.selection.activeId)?.parentId) {
          e.preventDefault();
          const r = resolveExitStep({ activeId: st.selection.activeId, activeGroupId: st.activeGroupId, layers: st.composition.layers });
          st._setActiveGroup(r.activeGroupId);
          st.selectLayer(r.selectId, false, 'canvas');
          return;
        }
      }
      // Enter → enter group isolation (if a group is active) else vector edit mode on the
      // selected shape (auto object-to-path, then Direct Select). Esc → exit isolation, then
      // exit edit mode back to the Move tool.
      if (e.key === 'Enter' && !e.shiftKey && !isTextInput) {
        const st = useEditorStore.getState();
        const active = st.composition.layers.find((l) => l.id === st.selection.activeId);
        if (active && active.type === 'group') {
          e.preventDefault();
          st.enterGroupIsolation(active.id);
          return;
        }
        if (active && active.type === 'shape') {
          e.preventDefault();
          if (active.shape.type !== 'polygon') st.convertShapeToPath(active.id);
          useShapeToolStore.getState().setActiveTool('directSelect');
          return;
        }
      }
      if (e.key === 'Escape') {
        // In a field (text OR data): Esc exits the field first. In text editing this is the only
        // way out; in a data box it commits/cancels the edit. A SECOND Esc (nothing focused) then
        // deselects. Don't preventDefault — let the field's own Esc-cancel run too.
        if (isTextEntry || isDataField) {
          target.blur();
          return;
        }
        // Exit group isolation first (before the tool reset), matching Figma's Esc-pops-out.
        if (useEditorStore.getState().activeGroupId) {
          e.preventDefault();
          useEditorStore.getState().exitGroupIsolation();
          return;
        }
        if (useShapeToolStore.getState().activeTool !== 'select') {
          e.preventDefault();
          useShapeToolStore.getState().setActiveTool('select');
          return;
        }
        // Nothing else claimed Esc → deselect everything (canvas + timeline), any count.
        const st = useEditorStore.getState();
        const sel = st.selection;
        if (sel.selectedIds.length > 0 || sel.activeId || (sel.selectedKeyframes?.length ?? 0) > 0 || (sel.selectedCurvePoints?.length ?? 0) > 0) {
          e.preventDefault();
          st.deselectAll();
        }
        return;
      }

      // Trim operations
      if (!isTextInput) {
        // Boolean shape ops — Figma-standard Alt+Shift+U/S/I/E (Union/Subtract/
        // Intersect/Exclude) — and Flatten on Ctrl/Cmd+E. Alt mangles e.key on some
        // keyboard layouts, so match the physical key via e.code.
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
          const boolOp =
            e.code === 'KeyU' ? 'union' :
            e.code === 'KeyS' ? 'difference' :
            e.code === 'KeyI' ? 'intersection' :
            e.code === 'KeyE' ? 'xor' : null;
          if (boolOp) {
            e.preventDefault();
            useEditorStore.getState().booleanSelectedShapes(boolOp);
            return;
          }
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'e' || e.key === 'E')) {
          e.preventDefault();
          useEditorStore.getState().flattenSelectedShapes();
          return;
        }
        // M17 — Outline Text (Figma/Illustrator Ctrl+Shift+O): convert a text layer to editable
        // glyph paths. Gated on an active text layer.
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          const st = useEditorStore.getState();
          const active = st.composition.layers.find((l) => l.id === st.selection.activeId);
          if (active?.type === 'text') {
            e.preventDefault();
            st.outlineTextLayer(active.id);
            return;
          }
        }
        // M18 — Pencil / freehand tool (Shift+P, Figma parity).
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'P' || e.code === 'KeyP')) {
          e.preventDefault();
          useShapeToolStore.getState().setActiveTool('pencil');
          return;
        }
        // M11 — Copy/Paste Properties (Figma Ctrl+Alt+C / Ctrl+Alt+V). Matched by physical
        // e.code (Alt mangles e.key) and placed BEFORE plain Ctrl+C/V so they don't fall
        // through to copySelection/pasteClipboard. Paste is GUARDED on a properties
        // clipboard: with no bundle copied, Ctrl+Alt+V falls through to distribute-vertical
        // (the M5 align binding), so that muscle memory is only shadowed while restyling.
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyC') {
          e.preventDefault();
          useEditorStore.getState().copyLayerProperties();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyV' && useEditorStore.getState().propertiesClipboard) {
          e.preventDefault();
          useEditorStore.getState().pasteLayerProperties();
          return;
        }
        // M15 — Tidy Up (Figma Ctrl+Alt+T): infer a row/column/grid + equalize spacing. Gated
        // to a multi-selection (e.code — Alt mangles e.key) so it never fires for 0/1 layers.
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyT' && selection.selectedIds.length >= 2) {
          e.preventDefault();
          useEditorStore.getState().tidyUpSelection();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          e.preventDefault();
          copySelection();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
          e.preventDefault();
          pasteClipboard(e.shiftKey); // Shift = paste in place (original coords)
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X') && !e.shiftKey) {
          e.preventDefault();
          useEditorStore.getState().cutSelection();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          if (e.shiftKey) useEditorStore.getState().deselectAll();
          else useEditorStore.getState().selectAllLayers();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
          e.preventDefault();
          duplicateSelection();
          return;
        }
        // Join paths (Ctrl/Cmd+J): two open polygon layers → concatenate; one open path
        // → close it (merging coincident endpoints). The store actions validate types.
        if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
          const st = useEditorStore.getState();
          const isOpenPoly = (id: string | undefined) => {
            const l = id ? st.composition.layers.find((x) => x.id === id) : undefined;
            return !!l && l.type === 'shape' && l.shape.type === 'polygon' && !l.shape.closed;
          };
          const polys = selection.selectedIds.filter((id) => {
            const l = st.composition.layers.find((x) => x.id === id);
            return l?.type === 'shape' && l.shape.type === 'polygon';
          });
          if (polys.length === 2) {
            e.preventDefault();
            st.concatPathLayers(polys[0], polys[1]);
            return;
          }
          const activeId = selection.activeId ?? selection.selectedIds[0];
          if (isOpenPoly(activeId)) {
            e.preventDefault();
            st.closePath(activeId!);
            return;
          }
        }
        // Arrow-key nudge (Shift = big nudge), only with a selection so the keys
        // stay free otherwise. Amounts are configurable in Settings › Editor.
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
            && !e.ctrlKey && !e.metaKey && !e.altKey
            && (selection.selectedIds.length > 0 || selection.activeId)) {
          const small = getSettingValue<number>('editor.smallNudge') ?? 1;
          const big = getSettingValue<number>('editor.bigNudge') ?? 10;
          const d = nudgeDelta(e.key, e.shiftKey, small, big);
          if (d) {
            e.preventDefault();
            useEditorStore.getState().nudgeSelection(d.dx, d.dy);
            return;
          }
        }
        // Keyboard align (Figma Alt+A/D/W/S/H/V) + distribute (Ctrl+Alt+H/V), gated
        // to a multi-selection so single-clip trim (which also uses Alt+S) is
        // unaffected. e.code (Alt mangles e.key). Placed BEFORE the trim keys so
        // Alt+S aligns-bottom when ≥2 layers are selected, else falls through to trim.
        if (e.altKey && !e.shiftKey && selection.selectedIds.length >= 2) {
          const alignAxis: Record<string, AlignAxis> = { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyH: 'centerH', KeyV: 'centerV' };
          if (!e.ctrlKey && !e.metaKey && alignAxis[e.code]) {
            e.preventDefault();
            const st = useEditorStore.getState();
            const frame = useTimelineStore.getState().currentFrame;
            const layers = st.composition.layers.filter((l) => selection.selectedIds.includes(l.id));
            st.applyAlignResults(computeAlignment(alignAxis[e.code], layers, frame), `Align ${alignAxis[e.code]}`);
            return;
          }
          if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyH' || e.code === 'KeyV') && selection.selectedIds.length >= 3) {
            e.preventDefault();
            const mode: DistributeMode = e.code === 'KeyH' ? 'horizontalBounds' : 'verticalBounds';
            const st = useEditorStore.getState();
            const frame = useTimelineStore.getState().currentFrame;
            const layers = st.composition.layers.filter((l) => selection.selectedIds.includes(l.id));
            st.applyAlignResults(computeDistribution(mode, layers, frame), 'Distribute Spacing');
            return;
          }
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

      // Spacebar toggles playback everywhere EXCEPT genuine text entry (text-layer content,
      // name/search fields). In a numeric data box (DragInput/number/range) Space plays too —
      // preventDefault stops the stray space char the user was seeing.
      if (e.key === ' ') {
        if (isTextEntry) return;
        e.preventDefault();
        const ts = useTimelineStore.getState();
        if (ts.isPlaying) ts.pause();
        else ts.play();
        return;
      }
      // Vector edit: Delete/Backspace on selected anchors deletes the points, not the
      // layer. Shift = delete-and-heal (refit the neighbours' curve); plain = break
      // (drop the point), matching Figma. Only fires while a vector tool is active.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput) {
        const st = useEditorStore.getState();
        const tool = useShapeToolStore.getState().activeTool;
        const active = st.composition.layers.find((l) => l.id === st.selection.activeId);
        const verts = usePathEditStore.getState().selectedVertices;
        if (isVectorTool(tool) && active?.type === 'shape' && active.shape.type === 'polygon' && verts.length > 0) {
          e.preventDefault();
          // Highest index first so earlier indices stay valid across the sequence.
          for (const idx of [...verts].sort((a, b) => b - a)) {
            if (e.shiftKey) st.healDeletePoint(active.id, idx);
            else st.deletePathPoint(active.id, idx);
          }
          usePathEditStore.getState().clearSelection();
          return;
        }
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
        {workspace === 'editor' && <SceneSwitcher />}
        {/* Animation Builder mode toggle — HIDDEN from the public UI (the builder is not
            production-ready). The BuilderLayout + setWorkspace path is kept intact so it can be
            re-exposed by restoring this button. */}
        <button
          onClick={toggleAiChat}
          className={`flex items-center gap-1.5 px-3 transition-colors border-l border-[#1a2a42] ${
            aiChatOpen
              ? 'bg-surface-4 text-primary border-b-2 border-b-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
          }`}
          title="Toggle AI Assistant"
        >
          <Sparkles size={13} />
          <span className="text-[11px] font-medium">AI</span>
        </button>
        <button
          onClick={toggleTasks}
          className={`flex items-center gap-1.5 px-3 transition-colors border-l border-[#1a2a42] ${
            tasksOpen
              ? 'bg-surface-4 text-primary border-b-2 border-b-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
          }`}
          title="Toggle Tasks log"
        >
          <ListChecks size={13} />
          <span className="text-[11px] font-medium">Tasks</span>
        </button>
        {/* Prominent single Export entry point (replaces the old Render + Export toolbar buttons). */}
        {workspace === 'editor' && (
          <button
            onClick={() => setShowExport(true)}
            data-tutorial-id="export"
            className="flex items-center gap-1.5 px-4 border-l border-[#1a2a42] bg-accent hover:bg-accent-hover text-on-accent text-[11px] font-semibold transition-colors"
            title="Export video"
          >
            <Download size={13} strokeWidth={2.5} />
            <span>Export</span>
          </button>
        )}
        {workspace === 'editor' && <PanelsMenu />}
      </div>
      <div className="flex-1 flex flex-row min-h-0 min-w-0">
        {workspace === 'editor' ? <PanelLayout /> : <BuilderLayout />}
        {showAiChat && <AiChatPanel />}
        {tasksOpen && <TasksPanel />}
      </div>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      <ResetEditorDialog />
      <EmergencyRecoveryOverlay />
      <ClipContextMenu />
      <CaptionGenerationModal />
      <AutoCaptionProgress />
      <SubtitleReviewPanel />
      <SilenceStripperModal />
      <RenameModal />
      <SettingsPanel />
      <SettingsCssInjector />
      <CommandPalette />
      <TutorialRunner />
      <Suspense fallback={null}>
        <LazyIntroPopup />
      </Suspense>
      <AgentBuildOverlay />
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
              <span className={`w-2 h-2 rounded-full ${panels[item.id].visible ? 'bg-accent' : 'bg-slate-700'}`} />
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
            className="w-full px-3 py-1.5 text-[11px] text-accent hover:bg-white/[0.04] transition-colors text-left"
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
      {/* Small corner button re-launches the guided tutorial (from a fresh project). */}
      <button
        onClick={() => { void launchTutorial(); }}
        title="Replay the tutorial"
        aria-label="Replay the tutorial"
        className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-[#0a1628]/90 border border-[#1a2a42] text-slate-400 hover:text-slate-100 hover:border-[#2a3a52] shadow-lg backdrop-blur-sm transition-colors"
      >
        <GraduationCap size={14} />
        <span className="text-[11px] font-medium">Tutorial</span>
      </button>
    </ContextMenuProvider>
  );
}

export default App;
