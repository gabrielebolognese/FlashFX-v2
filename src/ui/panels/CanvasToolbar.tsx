import { useRef } from 'react';
import { useEditorStore } from '../../store/editor';
import { useShapeToolStore, type ShapeToolType, type VectorToolType } from '../../store/shapeTool';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import {
  MousePointer2,
  MousePointer,
  Circle,
  Square,
  Star,
  Type,
  Pen,
  PlusCircle,
  MinusCircle,
  Spline,
  Hexagon,
  Film,
  Image,
  Sparkles,
  Activity,
  Grid3x3,
  Rows3,
  Columns3,
  LayoutGrid,
  Container,
} from 'lucide-react';

type ToolAction =
  | { kind: 'select' }
  | { kind: 'shape'; shape: ShapeToolType }
  | { kind: 'vector'; tool: VectorToolType }
  | { kind: 'instant'; action: 'addText' | 'importVideo' | 'importImage' | 'addParticle' | 'addAnimationItem' | 'addFieldSampled' | 'addHBox' | 'addVBox' | 'addGrid' | 'addLayoutContainer' }
  | { kind: 'placeholder' };

interface ToolDef {
  icon: typeof MousePointer2;
  label: string;
  action: ToolAction;
  shortcut?: string;
  group: 'select' | 'shape' | 'vector' | 'media' | 'layout' | 'advanced';
}

const TOOLS: ToolDef[] = [
  { icon: MousePointer2, label: 'Select', action: { kind: 'select' }, shortcut: 'V', group: 'select' },
  { icon: Square, label: 'Rectangle', action: { kind: 'shape', shape: 'rectangle' }, shortcut: 'R', group: 'shape' },
  { icon: Circle, label: 'Ellipse', action: { kind: 'shape', shape: 'circle' }, shortcut: 'E', group: 'shape' },
  { icon: Star, label: 'Star', action: { kind: 'shape', shape: 'star' }, group: 'shape' },
  { icon: Hexagon, label: 'Polygon', action: { kind: 'shape', shape: 'polygon' }, group: 'shape' },
  { icon: Pen, label: 'Pen', action: { kind: 'vector', tool: 'pen' }, shortcut: 'P', group: 'vector' },
  { icon: MousePointer, label: 'Direct Select', action: { kind: 'vector', tool: 'directSelect' }, shortcut: 'A', group: 'vector' },
  { icon: PlusCircle, label: 'Add Point', action: { kind: 'vector', tool: 'addPoint' }, group: 'vector' },
  { icon: MinusCircle, label: 'Delete Point', action: { kind: 'vector', tool: 'deletePoint' }, group: 'vector' },
  { icon: Spline, label: 'Convert Point', action: { kind: 'vector', tool: 'convertPoint' }, group: 'vector' },
  { icon: Type, label: 'Text', action: { kind: 'instant', action: 'addText' }, shortcut: 'T', group: 'media' },
  { icon: Image, label: 'Image', action: { kind: 'instant', action: 'importImage' }, group: 'media' },
  { icon: Film, label: 'Video', action: { kind: 'instant', action: 'importVideo' }, group: 'media' },
  { icon: Sparkles, label: 'Particle', action: { kind: 'instant', action: 'addParticle' }, group: 'advanced' },
  { icon: Activity, label: 'Animation Item', action: { kind: 'instant', action: 'addAnimationItem' }, group: 'advanced' },
  { icon: Grid3x3, label: 'Field Sampled', action: { kind: 'instant', action: 'addFieldSampled' }, group: 'advanced' },
  { icon: Columns3, label: 'HBox', action: { kind: 'instant', action: 'addHBox' }, group: 'layout' },
  { icon: Rows3, label: 'VBox', action: { kind: 'instant', action: 'addVBox' }, group: 'layout' },
  { icon: LayoutGrid, label: 'Grid', action: { kind: 'instant', action: 'addGrid' }, group: 'layout' },
  { icon: Container, label: 'Layout Container', action: { kind: 'instant', action: 'addLayoutContainer' }, group: 'layout' },
];

