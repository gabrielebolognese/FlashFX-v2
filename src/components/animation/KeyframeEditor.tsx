import React, { useMemo } from 'react';
import { LayoutGrid, Layers } from 'lucide-react';
import { useAnimation } from '../../animation-engine';
import { AnimatableProperty, Keyframe, EasingType, BezierHandle } from '../../animation-engine/types';
import { DesignElement } from '../../types/design';
import InterpolationGraph from './InterpolationGraph';

interface KeyframeEditorProps {
  selectedElements: DesignElement[];
}

const KeyframeEditor: React.FC<KeyframeEditorProps> = ({ selectedElements }) => {
  const { state, updateKeyframe } = useAnimation();

  const { selectedClipId, selectedKeyframeIds } = state.timeline;

  const selectedAnimation = useMemo(() => {
    return selectedClipId ? state.animations[selectedClipId] : null;
  }, [state.animations, selectedClipId]);

  const selectedKeyframeData = useMemo(() => {
    if (!selectedAnimation || !selectedClipId) return [];

    const data: { keyframe: Keyframe; property: AnimatableProperty; elementId: string }[] = [];

    selectedAnimation.tracks.forEach(track => {
      track.keyframes.forEach(kf => {
        if (selectedKeyframeIds.includes(kf.id)) {
          data.push({
            keyframe: kf,
            property: track.property,
            elementId: selectedClipId
          });
        }
      });
    });

    return data;
  }, [selectedAnimation, selectedClipId, selectedKeyframeIds]);

  const handleUpdateEasing = (
    elementId: string,
    property: AnimatableProperty,
    keyframeId: string,
    easing: EasingType
  ) => {
    updateKeyframe(elementId, property, keyframeId, { easing });
  };

  const handleUpdateHandles = (
    elementId: string,
    property: AnimatableProperty,
    keyframeId: string,
    handleIn?: BezierHandle,
    handleOut?: BezierHandle
  ) => {
    updateKeyframe(elementId, property, keyframeId, { handleIn, handleOut });
  };

  if (!selectedClipId || !selectedAnimation) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700/50 flex items-center justify-center">
            <Layers className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">No Clip Selected</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Select a clip in the General Timeline to edit keyframes
          </p>
        </div>
      </div>
    );
  }

  if (selectedKeyframeIds.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700/50 flex items-center justify-center">
            <LayoutGrid className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">No Keyframes Selected</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Use Select mode in the Properties Timeline to select keyframes,
            or click a property name to select all its keyframes
          </p>
        </div>
      </div>
    );
  }

  if (selectedKeyframeData.length < 2) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700/50 flex items-center justify-center">
            <LayoutGrid className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Select More Keyframes</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Select at least 2 keyframes to view and edit the interpolation curve.
            Hold Shift or Ctrl to select multiple.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        <InterpolationGraph
          selectedKeyframes={selectedKeyframeData}
          onUpdateEasing={handleUpdateEasing}
          onUpdateHandles={handleUpdateHandles}
        />
      </div>
    </div>
  );
};

export default KeyframeEditor;
