// Central command registry for the Ctrl/Cmd+K palette. Each command is a plain
// {id, label, category, run} record whose run() dispatches the SAME store actions
// the keyboard shortcuts and menus use — the palette is a parallel discovery/
// invocation surface, not a re-implementation. Kept UI-store-free so the list can be
// built once and ranked by the pure fuzzy matcher.

import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import { useProjectStore } from '../../project-system';
import { useShapeToolStore, type ToolMode } from '../../store/shapeTool';
import { computeAlignment, computeDistribution, type AlignAxis, type DistributeMode } from '../../core/align';
import type { BooleanOp } from '../../core/pathOps';

export interface Command {
  id: string;
  label: string;
  category: string;
  /** Extra search terms (aliases) the fuzzy matcher also checks. */
  keywords?: string;
  /** Display-only shortcut hint (the actual binding lives in App.tsx keydown). */
  shortcut?: string;
  run: () => void;
}

// ── run() helpers (read live state at invocation time) ──────────────────────────
const ed = () => useEditorStore.getState();
const selectedLayers = () => {
  const s = ed();
  return s.composition.layers.filter((l) => s.selection.selectedIds.includes(l.id));
};
function align(axis: AlignAxis) {
  const frame = useTimelineStore.getState().currentFrame;
  ed().applyAlignResults(computeAlignment(axis, selectedLayers(), frame), `Align ${axis}`);
}
function distribute(mode: DistributeMode) {
  const frame = useTimelineStore.getState().currentFrame;
  ed().applyAlignResults(computeDistribution(mode, selectedLayers(), frame), 'Distribute Spacing');
}
function boolean(op: BooleanOp) { ed().booleanSelectedShapes(op); }
function tool(t: ToolMode) { useShapeToolStore.getState().setActiveTool(t); }
function deleteSelection() {
  const s = ed();
  const ids = s.selection.selectedIds.length ? s.selection.selectedIds : (s.selection.activeId ? [s.selection.activeId] : []);
  if (ids.length) s.removeLayers(ids);
}

/** The full command list. Rebuilt cheaply per palette open. */
export function buildCommands(): Command[] {
  const cmd = (id: string, label: string, category: string, run: () => void, shortcut?: string, keywords?: string): Command =>
    ({ id, label, category, run, shortcut, keywords });

  return [
    // Insert
    cmd('insert.rect', 'New Rectangle', 'Insert', () => ed().addRectangle(), undefined, 'shape square box'),
    cmd('insert.circle', 'New Ellipse', 'Insert', () => ed().addCircle(), undefined, 'shape circle oval'),
    cmd('insert.star', 'New Star', 'Insert', () => ed().addStar(), undefined, 'shape'),
    cmd('insert.polygon', 'New Polygon', 'Insert', () => ed().addPolygon(), undefined, 'shape path'),
    cmd('insert.text', 'New Text', 'Insert', () => ed().addText(), undefined, 'type label'),

    // Tools
    cmd('tool.select', 'Move Tool', 'Tools', () => tool('select'), undefined, 'pointer arrow'),
    cmd('tool.rect', 'Rectangle Tool', 'Tools', () => tool('rectangle'), undefined, 'draw shape'),
    cmd('tool.circle', 'Ellipse Tool', 'Tools', () => tool('circle'), undefined, 'draw shape'),
    cmd('tool.star', 'Star Tool', 'Tools', () => tool('star'), undefined, 'draw shape'),
    cmd('tool.pen', 'Pen Tool', 'Tools', () => tool('pen'), undefined, 'draw path vector'),

    // Edit
    cmd('edit.cut', 'Cut', 'Edit', () => ed().cutSelection(), 'Ctrl+X'),
    cmd('edit.copy', 'Copy', 'Edit', () => ed().copySelection(), 'Ctrl+C'),
    cmd('edit.paste', 'Paste', 'Edit', () => ed().pasteClipboard(false), 'Ctrl+V'),
    cmd('edit.pasteInPlace', 'Paste in Place', 'Edit', () => ed().pasteClipboard(true), 'Ctrl+Shift+V', 'paste here original'),
    cmd('edit.duplicate', 'Duplicate', 'Edit', () => ed().duplicateSelection(), 'Ctrl+D'),
    cmd('edit.delete', 'Delete', 'Edit', () => deleteSelection(), 'Del', 'remove'),
    cmd('edit.selectAll', 'Select All', 'Edit', () => ed().selectAllLayers(), 'Ctrl+A'),
    cmd('edit.deselect', 'Deselect All', 'Edit', () => ed().deselectAll(), 'Ctrl+Shift+A'),

    // Arrange
    cmd('arrange.group', 'Group Selection', 'Arrange', () => ed().createGroup(), 'Alt+G'),
    cmd('arrange.ungroup', 'Ungroup', 'Arrange', () => ed().ungroupSelection(), 'Alt+Shift+G'),
    cmd('arrange.precompose', 'Precompose Selection', 'Arrange', () => ed().precomposeSelection(), undefined, 'nest composition'),
    cmd('arrange.alignLeft', 'Align Left', 'Arrange', () => align('left'), 'Alt+A'),
    cmd('arrange.alignRight', 'Align Right', 'Arrange', () => align('right'), 'Alt+D'),
    cmd('arrange.alignTop', 'Align Top', 'Arrange', () => align('top'), 'Alt+W'),
    cmd('arrange.alignBottom', 'Align Bottom', 'Arrange', () => align('bottom'), 'Alt+S'),
    cmd('arrange.alignCenterH', 'Align Horizontal Centers', 'Arrange', () => align('centerH'), 'Alt+H', 'center'),
    cmd('arrange.alignCenterV', 'Align Vertical Centers', 'Arrange', () => align('centerV'), 'Alt+V', 'center'),
    cmd('arrange.distH', 'Distribute Horizontal Spacing', 'Arrange', () => distribute('horizontalBounds'), 'Ctrl+Alt+H'),
    cmd('arrange.distV', 'Distribute Vertical Spacing', 'Arrange', () => distribute('verticalBounds'), 'Ctrl+Alt+V'),

    // Path (boolean)
    cmd('path.union', 'Union', 'Path', () => boolean('union'), 'Alt+Shift+U', 'boolean combine merge'),
    cmd('path.subtract', 'Subtract', 'Path', () => boolean('difference'), 'Alt+Shift+S', 'boolean minus'),
    cmd('path.intersect', 'Intersect', 'Path', () => boolean('intersection'), 'Alt+Shift+I', 'boolean'),
    cmd('path.exclude', 'Exclude', 'Path', () => boolean('xor'), 'Alt+Shift+E', 'boolean xor difference'),
    cmd('path.flatten', 'Flatten', 'Path', () => ed().flattenSelectedShapes(), 'Ctrl+E', 'boolean bake path'),

    // View / Playback / History / File
    cmd('play.toggle', 'Play / Pause', 'Playback', () => {
      const ts = useTimelineStore.getState();
      if (ts.isPlaying) ts.pause(); else ts.play();
    }, 'Space'),
    cmd('history.undo', 'Undo', 'History', () => useHistoryStore.getState().undo(), 'Ctrl+Z'),
    cmd('history.redo', 'Redo', 'History', () => useHistoryStore.getState().redo(), 'Ctrl+Shift+Z'),
    cmd('file.save', 'Save Project', 'File', () => {
      const ps = useProjectStore.getState();
      if (ps.activeProjectId) ps.saveCurrentProject().catch(() => {});
    }, 'Ctrl+S'),
  ];
}
