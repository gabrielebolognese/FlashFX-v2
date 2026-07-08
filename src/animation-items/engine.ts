import type {
  AnimationItemConfig,
  DataSourceConfig,
  ResolvedAnimationElement,
  ProgressBarConfig,
  StopwatchConfig,
  CounterConfig,
  RatingStarsConfig,
  LoadingSpinnerConfig,
  GaugeConfig,
  SubElementStyle,
} from './types';

function easeValue(t: number, easing: DataSourceConfig['simulatedEasing']): number {
  switch (easing) {
    case 'linear': return t;
    case 'easeOut': return 1 - Math.pow(1 - t, 3);
    case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'spring': {
      const w = 2 * Math.PI * 2.5;
      const d = 0.6;
      return 1 - Math.exp(-d * t * 8) * Math.cos(w * t);
    }
  }
}

function getProgress(frame: number, inPoint: number, outPoint: number, data: DataSourceConfig): number {
  const totalFrames = outPoint - inPoint;
  if (totalFrames <= 0) return 0;
  const localFrame = frame - inPoint;
  const rawT = Math.max(0, Math.min(1, localFrame / totalFrames));
  const easedT = easeValue(rawT, data.simulatedEasing);
  return data.simulatedStart + (data.simulatedEnd - data.simulatedStart) * easedT;
}

function colorOrDefault(style: SubElementStyle | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  return style?.fillColor ?? fallback;
}

function strokeOrDefault(style: SubElementStyle | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  return style?.strokeColor ?? fallback;
}

export function evaluateAnimationItem(
  itemConfig: AnimationItemConfig,
  dataSource: DataSourceConfig,
  frame: number,
  inPoint: number,
  outPoint: number,
): ResolvedAnimationElement[] {
  const progress = getProgress(frame, inPoint, outPoint, dataSource);

  switch (itemConfig.type) {
    case 'progressBar':
      return evaluateProgressBar(itemConfig.config, progress);
    case 'stopwatch':
    case 'countdown':
      return evaluateStopwatch(itemConfig.config, progress, frame, inPoint, outPoint);
    case 'counter':
      return evaluateCounter(itemConfig.config, progress);
    case 'ratingStars':
      return evaluateRatingStars(itemConfig.config, progress, frame, inPoint, outPoint);
    case 'loadingSpinner':
      return evaluateSpinner(itemConfig.config, frame, inPoint, outPoint);
    case 'gauge':
      return evaluateGauge(itemConfig.config, progress);
  }
}

