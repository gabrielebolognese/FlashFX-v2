import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Keyframe, EasingType, AnimatableProperty, EASING_CONFIGS, BezierHandle } from '../../animation-engine/types';
import { getEasingFunction } from '../../animation-engine/interpolation';
import { KF_FACTORY_DEFAULTS, keyframeDefaultsService } from '../../services/KeyframeDefaultsService';

interface KeyframeData {
  keyframe: Keyframe;
  property: AnimatableProperty;
  elementId: string;
}

interface SegmentData {
  elementId: string;
  property: AnimatableProperty;
  keyframeId: string;
  startTime: number;
  endTime: number;
  easing: EasingType;
}

interface InterpolationGraphProps {
  selectedKeyframes: KeyframeData[];
  onUpdateEasing: (elementId: string, property: AnimatableProperty, keyframeId: string, easing: EasingType) => void;
  onUpdateHandles?: (elementId: string, property: AnimatableProperty, keyframeId: string, handleIn?: BezierHandle, handleOut?: BezierHandle) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  segment: SegmentData | null;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function cssVarNum(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

const PROPERTY_COLOR_VARS: Record<string, { cssVar: string; fallback: string }> = {
  x:             { cssVar: '--ffx-kf-color-x',             fallback: KF_FACTORY_DEFAULTS.colorX },
  y:             { cssVar: '--ffx-kf-color-y',             fallback: KF_FACTORY_DEFAULTS.colorY },
  width:         { cssVar: '--ffx-kf-color-width',         fallback: KF_FACTORY_DEFAULTS.colorWidth },
  height:        { cssVar: '--ffx-kf-color-height',        fallback: KF_FACTORY_DEFAULTS.colorHeight },
  rotation:      { cssVar: '--ffx-kf-color-rotation',      fallback: KF_FACTORY_DEFAULTS.colorRotation },
  opacity:       { cssVar: '--ffx-kf-color-opacity',       fallback: KF_FACTORY_DEFAULTS.colorOpacity },
  fill:          { cssVar: '--ffx-kf-color-fill',          fallback: KF_FACTORY_DEFAULTS.colorFill },
  stroke:        { cssVar: '--ffx-kf-color-stroke',        fallback: KF_FACTORY_DEFAULTS.colorStroke },
  strokeWidth:   { cssVar: '--ffx-kf-color-strokewidth',   fallback: KF_FACTORY_DEFAULTS.colorStrokeWidth },
  borderRadius:  { cssVar: '--ffx-kf-color-borderradius',  fallback: KF_FACTORY_DEFAULTS.colorBorderRadius },
  scaleX:        { cssVar: '--ffx-kf-color-scalex',        fallback: KF_FACTORY_DEFAULTS.colorScaleX },
  scaleY:        { cssVar: '--ffx-kf-color-scaley',        fallback: KF_FACTORY_DEFAULTS.colorScaleY },
  shadowBlur:    { cssVar: '--ffx-kf-color-shadowblur',    fallback: KF_FACTORY_DEFAULTS.colorShadowBlur },
  shadowX:       { cssVar: '--ffx-kf-color-shadowx',       fallback: KF_FACTORY_DEFAULTS.colorShadowX },
  shadowY:       { cssVar: '--ffx-kf-color-shadowy',       fallback: KF_FACTORY_DEFAULTS.colorShadowY },
  fontSize:      { cssVar: '--ffx-kf-color-fontsize',      fallback: KF_FACTORY_DEFAULTS.colorFontSize },
  letterSpacing: { cssVar: '--ffx-kf-color-letterspacing', fallback: KF_FACTORY_DEFAULTS.colorLetterSpacing },
};

function getPropertyColor(prop: string): string {
  const entry = PROPERTY_COLOR_VARS[prop];
  if (entry) return cssVar(entry.cssVar, entry.fallback);
  return cssVar('--ffx-kf-color-default', KF_FACTORY_DEFAULTS.colorDefault);
}

interface SelectedKeyframeState {
  elementId: string;
  property: AnimatableProperty;
  keyframeId: string;
}

interface DragState {
  isDragging: boolean;
  keyframeId: string;
  handleType: 'in' | 'out';
  keyframeX: number;
  keyframeY: number;
}

const BASE_CELL = 50;

const InterpolationGraph: React.FC<InterpolationGraphProps> = ({
  selectedKeyframes,
  onUpdateEasing,
  onUpdateHandles,
}) => {
  useEffect(() => {
    keyframeDefaultsService.applyCssVars(keyframeDefaultsService.getDefaults());
  }, []);

  const [selectedSegment, setSelectedSegment] = useState<SegmentData | null>(null);
  const [selectedKeyframePoint, setSelectedKeyframePoint] = useState<SelectedKeyframeState | null>(null);
  const [viewMode] = useState<'single' | 'separate'>('single');
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const [isZoomMode, setIsZoomMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, segment: null });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 280, height: 280 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w > 0 && h > 0) {
        setContainerSize({ width: w, height: h });
      }
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }
    return () => ro.disconnect();
  }, []);

  const graphWidth = containerSize.width;
  const graphHeight = containerSize.height;

  const cellSize = BASE_CELL * zoomLevel;

  const groupedByProperty = useMemo(() => {
    const groups: Record<string, KeyframeData[]> = {};
    selectedKeyframes.forEach(kf => {
      if (!groups[kf.property]) {
        groups[kf.property] = [];
      }
      groups[kf.property].push(kf);
    });
    Object.keys(groups).forEach(prop => {
      groups[prop].sort((a, b) => a.keyframe.time - b.keyframe.time);
    });
    return groups;
  }, [selectedKeyframes]);

  const timeRange = useMemo(() => {
    if (selectedKeyframes.length === 0) return { min: 0, max: 1 };
    const times = selectedKeyframes.map(kf => kf.keyframe.time);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const padding = (max - min) * 0.1 || 0.5;
    return { min: min - padding, max: max + padding };
  }, [selectedKeyframes]);

  const valueRange = useMemo(() => {
    if (selectedKeyframes.length === 0) return { min: 0, max: 100 };
    const values = selectedKeyframes.map(kf => Number(kf.keyframe.value) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range * 0.15 || 10;
    return { min: min - padding, max: max + padding };
  }, [selectedKeyframes]);

  const handleSegmentClick = useCallback((segment: SegmentData, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedSegment(segment);
    setSelectedKeyframePoint({
      elementId: segment.elementId,
      property: segment.property,
      keyframeId: segment.keyframeId
    });
  }, []);

  const handleSegmentContextMenu = useCallback((segment: SegmentData, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = graphRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setContextMenu({ visible: true, x, y, segment });
    setSelectedSegment(segment);
    setSelectedKeyframePoint({
      elementId: segment.elementId,
      property: segment.property,
      keyframeId: segment.keyframeId
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, segment: null });
  }, []);

  const handleSelectEasing = useCallback((easing: EasingType) => {
    if (contextMenu.segment) {
      onUpdateEasing(
        contextMenu.segment.elementId,
        contextMenu.segment.property,
        contextMenu.segment.keyframeId,
        easing
      );
      closeContextMenu();
    }
  }, [contextMenu.segment, onUpdateEasing, closeContextMenu]);

  const handleGraphClick = useCallback((e: React.MouseEvent) => {
    if (!isZoomMode) {
      setSelectedSegment(null);
      setSelectedKeyframePoint(null);
    }
    closeContextMenu();
  }, [isZoomMode, closeContextMenu]);

  const handleKeyframePointClick = useCallback((elementId: string, property: AnimatableProperty, keyframeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedKeyframePoint({ elementId, property, keyframeId });
    setSelectedSegment(null);
  }, []);

  const handleHandleMouseDown = useCallback((keyframeId: string, handleType: 'in' | 'out', keyframeX: number, keyframeY: number, e: React.MouseEvent<SVGPolygonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      isDragging: true,
      keyframeId,
      handleType,
      keyframeX,
      keyframeY,
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState || !onUpdateHandles || !svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const cursorX = (e.clientX - svgRect.left) / svgRect.width * graphWidth;
    const cursorY = (e.clientY - svgRect.top) / svgRect.height * graphHeight;

    const keyframeData = selectedKeyframes.find(kf => kf.keyframe.id === dragState.keyframeId);
    if (!keyframeData) return;

    const handleX = (cursorX - dragState.keyframeX) / graphWidth;
    const handleY = -(cursorY - dragState.keyframeY) / graphHeight;

    if (dragState.handleType === 'out') {
      const handleOut: BezierHandle = { x: handleX, y: handleY };
      onUpdateHandles(keyframeData.elementId, keyframeData.property, keyframeData.keyframe.id, keyframeData.keyframe.handleIn, handleOut);
    } else {
      const handleIn: BezierHandle = { x: handleX, y: handleY };
      onUpdateHandles(keyframeData.elementId, keyframeData.property, keyframeData.keyframe.id, handleIn, keyframeData.keyframe.handleOut);
    }
  }, [dragState, onUpdateHandles, selectedKeyframes, graphWidth, graphHeight]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState?.isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isZoomMode) {
      setIsZoomMode(false);
      setZoomLevel(1);
    } else {
      handleGraphClick(e);
    }
  }, [isZoomMode, handleGraphClick]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel(prev => Math.max(0.3, Math.min(4, prev + delta)));
  }, []);

  const handleSvgDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    setIsZoomMode(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isZoomMode) {
          setIsZoomMode(false);
          setZoomLevel(1);
        }
        if (contextMenu.visible) {
          closeContextMenu();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu.visible && graphRef.current && !graphRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [isZoomMode, contextMenu.visible, closeContextMenu]);

  const cubicBezier = useCallback((p0: number, p1: number, p2: number, p3: number, t: number): number => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }, []);

  const getRhombusPoints = useCallback((cx: number, cy: number, size: number = 5): string => {
    return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
  }, []);

  const renderGrid = useCallback(() => {
    if (graphWidth <= 0 || graphHeight <= 0 || cellSize <= 0) return null;

    const lines: JSX.Element[] = [];
    const cols = Math.ceil(graphWidth / cellSize) + 1;
    const rows = Math.ceil(graphHeight / cellSize) + 1;

    for (let i = 0; i <= cols; i++) {
      const x = i * cellSize;
      const isMajor = i % 5 === 0;
      lines.push(
        <line
          key={`vl-${i}`}
          x1={x} y1={0} x2={x} y2={graphHeight}
          stroke={isMajor ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
          strokeWidth={isMajor ? 0.75 : 0.5}
        />
      );
    }

    for (let j = 0; j <= rows; j++) {
      const y = j * cellSize;
      const isMajor = j % 5 === 0;
      lines.push(
        <line
          key={`hl-${j}`}
          x1={0} y1={y} x2={graphWidth} y2={y}
          stroke={isMajor ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
          strokeWidth={isMajor ? 0.75 : 0.5}
        />
      );
    }

    return <g>{lines}</g>;
  }, [graphWidth, graphHeight, cellSize]);

  const renderAxisLabels = useCallback(() => {
    if (graphWidth <= 0 || graphHeight <= 0) return null;
    const labels: JSX.Element[] = [];
    const timeDuration = timeRange.max - timeRange.min;
    const valueDuration = valueRange.max - valueRange.min;

    const timeSteps = 5;
    for (let i = 0; i <= timeSteps; i++) {
      const t = i / timeSteps;
      const x = t * graphWidth;
      const timeVal = timeRange.min + t * timeDuration;
      labels.push(
        <text
          key={`tl-${i}`}
          x={x}
          y={graphHeight - 3}
          textAnchor="middle"
          fill="rgba(156,163,175,0.7)"
          fontSize="9"
          fontFamily="ui-monospace,monospace"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {timeVal.toFixed(1)}s
        </text>
      );
    }

    const valueSteps = 4;
    for (let i = 0; i <= valueSteps; i++) {
      const t = i / valueSteps;
      const y = graphHeight - t * graphHeight;
      const valVal = valueRange.min + t * valueDuration;
      if (y > 12 && y < graphHeight - 4) {
        labels.push(
          <text
            key={`vl-${i}`}
            x={4}
            y={y - 2}
            textAnchor="start"
            fill="rgba(156,163,175,0.5)"
            fontSize="8"
            fontFamily="ui-monospace,monospace"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {valVal.toFixed(0)}
          </text>
        );
      }
    }

    return <g>{labels}</g>;
  }, [graphWidth, graphHeight, timeRange, valueRange]);

  const renderCurves = useCallback(() => {
    if (graphWidth <= 0 || graphHeight <= 0) return null;
    const elements: JSX.Element[] = [];

    const selColor   = cssVar('--ffx-kf-color-selected',            KF_FACTORY_DEFAULTS.colorSelected);
    const hlColor    = cssVar('--ffx-kf-color-handleline',          KF_FACTORY_DEFAULTS.colorHandleLine);
    const curveW     = cssVarNum('--ffx-kf-curve-width',            KF_FACTORY_DEFAULTS.curveWidth);
    const curveWsel  = cssVarNum('--ffx-kf-curve-width-selected',   KF_FACTORY_DEFAULTS.curveWidthSelected);
    const hlW        = cssVarNum('--ffx-kf-handle-line-width',      KF_FACTORY_DEFAULTS.handleLineWidth);
    const hlOpacity  = cssVarNum('--ffx-kf-handle-line-opacity',    KF_FACTORY_DEFAULTS.handleLineOpacity);
    const inactiveOp = cssVarNum('--ffx-kf-inactive-curve-opacity', KF_FACTORY_DEFAULTS.inactiveCurveOpacity);
    const hFill      = cssVar('--ffx-kf-handle-fill',               KF_FACTORY_DEFAULTS.handleFill);
    const hBorder    = cssVar('--ffx-kf-handle-border',             KF_FACTORY_DEFAULTS.handleBorder);
    const hBorderW   = cssVarNum('--ffx-kf-handle-border-width',    KF_FACTORY_DEFAULTS.handleBorderWidth);
    const hSelFill   = cssVar('--ffx-kf-handle-selected-fill',      KF_FACTORY_DEFAULTS.handleSelectedFill);
    const hSelBorder = cssVar('--ffx-kf-handle-selected-border',    KF_FACTORY_DEFAULTS.handleSelectedBorder);
    const hSelMult   = cssVarNum('--ffx-kf-handle-selected-multiplier', KF_FACTORY_DEFAULTS.handleSelectedMultiplier);
    const cpFill     = cssVar('--ffx-kf-cp-fill',                   KF_FACTORY_DEFAULTS.cpFill);
    const cpBorder   = cssVar('--ffx-kf-cp-border',                 KF_FACTORY_DEFAULTS.cpBorder);
    const cpBorderW  = cssVarNum('--ffx-kf-cp-border-width',        KF_FACTORY_DEFAULTS.cpBorderWidth);
    const cpSz       = cssVarNum('--ffx-kf-cp-size',                KF_FACTORY_DEFAULTS.cpSize);
    const hSz        = cssVarNum('--ffx-kf-handle-size',            KF_FACTORY_DEFAULTS.handleSize);
    const hSzSel     = Math.min(hSz * hSelMult, hSz + 4);

    Object.entries(groupedByProperty).forEach(([prop, keyframes]) => {
      const color = getPropertyColor(prop);

      for (let i = 0; i < keyframes.length - 1; i++) {
        const startKf = keyframes[i];
        const endKf = keyframes[i + 1];

        const startX = ((startKf.keyframe.time - timeRange.min) / (timeRange.max - timeRange.min)) * graphWidth;
        const endX = ((endKf.keyframe.time - timeRange.min) / (timeRange.max - timeRange.min)) * graphWidth;
        const startY = graphHeight - ((Number(startKf.keyframe.value) - valueRange.min) / (valueRange.max - valueRange.min)) * graphHeight;
        const endY = graphHeight - ((Number(endKf.keyframe.value) - valueRange.min) / (valueRange.max - valueRange.min)) * graphHeight;

        const points: string[] = [];
        const numPoints = 50;

        if (startKf.keyframe.handleOut || endKf.keyframe.handleIn) {
          const p0X = startX;
          const p0Y = startY;
          const p3X = endX;
          const p3Y = endY;

          const deltaX = endX - startX;
          const deltaY = endY - startY;

          const p1X = startKf.keyframe.handleOut ? startX + startKf.keyframe.handleOut.x * graphWidth : startX + deltaX * 0.33;
          const p1Y = startKf.keyframe.handleOut ? startY - startKf.keyframe.handleOut.y * graphHeight : startY;

          const p2X = endKf.keyframe.handleIn ? endX + endKf.keyframe.handleIn.x * graphWidth : endX - deltaX * 0.33;
          const p2Y = endKf.keyframe.handleIn ? endY - endKf.keyframe.handleIn.y * graphHeight : endY;

          for (let j = 0; j <= numPoints; j++) {
            const t = j / numPoints;
            const x = cubicBezier(p0X, p1X, p2X, p3X, t);
            const y = cubicBezier(p0Y, p1Y, p2Y, p3Y, t);
            points.push(`${x},${y}`);
          }
        } else {
          const easingFn = getEasingFunction(startKf.keyframe.easing);
          for (let j = 0; j <= numPoints; j++) {
            const t = j / numPoints;
            const easedT = easingFn(t);
            const x = startX + (endX - startX) * t;
            const y = startY + (endY - startY) * easedT;
            points.push(`${x},${y}`);
          }
        }

        const isSelected = selectedSegment?.keyframeId === startKf.keyframe.id &&
                          selectedSegment?.property === prop;

        const segmentData: SegmentData = {
          elementId: startKf.elementId,
          property: startKf.property,
          keyframeId: startKf.keyframe.id,
          startTime: startKf.keyframe.time,
          endTime: endKf.keyframe.time,
          easing: startKf.keyframe.easing
        };

        const easingLabel = EASING_CONFIGS.find(c => c.type === startKf.keyframe.easing)?.label || 'Linear';

        elements.push(
          <g key={`segment-${prop}-${i}`}>
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleSegmentClick(segmentData, e)}
              onContextMenu={(e) => handleSegmentContextMenu(segmentData, e)}
            >
              <title>{easingLabel}</title>
            </polyline>
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke={isSelected ? selColor : color}
              strokeWidth={isSelected ? curveWsel : curveW}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              style={{ pointerEvents: 'none' }}
              shapeRendering="crispEdges"
            />
            {isSelected && (
              <polyline
                points={points.join(' ')}
                fill="none"
                stroke={selColor}
                strokeWidth="2"
                strokeLinecap="butt"
                strokeLinejoin="miter"
                opacity={inactiveOp}
                style={{ pointerEvents: 'none' }}
                shapeRendering="crispEdges"
              />
            )}
          </g>
        );
      }

      keyframes.forEach((kf, idx) => {
        const x = ((kf.keyframe.time - timeRange.min) / (timeRange.max - timeRange.min)) * graphWidth;
        const y = graphHeight - ((Number(kf.keyframe.value) - valueRange.min) / (valueRange.max - valueRange.min)) * graphHeight;

        const isSelected = selectedKeyframePoint?.keyframeId === kf.keyframe.id && selectedKeyframePoint?.property === prop;
        const ptFill   = isSelected ? hSelFill   : (hFill !== KF_FACTORY_DEFAULTS.handleFill ? hFill : color);
        const ptBorder = isSelected ? hSelBorder : hBorder;
        const ptBW     = isSelected ? hBorderW * 2 : hBorderW;
        const ptR      = isSelected ? hSzSel : hSz;

        elements.push(
          <g key={`point-${prop}-${idx}`}>
            <circle
              cx={x}
              cy={y}
              r="7"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleKeyframePointClick(kf.elementId, kf.property, kf.keyframe.id, e)}
            />
            <circle
              cx={x}
              cy={y}
              r={ptR}
              fill={ptFill}
              stroke={ptBorder}
              strokeWidth={ptBW}
              style={{ pointerEvents: 'none' }}
            />
            <text
              x={x}
              y={y - ptR - 3}
              textAnchor="middle"
              fill="rgba(156,163,175,0.8)"
              fontSize="8"
              fontFamily="ui-monospace,monospace"
              fontWeight="500"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {Number(kf.keyframe.value).toFixed(0)}
            </text>

            {isSelected && onUpdateHandles && (
              <>
                {kf.keyframe.handleOut && (
                  <>
                    <line
                      x1={x} y1={y}
                      x2={x + kf.keyframe.handleOut.x * graphWidth}
                      y2={y - kf.keyframe.handleOut.y * graphHeight}
                      stroke={hlColor}
                      strokeWidth={hlW}
                      strokeDasharray="2,2"
                      opacity={hlOpacity}
                    />
                    <polygon
                      points={getRhombusPoints(x + kf.keyframe.handleOut.x * graphWidth, y - kf.keyframe.handleOut.y * graphHeight, cpSz)}
                      fill={cpFill}
                      stroke={cpBorder}
                      strokeWidth={cpBorderW}
                      style={{ cursor: 'grab' }}
                      onMouseDown={(e) => handleHandleMouseDown(kf.keyframe.id, 'out', x, y, e)}
                    />
                  </>
                )}
                {kf.keyframe.handleIn && (
                  <>
                    <line
                      x1={x} y1={y}
                      x2={x + kf.keyframe.handleIn.x * graphWidth}
                      y2={y - kf.keyframe.handleIn.y * graphHeight}
                      stroke={hlColor}
                      strokeWidth={hlW}
                      strokeDasharray="2,2"
                      opacity={hlOpacity}
                    />
                    <polygon
                      points={getRhombusPoints(x + kf.keyframe.handleIn.x * graphWidth, y - kf.keyframe.handleIn.y * graphHeight, cpSz)}
                      fill={cpFill}
                      stroke={cpBorder}
                      strokeWidth={cpBorderW}
                      style={{ cursor: 'grab' }}
                      onMouseDown={(e) => handleHandleMouseDown(kf.keyframe.id, 'in', x, y, e)}
                    />
                  </>
                )}
                {!kf.keyframe.handleOut && idx < keyframes.length - 1 && (
                  <>
                    <line
                      x1={x} y1={y}
                      x2={x + graphWidth * 0.2}
                      y2={y}
                      stroke={hlColor}
                      strokeWidth={hlW}
                      strokeDasharray="2,2"
                      opacity={hlOpacity * 0.67}
                    />
                    <polygon
                      points={getRhombusPoints(x + graphWidth * 0.2, y, cpSz)}
                      fill={cpFill}
                      stroke={cpBorder}
                      strokeWidth={cpBorderW}
                      opacity="0.5"
                      style={{ cursor: 'grab' }}
                      onMouseDown={(e) => handleHandleMouseDown(kf.keyframe.id, 'out', x, y, e)}
                    />
                  </>
                )}
                {!kf.keyframe.handleIn && idx > 0 && (
                  <>
                    <line
                      x1={x} y1={y}
                      x2={x - graphWidth * 0.2}
                      y2={y}
                      stroke={hlColor}
                      strokeWidth={hlW}
                      strokeDasharray="2,2"
                      opacity={hlOpacity * 0.67}
                    />
                    <polygon
                      points={getRhombusPoints(x - graphWidth * 0.2, y, cpSz)}
                      fill={cpFill}
                      stroke={cpBorder}
                      strokeWidth={cpBorderW}
                      opacity="0.5"
                      style={{ cursor: 'grab' }}
                      onMouseDown={(e) => handleHandleMouseDown(kf.keyframe.id, 'in', x, y, e)}
                    />
                  </>
                )}
              </>
            )}
          </g>
        );
      });
    });

    return elements;
  }, [groupedByProperty, timeRange, valueRange, selectedSegment, selectedKeyframePoint, handleSegmentClick, handleSegmentContextMenu, handleKeyframePointClick, handleHandleMouseDown, onUpdateHandles, graphWidth, graphHeight, cubicBezier, getRhombusPoints]);

  if (selectedKeyframes.length < 2) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Select 2 or more keyframes to view interpolation graph
      </div>
    );
  }

  const propertyKeys = Object.keys(groupedByProperty);

  const renderContextMenu = () => {
    if (!contextMenu.visible || !contextMenu.segment) return null;

    const currentEasing = contextMenu.segment.easing;
    const propertyColor = getPropertyColor(contextMenu.segment.property);

    const menuHeight = 380;
    const menuY = contextMenu.y + menuHeight > (graphRef.current?.clientHeight ?? 9999)
      ? Math.max(4, contextMenu.y - menuHeight)
      : contextMenu.y;

    return (
      <div
        className="absolute z-[9999] bg-gray-900/95 border border-gray-700/80 rounded-lg shadow-2xl max-h-[380px] overflow-y-auto backdrop-blur-sm"
        style={{
          left: `${contextMenu.x}px`,
          top: `${menuY}px`,
          minWidth: '200px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/60 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: propertyColor }} />
            <span className="text-xs font-medium text-gray-200 capitalize">{contextMenu.segment.property}</span>
            <span className="text-[10px] text-gray-500 tabular-nums">
              {contextMenu.segment.startTime.toFixed(2)}s–{contextMenu.segment.endTime.toFixed(2)}s
            </span>
          </div>
          <button
            onClick={closeContextMenu}
            className="text-gray-600 hover:text-gray-300 transition-colors text-xs leading-none"
          >
            ✕
          </button>
        </div>

        <div className="py-1">
          {EASING_CONFIGS.map(config => (
            <button
              key={config.type}
              onClick={() => handleSelectEasing(config.type)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                currentEasing === config.type
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <EasingPreview easing={config.type} size={14} />
              <span className="flex-1 text-left">{config.label}</span>
              {currentEasing === config.type && (
                <span className="text-blue-400 text-[10px]">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const editorBg = cssVar('--ffx-kf-editor-bg', KF_FACTORY_DEFAULTS.editorBg);
  const borderColor = cssVar('--ffx-kf-zero-line-color', KF_FACTORY_DEFAULTS.zeroLineColor);
  const borderW = cssVarNum('--ffx-kf-zero-line-width', KF_FACTORY_DEFAULTS.zeroLineWidth);

  return (
    <div ref={graphRef} className="h-full flex flex-col relative">
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {graphWidth > 0 && graphHeight > 0 && (
          <svg
            ref={svgRef}
            width={graphWidth}
            height={graphHeight}
            className={isZoomMode ? 'cursor-zoom-in' : 'cursor-crosshair'}
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            preserveAspectRatio="xMidYMid meet"
            onClick={handleSvgClick}
            onDoubleClick={handleSvgDoubleClick}
            onWheel={handleWheel}
            style={{ display: 'block', background: editorBg }}
          >
            {renderGrid()}
            {renderCurves()}
            {renderAxisLabels()}
            <rect
              x={0.5} y={0.5}
              width={graphWidth - 1}
              height={graphHeight - 1}
              fill="none"
              stroke={borderColor}
              strokeWidth={borderW}
              style={{ pointerEvents: 'none' }}
            />
          </svg>
        )}

        {isZoomMode && (
          <div className="absolute top-2 left-2 bg-gray-900/80 border border-gray-600/50 rounded px-2 py-1 text-[10px] text-gray-400 pointer-events-none">
            {(zoomLevel * 100).toFixed(0)}% · ESC to exit
          </div>
        )}

        {propertyKeys.length > 1 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 bg-gray-900/80 border border-gray-700/50 rounded px-2 py-1.5 pointer-events-none">
            {propertyKeys.map(prop => (
              <div key={prop} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getPropertyColor(prop) }} />
                <span className="text-[9px] text-gray-400 capitalize tracking-wide">{prop}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {renderContextMenu()}
    </div>
  );
};

const EasingPreview: React.FC<{ easing: EasingType; size?: number }> = ({ easing, size = 20 }) => {
  const easingFn = getEasingFunction(easing);
  const points: string[] = [];

  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = t * size;
    const y = size - easingFn(t) * size;
    points.push(`${x},${y}`);
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default InterpolationGraph;