export function CanvasToolbar() {
  const addText = useEditorStore((s) => s.addText);
  const addVideo = useEditorStore((s) => s.addVideo);
  const addImage = useEditorStore((s) => s.addImage);
  const addParticleLayer = useEditorStore((s) => s.addParticleLayer);
  const addFieldSampledLayer = useEditorStore((s) => s.addFieldSampledLayer);
  const addAnimationItem = useEditorStore((s) => s.addAnimationItem);
  const addLayoutObject = useEditorStore((s) => s.addLayoutObject);
  const addLayoutContainer = useEditorStore((s) => s.addLayoutContainer);
  const activeTool = useShapeToolStore((s) => s.activeTool);
  const setActiveTool = useShapeToolStore((s) => s.setActiveTool);
  const clearTool = useShapeToolStore((s) => s.clearTool);

  const addRectangle = useEditorStore((s) => s.addRectangle);
  const addCircle = useEditorStore((s) => s.addCircle);
  const addStar = useEditorStore((s) => s.addStar);
  const addPolygon = useEditorStore((s) => s.addPolygon);

  const currentProjectId = useProjectStore((s) => s.activeProjectId);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const getShapeMode = () => localStorage.getItem('ffx-shape-creation-mode') || 'drag';

  const handleClick = (tool: ToolDef) => {
    switch (tool.action.kind) {
      case 'select':
        clearTool();
        break;
      case 'shape':
        if (getShapeMode() === 'fast') {
          clearTool();
          if (tool.action.shape === 'rectangle') addRectangle();
          else if (tool.action.shape === 'circle') addCircle();
          else if (tool.action.shape === 'star') addStar();
          else if (tool.action.shape === 'polygon') addPolygon();
        } else {
          setActiveTool(tool.action.shape);
        }
        break;
      case 'vector':
        setActiveTool(tool.action.tool);
        break;
      case 'instant':
        clearTool();
        if (tool.action.action === 'addText') addText();
        else if (tool.action.action === 'importVideo') videoInputRef.current?.click();
        else if (tool.action.action === 'importImage') imageInputRef.current?.click();
        else if (tool.action.action === 'addParticle') addParticleLayer();
        else if (tool.action.action === 'addAnimationItem') addAnimationItem('Progress Bar');
        else if (tool.action.action === 'addFieldSampled') addFieldSampledLayer();
        else if (tool.action.action === 'addHBox') addLayoutObject('hbox');
        else if (tool.action.action === 'addVBox') addLayoutObject('vbox');
        else if (tool.action.action === 'addGrid') addLayoutObject('grid');
        else if (tool.action.action === 'addLayoutContainer') addLayoutContainer();
        break;
      case 'placeholder':
        break;
    }
  };

  const isToolActive = (tool: ToolDef): boolean => {
    if (tool.action.kind === 'select') return activeTool === 'select';
    if (tool.action.kind === 'shape') return activeTool === tool.action.shape;
    if (tool.action.kind === 'vector') return activeTool === tool.action.tool;
    return false;
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const projectId = currentProjectId || 'default';
    await addVideo(file, projectId);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const projectId = currentProjectId || 'default';
    await addImage(file, projectId);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const groups = ['select', 'shape', 'vector', 'media', 'layout', 'advanced'] as const;

  return (
    <div className="h-[28px] min-h-[28px] flex items-center gap-0.5 px-2 bg-[#081220] border-b border-[#1a2a42] select-none">
      {groups.map((group, gi) => (
        <div key={group} className="flex items-center">
          {gi > 0 && <div className="w-px h-4 bg-[#1a2a42] mx-1.5" />}
          {TOOLS.filter((t) => t.group === group).map((tool) => {
            const active = isToolActive(tool);
            return (
              <button
                key={tool.label}
                onClick={() => handleClick(tool)}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  active
                    ? 'bg-[#f7b500]/10 text-[#f7b500]'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-[#1a2a42]'
                }`}
              >
                <tool.icon size={13} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      ))}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/*"
        className="hidden"
        onChange={handleVideoSelect}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageSelect}
      />
    </div>
  );
}