function evaluateProgressBar(config: ProgressBarConfig, progress: number): ResolvedAnimationElement[] {
  const elements: ResolvedAnimationElement[] = [];
  const p = Math.max(0, Math.min(1, progress));
  const w = config.trackWidth;
  const h = config.trackHeight;

  if (config.shape === 'linear') {
    // Track background
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'rectangle', width: w, height: h,
        fillColor: colorOrDefault(config.trackStyle, [0.15, 0.2, 0.3, 1]),
        strokeColor: strokeOrDefault(config.trackStyle, [0, 0, 0, 0]),
        strokeWidth: config.trackStyle?.strokeWidth ?? 0,
        cornerRadius: config.trackStyle?.cornerRadius ?? h / 2,
      },
    });

    // Fill
    const fillWidth = w * p;
    const fillX = config.direction === 'ltr' ? -(w - fillWidth) / 2 : (w - fillWidth) / 2;
    elements.push({
      kind: 'shape',
      transform: { x: fillX, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'rectangle', width: fillWidth, height: h - 4,
        fillColor: colorOrDefault(config.fillStyle, [0.96, 0.71, 0, 1]),
        strokeColor: [0, 0, 0, 0],
        strokeWidth: 0,
        cornerRadius: config.fillStyle?.cornerRadius ?? (h - 4) / 2,
      },
    });

    // Label
    if (config.showLabel) {
      let labelText = '';
      if (config.labelFormat === 'percent') labelText = `${Math.round(p * 100)}%`;
      else if (config.labelFormat === 'fraction') labelText = `${Math.round(p * 100)}/100`;
      else labelText = config.labelTemplate.replace('{value}', String(Math.round(p * 100))).replace('{max}', '100');

      elements.push({
        kind: 'text',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        text: {
          content: labelText,
          fontSize: config.labelStyle?.fontSize ?? 14,
          fontFamily: config.labelStyle?.fontFamily ?? 'Inter',
          fontWeight: config.labelStyle?.fontWeight ?? 600,
          fillColor: colorOrDefault(config.labelStyle, [1, 1, 1, 1]),
          align: 'center',
        },
      });
    }
  } else if (config.shape === 'radial') {
    const radius = Math.min(w, h) / 2;
    // Track circle
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'arc', width: radius * 2, height: radius * 2,
        fillColor: [0, 0, 0, 0],
        strokeColor: colorOrDefault(config.trackStyle, [0.15, 0.2, 0.3, 1]),
        strokeWidth: config.trackStyle?.strokeWidth ?? 8,
        cornerRadius: 0,
        arcStart: config.radialStartAngle,
        arcSweep: config.radialSweep,
      },
    });
    // Fill arc
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'arc', width: radius * 2, height: radius * 2,
        fillColor: [0, 0, 0, 0],
        strokeColor: colorOrDefault(config.fillStyle, [0.96, 0.71, 0, 1]),
        strokeWidth: config.fillStyle?.strokeWidth ?? 8,
        cornerRadius: 0,
        arcStart: config.radialStartAngle,
        arcSweep: config.radialSweep * p,
      },
    });
    // Label
    if (config.showLabel) {
      elements.push({
        kind: 'text',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        text: {
          content: `${Math.round(p * 100)}%`,
          fontSize: config.labelStyle?.fontSize ?? 24,
          fontFamily: config.labelStyle?.fontFamily ?? 'Inter',
          fontWeight: config.labelStyle?.fontWeight ?? 700,
          fillColor: colorOrDefault(config.labelStyle, [1, 1, 1, 1]),
          align: 'center',
        },
      });
    }
  } else if (config.shape === 'segmented') {
    const segW = (w - config.segmentGap * (config.segmentCount - 1)) / config.segmentCount;
    for (let i = 0; i < config.segmentCount; i++) {
      const filled = (i + 1) / config.segmentCount <= p;
      const partial = !filled && i / config.segmentCount < p;
      const segX = -w / 2 + segW / 2 + i * (segW + config.segmentGap);
      elements.push({
        kind: 'shape',
        transform: { x: segX, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        shape: {
          type: 'rectangle', width: segW, height: h,
          fillColor: filled || partial
            ? colorOrDefault(config.fillStyle, [0.96, 0.71, 0, 1])
            : colorOrDefault(config.trackStyle, [0.15, 0.2, 0.3, 1]),
          strokeColor: [0, 0, 0, 0], strokeWidth: 0,
          cornerRadius: config.trackStyle?.cornerRadius ?? 4,
        },
      });
    }
  }

  return elements;
}

