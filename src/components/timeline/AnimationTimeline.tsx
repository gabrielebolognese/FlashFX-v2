import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, Diamond, ZoomIn, ZoomOut, MousePointer, Trash, X, Magnet, Settings, Film, Bookmark } from 'lucide-react';
import SaveKeyframePresetModal from '../modals/SaveKeyframePresetModal';
import { KeyframePresetService } from '../../services/KeyframePresetService';
import {
  useAnimation, usePlayback,
  AnimatableProperty, Keyframe, EasingType, EASING_CONFIGS, Sequence,
  globalToLocalTime, localToGlobalTime,
  getPropertiesForElement, getCategoriesForElement, getPropertyValueFromElement,
  KeyframeableProperty,
} from '../../animation-engine';
import { DesignElement } from '../../types/design';
import KeyframeIcon from '../animation/KeyframeIcon';
import CreateSequenceModal from '../sequence/CreateSequenceModal';
import PlayheadIndicator from './PlayheadIndicator';
import { FRAME_RATE_PRESETS } from '../../types/sequence';
import { formatTimeCode } from '../../utils/formatTimeCode';

interface AnimationTimelineProps {
  elements: DesignElement[];
  activeSequence?: Sequence | null;
  onEditSequence?: (sequence: Sequence) => void;
  multipleSelected?: boolean;
}

const EASING_OPTIONS: { value: EasingType; label: string }[] = EASING_CONFIGS.map(config => ({
  value: config.type,
  label: config.label
}));

type ClickMode = 'delete' | 'select';

const SNAP_THRESHOLD = 0.2;
const LAYOUT_ZOOM = 0.8;

