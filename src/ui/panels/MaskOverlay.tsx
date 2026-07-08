import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import { useMaskStore } from '../../store/mask';
import type { Mask, Vec2, AnimatableProperty } from '../../core/types';
import { evaluateNumber, evaluateVec2 } from '../../core/interpolation';

type HandleType =
  | 'move'
  | 'tl' | 'tr' | 'bl' | 'br'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'rotate';

const HANDLE_SIZE = 8;
const ROTATION_OFFSET = 24;
const YELLOW = 'rgba(250, 204, 21, 1)';
const INACTIVE_COLOR = 'rgba(148, 163, 184, 0.5)';

interface MaskOverlayProps {
  style?: React.CSSProperties;
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface MaskState {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

function getMaskState(mask: Mask, frame: number): MaskState {
  const pos = evaluateVec2(mask.position, frame);
  const size = evaluateVec2(mask.size, frame);
  return {
    x: pos[0],
    y: pos[1],
    w: Math.max(1, size[0]),
    h: Math.max(1, size[1]),
    rotation: evaluateNumber(mask.rotation, frame),
  };
}

export function MaskOverlay({ style }: MaskOverlayProps) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const updateMaskProperty = useEditorStore((s) => s.updateMaskProperty);
  const addMaskKeyframe = useEditorStore((s) => s.addMaskKeyframe);
  const selectedMaskId = useMaskStore((s) => s.selectedMaskId);
  const setSelectedMaskId = useMaskStore((s) => s.setSelectedMaskId);

  const overlayRef = useRef<HTMLDivElement>(null);
  const overlaySize = useElementSize(overlayRef);
  const [dragging, setDragging] = useState<HandleType | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleType | null>(null);

  const dragStart = useRef({ mx: 0, my: 0, state: null as MaskState | null });
  const dragSnapshot = useRef<{ comp: typeof composition; sel: typeof selection } | null>(null);

  const activeLayer = composition.layers.find((l) => l.id === selection.activeId) || null;
  const masks: Mask[] =
    activeLayer && 'masks' in activeLayer && Array.isArray(activeLayer.masks) ? activeLayer.masks : [];
  const mask = masks.find((m) => m.id === selectedMaskId) ?? null;

  const compW = composition.settings.width;
  const compH = composition.settings.height;
  const sX = overlaySize.width > 0 ? overlaySize.width / compW : 0;
  const sY = overlaySize.height > 0 ? overlaySize.height / compH : 0;

  const getState = useCallback((): MaskState | null => {
    if (!mask) return null;
    return getMaskState(mask, currentFrame);
  }, [mask, currentFrame]);

  const setMaskAnimatable = useCallback(
    (prop: AnimatableProperty, propPath: string, value: number | Vec2) => {
      if (!activeLayer || !mask) return;
      if (prop.keyframes.length > 0) {
        addMaskKeyframe(activeLayer.id, mask.id, propPath, currentFrame, value as number | [number, number]);
      } else {
        updateMaskProperty(activeLayer.id, mask.id, `${propPath}.defaultValue`, value);
      }
    },
    [activeLayer, mask, currentFrame, addMaskKeyframe, updateMaskProperty]
  );

  const toScreen = useCallback((cx: number, cy: number): [number, number] => [cx * sX, cy * sY], [sX, sY]);

  const startDrag = useCallback(
    (e: React.PointerEvent, handle: HandleType) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const state = getState();
      if (!state) return;
      dragStart.current = { mx: e.clientX, my: e.clientY, state };
      dragSnapshot.current = { comp: composition, sel: selection };
      useHistoryStore.getState().setBatching(true);
      setDragging(handle);
      document.body.style.userSelect = 'none';
    },
    [getState, composition, selection]
  );