function evaluateStopwatch(config: StopwatchConfig, progress: number, frame: number, inPoint: number, outPoint: number): ResolvedAnimationElement[] {
  const elements: ResolvedAnimationElement[] = [];
  const totalFrames = outPoint - inPoint;
  const localFrame = frame - inPoint;
  const t = Math.max(0, Math.min(1, localFrame / totalFrames));
  const elapsed = config.direction === 'up'
    ? t * config.totalDurationSeconds
    : config.totalDurationSeconds * (1 - t);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = Math.floor(elapsed % 60);
  const ms = Math.floor((elapsed % 1) * 100);

  if (config.variant === 'digital') {
    let timeStr = '';
    if (config.showHours) timeStr += String(hours).padStart(2, '0') + ':';
    timeStr += String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    if (config.showMilliseconds) timeStr += '.' + String(ms).padStart(2, '0');

    elements.push({
      kind: 'text',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      text: {
        content: timeStr,
        fontSize: config.digitStyle?.fontSize ?? 48,
        fontFamily: config.digitStyle?.fontFamily ?? 'monospace',
        fontWeight: config.digitStyle?.fontWeight ?? 700,
        fillColor: colorOrDefault(config.digitStyle, [1, 1, 1, 1]),
        align: 'center',
      },
    });
  } else {
    // Analog clock face
    const faceSize = 200;
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'circle', width: faceSize, height: faceSize,
        fillColor: colorOrDefault(config.faceStyle, [0.08, 0.1, 0.15, 1]),
        strokeColor: strokeOrDefault(config.faceStyle, [0.3, 0.4, 0.5, 1]),
        strokeWidth: config.faceStyle?.strokeWidth ?? 3,
        cornerRadius: 0,
      },
    });

    // Tick marks (12 major)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 360 - 90;
      const rad = angle * Math.PI / 180;
      const outerR = faceSize / 2 - 8;
      const innerR = outerR - (i % 3 === 0 ? 15 : 8);
      const cx = Math.cos(rad) * (outerR + innerR) / 2;
      const cy = Math.sin(rad) * (outerR + innerR) / 2;
      elements.push({
        kind: 'shape',
        transform: { x: cx, y: cy, rotation: angle + 90, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        shape: {
          type: 'rectangle', width: 2, height: outerR - innerR,
          fillColor: colorOrDefault(config.handStyle, [0.8, 0.8, 0.8, 1]),
          strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 1,
        },
      });
    }

    // Minute hand
    const minuteAngle = (minutes / 60) * 360 - 90;
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: minuteAngle + 90, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.85, opacity: 1 },
      shape: {
        type: 'rectangle', width: 4, height: faceSize * 0.35,
        fillColor: colorOrDefault(config.handStyle, [0.9, 0.9, 0.9, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 2,
      },
    });

    // Second hand
    const secondAngle = (seconds / 60) * 360 - 90;
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: secondAngle + 90, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.85, opacity: 1 },
      shape: {
        type: 'rectangle', width: 2, height: faceSize * 0.4,
        fillColor: [0.96, 0.2, 0.2, 1],
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 1,
      },
    });

    // Center dot
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'circle', width: 8, height: 8,
        fillColor: [0.96, 0.2, 0.2, 1],
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
      },
    });
  }

  return elements;
}

function evaluateCounter(config: CounterConfig, progress: number): ResolvedAnimationElement[] {
  const value = config.startValue + (config.endValue - config.startValue) * Math.max(0, Math.min(1, progress));
  let formatted: string;
  if (config.decimalPlaces > 0) {
    formatted = value.toFixed(config.decimalPlaces);
  } else {
    formatted = String(Math.round(value));
  }
  if (config.thousandsSeparator) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }
  const display = config.prefix + formatted + config.suffix;

  return [{
    kind: 'text',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
    text: {
      content: display,
      fontSize: config.digitStyle?.fontSize ?? 64,
      fontFamily: config.digitStyle?.fontFamily ?? 'Inter',
      fontWeight: config.digitStyle?.fontWeight ?? 800,
      fillColor: colorOrDefault(config.digitStyle, [1, 1, 1, 1]),
      align: 'center',
    },
  }];
}