const AnimationTimeline: React.FC<AnimationTimelineProps> = ({ elements, activeSequence, onEditSequence, multipleSelected = false }) => {
  const { state, addKeyframe, deleteKeyframe, deleteTrack, deleteAllKeyframes, updateKeyframe, selectKeyframes, setPixelsPerSecond, getAnimatedElementState } = useAnimation();
  const { seekTo, isPlaying: _isPlaying, currentTime, duration, fps } = usePlayback();

  const [showSequenceModal, setShowSequenceModal] = useState(false);

  const { pixelsPerSecond, selectedClipId, selectedKeyframeIds } = state.timeline;
  const propertiesScrollRef = useRef<HTMLDivElement>(null);
  const keyframesScrollRef = useRef<HTMLDivElement>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['transform', 'fill', 'stroke']);
  const [editingKeyframe, setEditingKeyframe] = useState<{ elementId: string; property: AnimatableProperty; keyframe: Keyframe; propConfig: KeyframeableProperty } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [hoveredKeyframeId, setHoveredKeyframeId] = useState<string | null>(null);
  const [clickMode, setClickMode] = useState<ClickMode>('select');
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const keyframePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const didDragSelectionRef = useRef(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [snapToKeyframes, setSnapToKeyframes] = useState(true);
  const [isSnappedToKeyframe, setIsSnappedToKeyframe] = useState(false);
  const [highlightedKeyframeIds, setHighlightedKeyframeIds] = useState<Set<string>>(new Set());

  const selectedElement = useMemo(() => {
    return elements.find((el) => el.id === selectedClipId) || null;
  }, [elements, selectedClipId]);

  const selectedAnimation = useMemo(() => {
    return selectedClipId ? state.animations[selectedClipId] : null;
  }, [state.animations, selectedClipId]);

  const elementProperties = useMemo(() => {
    if (!selectedElement) return [];
    return getPropertiesForElement(selectedElement);
  }, [selectedElement]);

  const elementCategories = useMemo(() => {
    if (!selectedElement) return [];
    return getCategoriesForElement(selectedElement);
  }, [selectedElement]);

  const propertiesByCategory = useMemo(() => {
    const grouped: Record<string, KeyframeableProperty[]> = {};
    for (const cat of elementCategories) {
      grouped[cat.id] = elementProperties.filter(p => p.category === cat.id);
    }
    return grouped;
  }, [elementCategories, elementProperties]);

  const getAllKeyframeTimes = useCallback(() => {
    const times: number[] = [];
    if (selectedAnimation) {
      const clipStart = selectedAnimation.clipStart;
      selectedAnimation.tracks.forEach(track => {
        track.keyframes.forEach(kf => {
          const globalTime = localToGlobalTime(kf.time, clipStart);
          if (!times.includes(globalTime)) {
            times.push(globalTime);
          }
        });
      });
    }
    return times.sort((a, b) => a - b);
  }, [selectedAnimation]);

  const findNearestKeyframe = useCallback((time: number): number | null => {
    if (!snapToKeyframes) return null;
    const keyframeTimes = getAllKeyframeTimes();
    if (keyframeTimes.length === 0) return null;
    let nearestTime: number | null = null;
    let minDistance = SNAP_THRESHOLD;
    keyframeTimes.forEach(kfTime => {
      const distance = Math.abs(time - kfTime);
      if (distance < minDistance) {
        minDistance = distance;
        nearestTime = kfTime;
      }
    });
    return nearestTime;
  }, [snapToKeyframes, getAllKeyframeTimes]);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (didDragSelectionRef.current) {
      didDragSelectionRef.current = false;
      return;
    }
    if (keyframesScrollRef.current && pixelsPerSecond > 0) {
      const rect = keyframesScrollRef.current.getBoundingClientRect();
      const scrollLeft = keyframesScrollRef.current.scrollLeft;
      const x = (e.clientX - rect.left) / LAYOUT_ZOOM + scrollLeft;
      const time = x / pixelsPerSecond;
      seekTo(Math.max(0, Math.min(time, duration)));
      setIsSnappedToKeyframe(false);
      if (selectedKeyframeIds.length > 0) {
        selectKeyframes([]);
      }
    }
  }, [pixelsPerSecond, duration, seekTo, selectedKeyframeIds, selectKeyframes]);

  const handleSelectionBoxStart = useCallback((e: React.MouseEvent) => {
    if (!keyframesScrollRef.current) return;
    const rect = keyframesScrollRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / LAYOUT_ZOOM;
    const y = (e.clientY - rect.top) / LAYOUT_ZOOM;
    didDragSelectionRef.current = false;
    setIsBoxSelecting(true);
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  const handleSelectionBoxMove = useCallback((e: React.MouseEvent) => {
    if (!isBoxSelecting || !selectionBox || !keyframesScrollRef.current) return;
    const rect = keyframesScrollRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / LAYOUT_ZOOM;
    const y = (e.clientY - rect.top) / LAYOUT_ZOOM;
    const dragDistance = Math.sqrt(Math.pow(x - selectionBox.startX, 2) + Math.pow(y - selectionBox.startY, 2));
    if (dragDistance > 3) didDragSelectionRef.current = true;
    setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null);
    const scrollLeft = keyframesScrollRef.current.scrollLeft;
    const scrollTop = keyframesScrollRef.current.scrollTop;
    const minX = Math.min(selectionBox.startX, x) + scrollLeft;
    const maxX = Math.max(selectionBox.startX, x) + scrollLeft;
    const minY = Math.min(selectionBox.startY, y) + scrollTop;
    const maxY = Math.max(selectionBox.startY, y) + scrollTop;
    const highlighted = new Set<string>();
    const keyframeSize = 8;
    keyframePositionsRef.current.forEach((pos, id) => {
      const kfLeft = pos.x - keyframeSize;
      const kfRight = pos.x + keyframeSize;
      const kfTop = pos.y - keyframeSize;
      const kfBottom = pos.y + keyframeSize;
      const intersects = !(kfRight < minX || kfLeft > maxX || kfBottom < minY || kfTop > maxY);
      if (intersects) highlighted.add(id);
    });
    setHighlightedKeyframeIds(highlighted);
  }, [isBoxSelecting, selectionBox]);

  const handleSelectionBoxEnd = useCallback(() => {
    if (!isBoxSelecting || !selectionBox || !keyframesScrollRef.current) {
      setIsBoxSelecting(false);
      setSelectionBox(null);
      setHighlightedKeyframeIds(new Set());
      return;
    }
    const scrollLeft = keyframesScrollRef.current.scrollLeft;
    const scrollTop = keyframesScrollRef.current.scrollTop;
    const minX = Math.min(selectionBox.startX, selectionBox.endX) + scrollLeft;
    const maxX = Math.max(selectionBox.startX, selectionBox.endX) + scrollLeft;
    const minY = Math.min(selectionBox.startY, selectionBox.endY) + scrollTop;
    const maxY = Math.max(selectionBox.startY, selectionBox.endY) + scrollTop;
    const selectedIds = new Set<string>();
    const keyframeSize = 8;
    keyframePositionsRef.current.forEach((pos, id) => {
      const kfLeft = pos.x - keyframeSize;
      const kfRight = pos.x + keyframeSize;
      const kfTop = pos.y - keyframeSize;
      const kfBottom = pos.y + keyframeSize;
      const intersects = !(kfRight < minX || kfLeft > maxX || kfBottom < minY || kfTop > maxY);
      if (intersects) selectedIds.add(id);
    });
    if (selectedIds.size > 0) {
      selectKeyframes(Array.from(selectedIds));
      setNotification(`Selected ${selectedIds.size} keyframe(s)`);
      setTimeout(() => setNotification(null), 1500);
    }
    setIsBoxSelecting(false);
    setSelectionBox(null);
    setHighlightedKeyframeIds(new Set());
  }, [isBoxSelecting, selectionBox, selectKeyframes]);

  const handlePropertiesScroll = useCallback(() => {
    if (propertiesScrollRef.current && keyframesScrollRef.current) {
      keyframesScrollRef.current.scrollTop = propertiesScrollRef.current.scrollTop;
    }
  }, []);

  const handleKeyframesScroll = useCallback(() => {
    if (propertiesScrollRef.current && keyframesScrollRef.current) {
      propertiesScrollRef.current.scrollTop = keyframesScrollRef.current.scrollTop;
    }
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]
    );
  }, []);

  const getPropertyValue = useCallback((property: string): number | string => {
    if (!selectedElement) return 0;
    const animatedOverrides = getAnimatedElementState(selectedElement);
    const visualElement = { ...selectedElement, ...animatedOverrides };
    return getPropertyValueFromElement(property, visualElement as typeof selectedElement);
  }, [selectedElement, getAnimatedElementState]);

  const handleAddKeyframe = useCallback((property: string) => {
    if (!selectedElement || !selectedClipId || !selectedAnimation) return;
    const currentValue = getPropertyValue(property);
    const localTime = globalToLocalTime(currentTime, selectedAnimation.clipStart);
    addKeyframe(selectedClipId, property as AnimatableProperty, localTime, currentValue, 'ease-out');
  }, [selectedElement, selectedClipId, selectedAnimation, currentTime, addKeyframe, getPropertyValue]);

  const handleAddAllKeyframes = useCallback(() => {
    if (!selectedElement || !selectedClipId || !selectedAnimation) {
      setNotification('No clip selected. Please select a clip first.');
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    const localTime = globalToLocalTime(currentTime, selectedAnimation.clipStart);
    let keyframesAdded = 0;
    elementProperties.forEach((prop) => {
      const currentValue = getPropertyValue(prop.property);
      addKeyframe(selectedClipId, prop.property as AnimatableProperty, localTime, currentValue, 'ease-out');
      keyframesAdded++;
    });
    setNotification(`Added ${keyframesAdded} keyframes at ${currentTime.toFixed(2)}s`);
    setTimeout(() => setNotification(null), 3000);
  }, [selectedElement, selectedClipId, selectedAnimation, currentTime, addKeyframe, getPropertyValue, elementProperties]);

  const handleDeleteTrack = useCallback((property: string) => {
    if (!selectedClipId) return;
    deleteTrack(selectedClipId, property as AnimatableProperty);
  }, [selectedClipId, deleteTrack]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        handleAddAllKeyframes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAddAllKeyframes]);

  const handleKeyframeClick = useCallback((elementId: string, property: string, keyframe: Keyframe, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedClipId) return;
    if (clickMode === 'delete') {
      deleteKeyframe(selectedClipId, property as AnimatableProperty, keyframe.id);
      const globalKfTime = localToGlobalTime(keyframe.time, selectedAnimation?.clipStart ?? 0);
      setNotification(`Keyframe deleted at ${globalKfTime.toFixed(2)}s`);
      setTimeout(() => setNotification(null), 2000);
    } else {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const currentSelected = new Set(selectedKeyframeIds);
        if (currentSelected.has(keyframe.id)) {
          currentSelected.delete(keyframe.id);
        } else {
          currentSelected.add(keyframe.id);
        }
        selectKeyframes(Array.from(currentSelected));
      } else {
        selectKeyframes([keyframe.id]);
      }
      setNotification(`${selectedKeyframeIds.length + 1} keyframe(s) selected`);
      setTimeout(() => setNotification(null), 1500);
    }
  }, [selectedClipId, deleteKeyframe, clickMode, selectKeyframes, selectedKeyframeIds, selectedAnimation]);

  const handleSelectPropertyKeyframes = useCallback((property: string) => {
    if (!selectedAnimation || !selectedClipId) return;
    const track = selectedAnimation.tracks.find(t => t.property === property);
    if (!track) return;
    const keyframeIds = track.keyframes.map(kf => kf.id);
    selectKeyframes(keyframeIds);
    setNotification(`Selected all ${keyframeIds.length} keyframes for ${property}`);
    setTimeout(() => setNotification(null), 2000);
  }, [selectedAnimation, selectedClipId, selectKeyframes]);

  const handleSelectAllKeyframes = useCallback(() => {
    if (!selectedAnimation || !selectedClipId) return;
    const allKeyframeIds: string[] = [];
    selectedAnimation.tracks.forEach(track => {
      track.keyframes.forEach(kf => allKeyframeIds.push(kf.id));
    });
    selectKeyframes(allKeyframeIds);
    setNotification(`Selected all ${allKeyframeIds.length} keyframes`);
    setTimeout(() => setNotification(null), 2000);
  }, [selectedAnimation, selectedClipId, selectKeyframes]);

  const handleDeselectAll = useCallback(() => {
    selectKeyframes([]);
    setNotification('Deselected all keyframes');
    setTimeout(() => setNotification(null), 2000);
  }, [selectKeyframes]);

  const handleDeleteAllKeyframes = useCallback(() => {
    if (!selectedClipId) return;
    deleteAllKeyframes(selectedClipId);
    setShowDeleteAllConfirm(false);
    setNotification('All keyframes deleted');
    setTimeout(() => setNotification(null), 2000);
  }, [selectedClipId, deleteAllKeyframes]);

  const getSelectedKeyframePresetData = useCallback(() => {
    if (!selectedAnimation || selectedKeyframeIds.length === 0) return null;
    return KeyframePresetService.buildPresetFromSelectedKeyframes(selectedAnimation, selectedKeyframeIds);
  }, [selectedAnimation, selectedKeyframeIds]);

  const handleSaveKeyframePreset = useCallback((name: string, description: string) => {
    const presetData = getSelectedKeyframePresetData();
    if (!presetData) return;
    KeyframePresetService.createPreset({ ...presetData, name, description });
    setNotification(`Preset "${name}" saved`);
    setTimeout(() => setNotification(null), 2500);
  }, [getSelectedKeyframePresetData]);

  const handleKeyframeDoubleClick = useCallback((elementId: string, property: string, keyframe: Keyframe) => {
    const propConfig = elementProperties.find(p => p.property === property);
    if (!propConfig) return;
    setEditingKeyframe({ elementId, property: property as AnimatableProperty, keyframe, propConfig });
  }, [elementProperties]);

  const handleUpdateKeyframeValue = useCallback((value: number | string) => {
    if (!editingKeyframe) return;
    updateKeyframe(editingKeyframe.elementId, editingKeyframe.property, editingKeyframe.keyframe.id, { value });
  }, [editingKeyframe, updateKeyframe]);

  const handleUpdateKeyframeEasing = useCallback((easing: EasingType) => {
    if (!editingKeyframe) return;
    updateKeyframe(editingKeyframe.elementId, editingKeyframe.property, editingKeyframe.keyframe.id, { easing });
  }, [editingKeyframe, updateKeyframe]);

  const formatTime = (s: number) => formatTimeCode(s, fps);

  const handleEditSequence = useCallback((name: string, frameRate: number, dur: number) => {
    if (activeSequence && onEditSequence) {
      onEditSequence({ ...activeSequence, name, frameRate, duration: dur, updatedAt: Date.now() });
    }
    setShowSequenceModal(false);
  }, [activeSequence, onEditSequence]);

  const frameRateLabel = activeSequence
    ? FRAME_RATE_PRESETS.find(p => p.value === activeSequence.frameRate)?.label || `${activeSequence.frameRate} fps`
    : '';

  const timelineWidth = duration * pixelsPerSecond;

  const computeRowY = useCallback((categoryId: string, propertyIndex: number): number => {
    let y = 0;
    for (const cat of elementCategories) {
      y += 32;
      if (cat.id === categoryId) {
        y += propertyIndex * 28 + 14;
        break;
      }
      if (expandedCategories.includes(cat.id)) {
        const count = propertiesByCategory[cat.id]?.length ?? 0;
        y += count * 28;
      }
    }
    return y;
  }, [elementCategories, expandedCategories, propertiesByCategory]);

  return (
    <div className="h-full bg-gray-900 border-t border-l border-gray-700/50 flex flex-col relative">
      <div className="h-10 bg-gray-800/80 border-b border-gray-700/50 flex items-center px-3 flex-shrink-0">
        <div className="flex items-center gap-3 w-full justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-700/50 rounded-lg p-0.5">
              <button
                onClick={() => setClickMode('select')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                  clickMode === 'select' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-white'
                }`}
                title="Select mode"
              >
                <MousePointer className="w-3 h-3" />
                <span>Select</span>
              </button>
              <button
                onClick={() => setClickMode('delete')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                  clickMode === 'delete' ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:text-white'
                }`}
                title="Delete mode"
              >
                <Trash className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
            <button
              onClick={handleAddAllKeyframes}
              disabled={!selectedClipId}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedClipId
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 cursor-pointer'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
              title="Add keyframes for all properties (Ctrl+K)"
            >
              <Plus className="w-3 h-3" />
              <span>Add All</span>
            </button>
            {selectedKeyframeIds.length > 0 && (
              <span className="text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
                {selectedKeyframeIds.length} selected
              </span>
            )}
            <button
              onClick={() => setSnapToKeyframes(!snapToKeyframes)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                snapToKeyframes
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-700/50 text-gray-400 hover:text-white'
              }`}
              title={snapToKeyframes ? 'Snap enabled' : 'Snap disabled'}
            >
              <Magnet className={`w-3 h-3 ${snapToKeyframes ? 'animate-pulse' : ''}`} />
              <span>Snap</span>
            </button>
            <button
              onClick={handleSelectAllKeyframes}
              disabled={!selectedAnimation || !selectedAnimation.tracks.some(t => t.keyframes.length > 0)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedAnimation && selectedAnimation.tracks.some(t => t.keyframes.length > 0)
                  ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-green-400'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
            >
              <Diamond className="w-3 h-3" />
              <span>Select All</span>
            </button>
            <button
              onClick={handleDeselectAll}
              disabled={selectedKeyframeIds.length === 0}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedKeyframeIds.length > 0
                  ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-yellow-400 cursor-pointer'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
            >
              <X className="w-3 h-3" />
              <span>Deselect</span>
            </button>
            <button
              onClick={() => {
                if (!selectedClipId || selectedKeyframeIds.length === 0) return;
                selectedKeyframeIds.forEach(kfId => {
                  selectedAnimation?.tracks.forEach(track => {
                    const keyframe = track.keyframes.find(kf => kf.id === kfId);
                    if (keyframe) deleteKeyframe(selectedClipId, track.property, kfId);
                  });
                });
                selectKeyframes([]);
                setNotification(`Deleted ${selectedKeyframeIds.length} keyframe(s)`);
                setTimeout(() => setNotification(null), 2000);
              }}
              disabled={selectedKeyframeIds.length === 0}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedKeyframeIds.length > 0
                  ? 'bg-gray-700/50 text-gray-300 hover:bg-red-500/20 hover:text-red-400 cursor-pointer'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
            >
              <Trash className="w-3 h-3" />
              <span>Delete</span>
            </button>
            <button
              onClick={() => setShowDeleteAllConfirm(true)}
              disabled={!selectedAnimation || !selectedAnimation.tracks.some(t => t.keyframes.length > 0)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedAnimation && selectedAnimation.tracks.some(t => t.keyframes.length > 0)
                  ? 'bg-gray-700/50 text-gray-300 hover:bg-red-500/20 hover:text-red-400 cursor-pointer'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete All</span>
            </button>
            <div className="w-px h-4 bg-gray-700/60 mx-0.5" />
            <button
              onClick={() => setShowSavePresetModal(true)}
              disabled={selectedKeyframeIds.length === 0}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedKeyframeIds.length > 0
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 cursor-pointer'
                  : 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
              }`}
              title="Save selected keyframes as animation preset"
            >
              <Bookmark className="w-3 h-3" />
              <span>Save Preset</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {activeSequence && (
              <button
                onClick={() => setShowSequenceModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
                title="Sequence Settings"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-white font-medium">{activeSequence.name}</span>
                <span className="text-xs text-slate-400 px-1.5 py-0.5 bg-slate-700 rounded">{frameRateLabel}</span>
                <Settings className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
            <div className="flex items-center gap-1 text-xs">
              <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
              <input
                type="range"
                min="20"
                max="300"
                value={pixelsPerSecond}
                onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
                className="w-16 h-1 bg-gray-700 rounded appearance-none cursor-pointer"
              />
              <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {multipleSelected ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm p-8">
          <Diamond className="w-8 h-8 mb-3 text-amber-500/60" />
          <p className="font-medium text-gray-400">Multiple shapes selected</p>
          <p className="text-xs text-gray-600 mt-1">Select a single shape to edit its keyframes</p>
        </div>
      ) : !selectedClipId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm p-8">
          <Diamond className="w-8 h-8 mb-3 text-gray-600" />
          <p className="font-medium">Select a clip to edit keyframes</p>
          <p className="text-xs text-gray-600 mt-1">Click on a layer in the General Timeline</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div
            ref={propertiesScrollRef}
            className="w-48 flex-shrink-0 bg-gray-800/40 border-r border-gray-700/50 overflow-y-auto"
            onScroll={handlePropertiesScroll}
          >
            {elementCategories.map((category) => {
              const properties = propertiesByCategory[category.id] ?? [];
              const isExpanded = expandedCategories.includes(category.id);
              const categoryHasKeyframes = properties.some((prop) => {
                const track = selectedAnimation?.tracks.find((t) => t.property === prop.property);
                return track && track.keyframes.length > 0;
              });

              return (
                <div key={category.id}>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full h-8 flex items-center px-2 gap-1 hover:bg-gray-700/30 transition-colors border-b border-gray-700/30"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className="text-xs font-medium text-gray-300">{category.label}</span>
                    {categoryHasKeyframes && (
                      <Diamond className="w-2.5 h-2.5 text-amber-400 ml-auto fill-amber-400" />
                    )}
                  </button>

                  {isExpanded && properties.map((prop) => {
                    const track = selectedAnimation?.tracks.find((t) => t.property === prop.property);
                    const hasKeyframes = track && track.keyframes.length > 0;
                    const allSelected = hasKeyframes && track.keyframes.every(kf => selectedKeyframeIds.includes(kf.id));

                    return (
                      <div
                        key={prop.property}
                        className="h-7 flex items-center px-3 pl-6 gap-1 hover:bg-gray-700/20 transition-colors border-b border-gray-700/20"
                      >
                        <button
                          onClick={() => hasKeyframes && handleSelectPropertyKeyframes(prop.property)}
                          className={`text-xs flex-1 truncate text-left ${
                            hasKeyframes
                              ? allSelected
                                ? 'text-green-400 cursor-pointer hover:text-green-300'
                                : 'text-gray-200 cursor-pointer hover:text-green-400'
                              : 'text-gray-500 cursor-default'
                          }`}
                          title={prop.unit ? `${prop.label} (${prop.unit})` : prop.label}
                          disabled={!hasKeyframes}
                        >
                          {prop.label}
                        </button>
                        <button
                          onClick={() => handleAddKeyframe(prop.property)}
                          className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-green-400 transition-colors"
                          title={`Add keyframe for ${prop.label}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        {hasKeyframes && (
                          <button
                            onClick={() => handleDeleteTrack(prop.property)}
                            className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete all keyframes for this property"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              ref={keyframesScrollRef}
              className="flex-1 overflow-auto relative"
              onClick={handleTimelineClick}
              onMouseDown={handleSelectionBoxStart}
              onMouseMove={handleSelectionBoxMove}
              onMouseUp={handleSelectionBoxEnd}
              onMouseLeave={handleSelectionBoxEnd}
              onScroll={handleKeyframesScroll}
            >
              <div className="relative" style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
                <PlayheadIndicator
                  pixelsPerSecond={pixelsPerSecond}
                  isDraggable={true}
                  showHandle={true}
                  isSnapped={isSnappedToKeyframe}
                  containerRef={keyframesScrollRef}
                  duration={duration}
                  seekTo={seekTo}
                  layoutZoom={LAYOUT_ZOOM}
                  onFindSnap={findNearestKeyframe}
                  onSnapChange={setIsSnappedToKeyframe}
                  className="z-20"
                />

                {elementCategories.map((category) => {
                  const properties = propertiesByCategory[category.id] ?? [];
                  const isExpanded = expandedCategories.includes(category.id);

                  return (
                    <div key={category.id}>
                      <div className="h-8 border-b border-gray-700/30 bg-gray-800/20" />

                      {isExpanded && properties.map((prop, propIndex) => {
                        const track = selectedAnimation?.tracks.find((t) => t.property === prop.property);

                        return (
                          <div key={prop.property} className="h-7 border-b border-gray-700/20 relative">
                            {track?.keyframes.map((keyframe) => {
                              const x = localToGlobalTime(keyframe.time, selectedAnimation?.clipStart ?? 0) * pixelsPerSecond;
                              const isHovered = hoveredKeyframeId === keyframe.id;
                              const isSelected = state.timeline.selectedKeyframeIds.includes(keyframe.id);
                              const isHighlighted = highlightedKeyframeIds.has(keyframe.id);

                              const y = computeRowY(category.id, propIndex);
                              keyframePositionsRef.current.set(keyframe.id, { x, y });

                              return (
                                <div
                                  key={keyframe.id}
                                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer transition-all duration-150 ${
                                    isHovered || isHighlighted ? 'scale-125 z-10' : 'hover:scale-110'
                                  }`}
                                  style={{ left: `${x}px` }}
                                  onClick={(e) => handleKeyframeClick(selectedClipId!, prop.property, keyframe, e)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleKeyframeDoubleClick(selectedClipId!, prop.property, keyframe);
                                  }}
                                  onMouseEnter={() => setHoveredKeyframeId(keyframe.id)}
                                  onMouseLeave={() => setHoveredKeyframeId(null)}
                                  title={`${EASING_CONFIGS.find(c => c.type === keyframe.easing)?.label || 'Linear'} — ${clickMode === 'select' ? 'Click to select' : 'Click to delete'}, Double-click to edit`}
                                >
                                  <KeyframeIcon
                                    easing={keyframe.easing}
                                    size={14}
                                    isSelected={isSelected}
                                    isHovered={isHovered}
                                    isHighlighted={isHighlighted}
                                    hoverMode={clickMode}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {selectionBox && (
                  <div
                    className="absolute border-2 border-green-500/70 bg-green-500/10 pointer-events-none z-30"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.endX),
                      top: Math.min(selectionBox.startY, selectionBox.endY),
                      width: Math.abs(selectionBox.endX - selectionBox.startX),
                      height: Math.abs(selectionBox.endY - selectionBox.startY),
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingKeyframe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 w-80 shadow-xl">
            <h3 className="text-sm font-medium text-white mb-1">Edit Keyframe</h3>
            <p className="text-xs text-gray-400 mb-4">{editingKeyframe.propConfig.label}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Value</label>
                {editingKeyframe.propConfig.type === 'color' ? (
                  <input
                    type="color"
                    value={String(editingKeyframe.keyframe.value)}
                    onChange={(e) => handleUpdateKeyframeValue(e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                ) : (
                  <input
                    type="number"
                    value={Number(editingKeyframe.keyframe.value)}
                    onChange={(e) => handleUpdateKeyframeValue(Number(e.target.value))}
                    min={editingKeyframe.propConfig.min}
                    max={editingKeyframe.propConfig.max}
                    step={editingKeyframe.propConfig.step ?? 1}
                    className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Easing</label>
                <select
                  value={editingKeyframe.keyframe.easing}
                  onChange={(e) => handleUpdateKeyframeEasing(e.target.value as EasingType)}
                  className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                >
                  {EASING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Time: {localToGlobalTime(editingKeyframe.keyframe.time, state.animations[editingKeyframe.elementId]?.clipStart ?? 0).toFixed(2)}s
                </label>
              </div>
            </div>
            <div className="flex justify-between mt-4 pt-3 border-t border-gray-700">
              <button
                onClick={() => {
                  deleteKeyframe(editingKeyframe.elementId, editingKeyframe.property, editingKeyframe.keyframe.id);
                  setEditingKeyframe(null);
                }}
                className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded transition-colors"
              >
                Delete Keyframe
              </button>
              <button
                onClick={() => setEditingKeyframe(null)}
                className="px-4 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 w-96 shadow-xl">
            <h3 className="text-sm font-medium text-white mb-3">Delete All Keyframes</h3>
            <p className="text-sm text-gray-300 mb-4">
              Are you sure you want to delete all keyframes for this clip? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllKeyframes}
                className="px-4 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`px-4 py-3 rounded-lg shadow-lg border ${
            notification.includes('No clip')
              ? 'bg-red-900/90 border-red-700 text-red-100'
              : notification.includes('deleted') || notification.includes('Deleted')
              ? 'bg-orange-900/90 border-orange-700 text-orange-100'
              : 'bg-green-900/90 border-green-700 text-green-100'
          }`}>
            <p className="text-sm font-medium">{notification}</p>
          </div>
        </div>
      )}

      {activeSequence && (
        <CreateSequenceModal
          isOpen={showSequenceModal}
          onClose={() => setShowSequenceModal(false)}
          onCreate={handleEditSequence}
          editingSequence={activeSequence}
        />
      )}

      {showSavePresetModal && (() => {
        const presetData = getSelectedKeyframePresetData();
        return (
          <SaveKeyframePresetModal
            isOpen={showSavePresetModal}
            onClose={() => setShowSavePresetModal(false)}
            onSave={handleSaveKeyframePreset}
            keyframeCount={presetData?.keyframeCount ?? 0}
            trackCount={presetData?.tracks.length ?? 0}
            duration={presetData?.duration ?? 0}
          />
        );
      })()}
    </div>
  );
};

export default AnimationTimeline;