  useEffect(() => {
    if (!dragging || !mask) return;

    const handleMove = (e: PointerEvent) => {
      const { state, mx: startMx, my: startMy } = dragStart.current;
      if (!state || !activeLayer || sX === 0 || sY === 0) return;

      const dx = (e.clientX - startMx) / sX;
      const dy = (e.clientY - startMy) / sY;
      const shiftHeld = e.shiftKey;

      if (dragging === 'move') {
        setMaskAnimatable(mask.position, 'position', [state.x + dx, state.y + dy] as Vec2);
      } else if (dragging === 'rotate') {
        const [scx, scy] = toScreen(state.x, state.y);
        const el = overlayRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const absPivotX = rect.left + scx;
        const absPivotY = rect.top + scy;
        const startAngle = Math.atan2(startMy - absPivotY, startMx - absPivotX);
        const currentAngle = Math.atan2(e.clientY - absPivotY, e.clientX - absPivotX);
        let angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
        if (shiftHeld) angleDelta = Math.round(angleDelta / 15) * 15;
        setMaskAnimatable(mask.rotation, 'rotation', state.rotation + angleDelta);
      } else {
        let newW = state.w;
        let newH = state.h;
        let newX = state.x;
        let newY = state.y;

        switch (dragging) {
          case 'tr':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'tl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'br':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'bl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'top':
            newH = Math.max(1, state.h - dy);
            newY = state.y + dy / 2;
            break;
          case 'bottom':
            newH = Math.max(1, state.h + dy);
            newY = state.y + dy / 2;
            break;
          case 'left':
            newW = Math.max(1, state.w - dx);
            newX = state.x + dx / 2;
            break;
          case 'right':
            newW = Math.max(1, state.w + dx);
            newX = state.x + dx / 2;
            break;
        }

        if (shiftHeld && ['tl', 'tr', 'bl', 'br'].includes(dragging)) {
          const aspect = state.w / state.h;
          if (newW / newH > aspect) newW = newH * aspect;
          else newH = newW / aspect;
        }

        setMaskAnimatable(mask.size, 'size', [newW, newH] as Vec2);
        setMaskAnimatable(mask.position, 'position', [newX, newY] as Vec2);
      }
    };

    const handleUp = () => {
      useHistoryStore.getState().setBatching(false);
      if (dragSnapshot.current) {
        useEditorStore.getState().commitDrag('Mask', dragSnapshot.current.comp, dragSnapshot.current.sel);
        dragSnapshot.current = null;
      }
      setDragging(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, mask, activeLayer, sX, sY, toScreen, setMaskAnimatable]);

  const getCursor = (handle: HandleType): string => {
    switch (handle) {
      case 'tl':
      case 'br':
        return 'nwse-resize';
      case 'tr':
      case 'bl':
        return 'nesw-resize';
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
      case 'rotate':
        return 'crosshair';
      case 'move':
        return 'move';
      default:
        return 'default';
    }
  };

  if (masks.length === 0 || sX === 0 || sY === 0) {
    return <div ref={overlayRef} style={{ ...style, pointerEvents: 'none' }} />;
  }

  const selectedState = mask ? getMaskState(mask, currentFrame) : null;

  return (
    <div ref={overlayRef} style={{ ...style, pointerEvents: 'none' }}>
      {/* Render inactive mask outlines */}
      {masks.map((m) => {
        if (m.id === selectedMaskId) return null;
        if (m.enabled === false) return null;
        const s = getMaskState(m, currentFrame);
        const [cx, cy] = toScreen(s.x, s.y);
        const sw = s.w * sX;
        const sh = s.h * sY;
        return (
          <div key={m.id} className="absolute" style={{ left: cx, top: cy, width: 0, height: 0 }}>
            <div
              className="absolute pointer-events-auto"
              style={{
                left: -sw / 2,
                top: -sh / 2,
                width: sw,
                height: sh,
                transform: `rotate(${s.rotation}deg)`,
                transformOrigin: `${sw / 2}px ${sh / 2}px`,
                border: `1px dashed ${INACTIVE_COLOR}`,
                cursor: 'pointer',
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedMaskId(m.id);
              }}
            />
          </div>
        );
      })}

      {/* Render active mask with handles */}
      {mask && selectedState && (() => {
        const { x, y, w, h, rotation } = selectedState;
        const [centerSX, centerSY] = toScreen(x, y);
        const sw = w * sX;
        const sh = h * sY;

        const handles: { id: HandleType; cx: number; cy: number }[] = [
          { id: 'tl', cx: -sw / 2, cy: -sh / 2 },
          { id: 'tr', cx: sw / 2, cy: -sh / 2 },
          { id: 'bl', cx: -sw / 2, cy: sh / 2 },
          { id: 'br', cx: sw / 2, cy: sh / 2 },
          { id: 'top', cx: 0, cy: -sh / 2 },
          { id: 'bottom', cx: 0, cy: sh / 2 },
          { id: 'left', cx: -sw / 2, cy: 0 },
          { id: 'right', cx: sw / 2, cy: 0 },
        ];

        return (
          <div className="absolute" style={{ left: centerSX, top: centerSY, width: 0, height: 0 }}>
            <div
              className="absolute"
              style={{
                left: -sw / 2,
                top: -sh / 2,
                width: sw,
                height: sh,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: `${sw / 2}px ${sh / 2}px`,
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ border: `1.5px dashed ${YELLOW}` }}
              />

              <div
                className="absolute inset-0 pointer-events-auto"
                style={{ cursor: dragging === 'move' ? 'grabbing' : 'move' }}
                onPointerDown={(e) => startDrag(e, 'move')}
              />

              {handles.map(({ id, cx, cy }) => {
                const isCorner = ['tl', 'tr', 'bl', 'br'].includes(id);
                const size = isCorner ? HANDLE_SIZE : HANDLE_SIZE - 2;
                const hitSize = size + 8;
                const isHovered = hoverHandle === id;
                return (
                  <div
                    key={id}
                    className="absolute pointer-events-auto flex items-center justify-center"
                    style={{
                      left: sw / 2 + cx - hitSize / 2,
                      top: sh / 2 + cy - hitSize / 2,
                      width: hitSize,
                      height: hitSize,
                      cursor: getCursor(id),
                    }}
                    onPointerDown={(e) => startDrag(e, id)}
                    onPointerEnter={() => setHoverHandle(id)}
                    onPointerLeave={() => setHoverHandle(null)}
                  >
                    <div
                      style={{
                        width: size,
                        height: size,
                        backgroundColor: '#fff',
                        borderColor: YELLOW,
                        boxShadow: '0 0 4px rgba(250, 204, 21, 0.5)',
                      }}
                      className={`rounded-sm border-2 transition-transform duration-75 ${isHovered ? 'scale-[1.4]' : ''}`}
                    />
                  </div>
                );
              })}

              <div
                className="absolute pointer-events-none"
                style={{
                  left: sw / 2 - 0.5,
                  top: -ROTATION_OFFSET,
                  width: 1,
                  height: ROTATION_OFFSET,
                  background: 'rgba(250, 204, 21, 0.6)',
                }}
              />
              <div
                className="absolute pointer-events-auto"
                style={{ left: sw / 2 - 6, top: -ROTATION_OFFSET - 6, width: 12, height: 12, cursor: 'crosshair' }}
                onPointerDown={(e) => startDrag(e, 'rotate')}
                onPointerEnter={() => setHoverHandle('rotate')}
                onPointerLeave={() => setHoverHandle(null)}
              >
                <div
                  style={{ borderColor: YELLOW }}
                  className={`w-full h-full rounded-full border-2 transition-transform duration-75 ${
                    hoverHandle === 'rotate' ? 'bg-yellow-400/60 scale-[1.3]' : 'bg-yellow-400/30'
                  }`}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