function evaluateRatingStars(config: RatingStarsConfig, progress: number, frame: number, inPoint: number, outPoint: number): ResolvedAnimationElement[] {
  const elements: ResolvedAnimationElement[] = [];
  const totalWidth = config.maxStars * config.starSize + (config.maxStars - 1) * config.starGap;
  const currentValue = config.targetValue * Math.max(0, Math.min(1, progress));

  for (let i = 0; i < config.maxStars; i++) {
    const starX = -totalWidth / 2 + config.starSize / 2 + i * (config.starSize + config.starGap);
    const fill = Math.max(0, Math.min(1, currentValue - i));

    let animScale = 1;
    if (config.animateSequentially && fill > 0) {
      const totalFrames = outPoint - inPoint;
      const localFrame = frame - inPoint;
      const starActivationT = i / config.maxStars;
      const currentT = localFrame / totalFrames;
      const timeSinceActive = currentT - starActivationT;
      if (timeSinceActive > 0 && timeSinceActive < 0.1) {
        const bounce = Math.sin(timeSinceActive / 0.1 * Math.PI);
        animScale = 1 + 0.2 * bounce;
      }
    }

    // Empty star
    elements.push({
      kind: 'shape',
      transform: { x: starX, y: 0, rotation: 0, scaleX: animScale, scaleY: animScale, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'circle', width: config.starSize, height: config.starSize,
        fillColor: colorOrDefault(config.emptyStyle, [0.2, 0.2, 0.25, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
      },
    });

    // Filled overlay
    if (fill > 0) {
      elements.push({
        kind: 'shape',
        transform: { x: starX, y: 0, rotation: 0, scaleX: animScale * fill, scaleY: animScale, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        shape: {
          type: 'circle', width: config.starSize, height: config.starSize,
          fillColor: colorOrDefault(config.filledStyle, [0.96, 0.71, 0, 1]),
          strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
        },
      });
    }
  }
  return elements;
}

function evaluateSpinner(config: LoadingSpinnerConfig, frame: number, inPoint: number, outPoint: number): ResolvedAnimationElement[] {
  const elements: ResolvedAnimationElement[] = [];
  const totalFrames = outPoint - inPoint;
  const localFrame = frame - inPoint;
  const t = (localFrame / totalFrames) * config.speed;

  if (config.variant === 'dots') {
    for (let i = 0; i < config.elementCount; i++) {
      const angle = (i / config.elementCount) * Math.PI * 2;
      const phase = ((t + i / config.elementCount) % 1);
      const scale = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const radius = config.size / 2 - 8;
      elements.push({
        kind: 'shape',
        transform: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          rotation: 0, scaleX: scale, scaleY: scale,
          anchorX: 0.5, anchorY: 0.5, opacity: 0.3 + 0.7 * scale,
        },
        shape: {
          type: 'circle', width: 10, height: 10,
          fillColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
          strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
        },
      });
    }
  } else if (config.variant === 'ring') {
    const rotation = t * 360;
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 0.2 },
      shape: {
        type: 'arc', width: config.size, height: config.size,
        fillColor: [0, 0, 0, 0],
        strokeColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
        strokeWidth: 4, cornerRadius: 0, arcStart: 0, arcSweep: 360,
      },
    });
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'arc', width: config.size, height: config.size,
        fillColor: [0, 0, 0, 0],
        strokeColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
        strokeWidth: 4, cornerRadius: 0, arcStart: 0, arcSweep: 90,
      },
    });
  } else if (config.variant === 'bars') {
    const barW = 6;
    const totalW = config.elementCount * barW + (config.elementCount - 1) * 4;
    for (let i = 0; i < config.elementCount; i++) {
      const phase = ((t + i / config.elementCount) % 1);
      const scaleY = 0.3 + 0.7 * Math.abs(Math.sin(phase * Math.PI));
      const x = -totalW / 2 + barW / 2 + i * (barW + 4);
      elements.push({
        kind: 'shape',
        transform: { x, y: 0, rotation: 0, scaleX: 1, scaleY, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
        shape: {
          type: 'rectangle', width: barW, height: config.size * 0.6,
          fillColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
          strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 3,
        },
      });
    }
  } else if (config.variant === 'pulse') {
    const scale = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
    const opacity = 1 - 0.5 * Math.abs(Math.sin(t * Math.PI * 2));
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: scale, scaleY: scale, anchorX: 0.5, anchorY: 0.5, opacity },
      shape: {
        type: 'circle', width: config.size, height: config.size,
        fillColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
      },
    });
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: scale * 0.6, scaleY: scale * 0.6, anchorX: 0.5, anchorY: 0.5, opacity: opacity * 0.5 },
      shape: {
        type: 'circle', width: config.size, height: config.size,
        fillColor: colorOrDefault(config.dotStyle, [0.96, 0.71, 0, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
      },
    });
  }
  return elements;
}

function evaluateGauge(config: GaugeConfig, progress: number): ResolvedAnimationElement[] {
  const elements: ResolvedAnimationElement[] = [];
  const p = Math.max(0, Math.min(1, progress));
  const size = 200;

  // Track arc
  elements.push({
    kind: 'shape',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
    shape: {
      type: 'arc', width: size, height: size,
      fillColor: [0, 0, 0, 0],
      strokeColor: colorOrDefault(config.trackStyle, [0.15, 0.2, 0.3, 1]),
      strokeWidth: config.trackStyle?.strokeWidth ?? 12,
      cornerRadius: 0,
      arcStart: config.startAngle,
      arcSweep: config.sweepAngle,
    },
  });

  // Fill arc
  elements.push({
    kind: 'shape',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
    shape: {
      type: 'arc', width: size, height: size,
      fillColor: [0, 0, 0, 0],
      strokeColor: colorOrDefault(config.fillStyle, [0.96, 0.71, 0, 1]),
      strokeWidth: config.fillStyle?.strokeWidth ?? 12,
      cornerRadius: 0,
      arcStart: config.startAngle,
      arcSweep: config.sweepAngle * p,
    },
  });

  // Tick marks
  if (config.showTicks) {
    for (let i = 0; i <= config.tickCount; i++) {
      const tickAngle = config.startAngle + (i / config.tickCount) * config.sweepAngle;
      const rad = tickAngle * Math.PI / 180;
      const outerR = size / 2 - 2;
      const innerR = outerR - 10;
      const cx = Math.cos(rad) * (outerR + innerR) / 2;
      const cy = Math.sin(rad) * (outerR + innerR) / 2;
      elements.push({
        kind: 'shape',
        transform: { x: cx, y: cy, rotation: tickAngle + 90, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 0.6 },
        shape: {
          type: 'rectangle', width: 2, height: 10,
          fillColor: [0.6, 0.6, 0.6, 1],
          strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 1,
        },
      });
    }
  }

  // Needle
  if (config.showNeedle) {
    const needleAngle = config.startAngle + config.sweepAngle * p;
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: needleAngle + 90, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.9, opacity: 1 },
      shape: {
        type: 'rectangle', width: 3, height: size * 0.4,
        fillColor: colorOrDefault(config.needleStyle, [0.96, 0.2, 0.2, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 1.5,
      },
    });
    // Center cap
    elements.push({
      kind: 'shape',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      shape: {
        type: 'circle', width: 12, height: 12,
        fillColor: colorOrDefault(config.needleStyle, [0.96, 0.2, 0.2, 1]),
        strokeColor: [0, 0, 0, 0], strokeWidth: 0, cornerRadius: 0,
      },
    });
  }

  // Value label
  if (config.showValueLabel) {
    const value = config.minValue + (config.maxValue - config.minValue) * p;
    const text = config.labelFormat
      ? config.labelFormat.replace('{value}', Math.round(value).toString())
      : Math.round(value).toString();
    elements.push({
      kind: 'text',
      transform: { x: 0, y: size * 0.2, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      text: {
        content: text,
        fontSize: config.labelStyle?.fontSize ?? 24,
        fontFamily: config.labelStyle?.fontFamily ?? 'Inter',
        fontWeight: config.labelStyle?.fontWeight ?? 700,
        fillColor: colorOrDefault(config.labelStyle, [1, 1, 1, 1]),
        align: 'center',
      },
    });
  }

  return elements;
}
