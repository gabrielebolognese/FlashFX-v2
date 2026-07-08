import type {
  LayoutParams,
  ChildLayoutOverride,
  ComputedLayout,
  ComputedChildRect,
  EdgeInsets,
} from '../core/types';

export interface ChildMeasurement {
  id: string;
  override: ChildLayoutOverride;
  preferredWidth: number;
  preferredHeight: number;
}

export function computeLayout(
  params: LayoutParams,
  children: ChildMeasurement[],
  direction: 'horizontal' | 'vertical',
  containerConstraint?: { width: number; height: number },
): ComputedLayout {
  const visibleChildren = children.filter((c) => c.override.layoutVisibility !== 'gone');

  if (visibleChildren.length === 0) {
    const w = resolveSize(params.width, containerConstraint?.width ?? 0, 0, params.padding);
    const h = resolveSize(params.height, containerConstraint?.height ?? 0, 0, params.padding);
    return {
      containerSize: { width: clampSize(w, params.minWidth, params.maxWidth), height: clampSize(h, params.minHeight, params.maxHeight) },
      childRects: {},
    };
  }

  const isHorizontal = direction === 'horizontal';
  const pad = params.padding;

  const measured = visibleChildren.map((child) => {
    const w = clampSize(child.preferredWidth, child.override.minWidth, child.override.maxWidth);
    const h = clampSize(child.preferredHeight, child.override.minHeight, child.override.maxHeight);
    return { ...child, measuredWidth: w, measuredHeight: h };
  });

  const totalSpacing = params.spacing * Math.max(0, measured.length - 1);
  const totalMarginMain = measured.reduce((sum, c) => {
    return sum + (isHorizontal ? c.override.margin.left + c.override.margin.right : c.override.margin.top + c.override.margin.bottom);
  }, 0);

  const contentMainSize = measured.reduce((sum, c) => sum + (isHorizontal ? c.measuredWidth : c.measuredHeight), 0);
  const totalMainUsed = contentMainSize + totalSpacing + totalMarginMain;

  const paddingMain = isHorizontal ? pad.left + pad.right : pad.top + pad.bottom;
  const paddingCross = isHorizontal ? pad.top + pad.bottom : pad.left + pad.right;

  let containerMain = resolveSize(
    isHorizontal ? params.width : params.height,
    isHorizontal ? containerConstraint?.width ?? 0 : containerConstraint?.height ?? 0,
    totalMainUsed + paddingMain,
    undefined,
  );
  containerMain = clampSize(containerMain, isHorizontal ? params.minWidth : params.minHeight, isHorizontal ? params.maxWidth : params.maxHeight);

  const maxCrossChild = Math.max(...measured.map((c) => isHorizontal ? c.measuredHeight : c.measuredWidth));
  const totalCrossMargin = Math.max(...measured.map((c) => isHorizontal ? c.override.margin.top + c.override.margin.bottom : c.override.margin.left + c.override.margin.right), 0);

  let containerCross = resolveSize(
    isHorizontal ? params.height : params.width,
    isHorizontal ? containerConstraint?.height ?? 0 : containerConstraint?.width ?? 0,
    maxCrossChild + totalCrossMargin + paddingCross,
    undefined,
  );
  containerCross = clampSize(containerCross, isHorizontal ? params.minHeight : params.minWidth, isHorizontal ? params.maxHeight : params.maxWidth);

  const availableMain = containerMain - paddingMain;
  const availableCross = containerCross - paddingCross;

  // Grow / Shrink
  let leftover = availableMain - totalMainUsed;
  const finalSizes = measured.map((c) => ({
    ...c,
    finalMain: isHorizontal ? c.measuredWidth : c.measuredHeight,
    finalCross: isHorizontal ? c.measuredHeight : c.measuredWidth,
  }));

  if (leftover > 0) {
    const totalGrow = finalSizes.reduce((sum, c) => sum + c.override.grow, 0);
    if (totalGrow > 0) {
      for (const child of finalSizes) {
        if (child.override.grow > 0) {
          const extra = (child.override.grow / totalGrow) * leftover;
          child.finalMain += extra;
          child.finalMain = clampSize(
            child.finalMain,
            isHorizontal ? child.override.minWidth : child.override.minHeight,
            isHorizontal ? child.override.maxWidth : child.override.maxHeight,
          );
        }
      }
      leftover = 0;
    }
  } else if (leftover < 0) {
    const totalShrink = finalSizes.reduce((sum, c) => sum + c.override.shrink * c.finalMain, 0);
    if (totalShrink > 0) {
      const deficit = -leftover;
      for (const child of finalSizes) {
        const shrinkAmount = (child.override.shrink * child.finalMain / totalShrink) * deficit;
        child.finalMain = Math.max(0, child.finalMain - shrinkAmount);
        child.finalMain = clampSize(
          child.finalMain,
          isHorizontal ? child.override.minWidth : child.override.minHeight,
          isHorizontal ? child.override.maxWidth : child.override.maxHeight,
        );
      }
      leftover = 0;
    }
  }

  // Cross axis stretch
  for (const child of finalSizes) {
    const align = child.override.alignSelf ?? params.crossAxisAlignment;
    if (align === 'stretch') {
      const crossMargin = isHorizontal
        ? child.override.margin.top + child.override.margin.bottom
        : child.override.margin.left + child.override.margin.right;
      child.finalCross = availableCross - crossMargin;
      child.finalCross = clampSize(
        child.finalCross,
        isHorizontal ? child.override.minHeight : child.override.minWidth,
        isHorizontal ? child.override.maxHeight : child.override.maxWidth,
      );
    }
  }

  // Main axis positions
  const recalcLeftover = availableMain - finalSizes.reduce((s, c) => s + c.finalMain, 0) - totalSpacing - totalMarginMain;
  const positions = computeMainPositions(finalSizes, params, recalcLeftover, isHorizontal);

  // Cross axis positions
  const childRects: Record<string, ComputedChildRect> = {};
  for (let i = 0; i < finalSizes.length; i++) {
    const child = finalSizes[i];
    const mainPos = positions[i];
    const crossPos = computeCrossPosition(child, params, availableCross, isHorizontal);

    const offsetMain = isHorizontal ? pad.left : pad.top;
    const offsetCross = isHorizontal ? pad.top : pad.left;

    if (isHorizontal) {
      childRects[child.id] = {
        x: mainPos + offsetMain,
        y: crossPos + offsetCross,
        width: child.finalMain,
        height: child.finalCross,
      };
    } else {
      childRects[child.id] = {
        x: crossPos + offsetCross,
        y: mainPos + offsetMain,
        width: child.finalCross,
        height: child.finalMain,
      };
    }
  }

  return {
    containerSize: {
      width: isHorizontal ? containerMain : containerCross,
      height: isHorizontal ? containerCross : containerMain,
    },
    childRects,
  };
}

function resolveSize(
  sizeValue: { type: string; value?: number; fraction?: number },
  parentSize: number,
  contentSize: number,
  _padding?: EdgeInsets,
): number {
  if (sizeValue.type === 'fixed') return sizeValue.value ?? 100;
  if (sizeValue.type === 'wrapContent') return contentSize;
  if (sizeValue.type === 'fillParent') return parentSize * (sizeValue.fraction ?? 1);
  return contentSize;
}

function clampSize(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(v, min);
  if (max !== undefined) v = Math.min(v, max);
  return v;
}

function computeMainPositions(
  children: { finalMain: number; override: ChildLayoutOverride }[],
  params: LayoutParams,
  leftover: number,
  isHorizontal: boolean,
): number[] {
  const n = children.length;
  const positions: number[] = [];
  const { spacing, mainAxisAlignment } = params;

  let startOffset = 0;
  let gap = spacing;

  const totalGrow = children.reduce((s, c) => s + c.override.grow, 0);
  const hasGrow = totalGrow > 0;

  if (!hasGrow && leftover > 0) {
    switch (mainAxisAlignment) {
      case 'start': break;
      case 'end': startOffset = leftover; break;
      case 'center': startOffset = leftover / 2; break;
      case 'spaceBetween':
        if (n > 1) gap = spacing + leftover / (n - 1);
        break;
      case 'spaceAround':
        gap = spacing + leftover / n;
        startOffset = (leftover / n) / 2;
        break;
      case 'spaceEvenly':
        gap = spacing + leftover / (n + 1);
        startOffset = leftover / (n + 1);
        break;
    }
  }

  let cursor = startOffset;
  for (let i = 0; i < n; i++) {
    const child = children[i];
    const marginBefore = isHorizontal ? child.override.margin.left : child.override.margin.top;
    const marginAfter = isHorizontal ? child.override.margin.right : child.override.margin.bottom;
    cursor += marginBefore;
    positions.push(cursor);
    cursor += child.finalMain + marginAfter;
    if (i < n - 1) cursor += gap;
  }

  return positions;
}

function computeCrossPosition(
  child: { finalCross: number; override: ChildLayoutOverride },
  params: LayoutParams,
  availableCross: number,
  isHorizontal: boolean,
): number {
  const align = child.override.alignSelf ?? params.crossAxisAlignment;
  const marginBefore = isHorizontal ? child.override.margin.top : child.override.margin.left;
  const marginAfter = isHorizontal ? child.override.margin.bottom : child.override.margin.right;
  const usable = availableCross - marginBefore - marginAfter;

  switch (align) {
    case 'start': return marginBefore;
    case 'end': return marginBefore + usable - child.finalCross;
    case 'center': return marginBefore + (usable - child.finalCross) / 2;
    case 'stretch': return marginBefore;
    case 'baseline': return marginBefore;
    default: return marginBefore;
  }
}

// ─── Grid Layout ───

export function computeGridLayout(
  params: LayoutParams,
  children: ChildMeasurement[],
): ComputedLayout {
  const visibleChildren = children.filter((c) => c.override.layoutVisibility !== 'gone');
  const pad = params.padding;
  const columns = Math.max(1, params.gridColumns ?? 3);
  const hGap = params.gridHGap ?? 20;
  const vGap = params.gridVGap ?? 20;
  const hAlign = params.gridHAlign ?? 'start';
  const vAlign = params.gridVAlign ?? 'start';

  if (visibleChildren.length === 0) {
    const w = resolveSize(params.width, 0, 0, params.padding);
    const h = resolveSize(params.height, 0, 0, params.padding);
    return {
      containerSize: { width: clampSize(w, params.minWidth, params.maxWidth), height: clampSize(h, params.minHeight, params.maxHeight) },
      childRects: {},
    };
  }

  const measured = visibleChildren.map((child) => {
    const w = clampSize(child.preferredWidth, child.override.minWidth, child.override.maxWidth);
    const h = clampSize(child.preferredHeight, child.override.minHeight, child.override.maxHeight);
    return { ...child, measuredWidth: w, measuredHeight: h };
  });

  const rows = Math.ceil(measured.length / columns);

  const colWidths: number[] = new Array(columns).fill(0);
  const rowHeights: number[] = new Array(rows).fill(0);

  for (let i = 0; i < measured.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    colWidths[col] = Math.max(colWidths[col], measured[i].measuredWidth);
    rowHeights[row] = Math.max(rowHeights[row], measured[i].measuredHeight);
  }

  const contentWidth = colWidths.reduce((s, w) => s + w, 0) + hGap * Math.max(0, columns - 1);
  const contentHeight = rowHeights.reduce((s, h) => s + h, 0) + vGap * Math.max(0, rows - 1);

  const paddingH = pad.left + pad.right;
  const paddingV = pad.top + pad.bottom;

  let containerWidth = resolveSize(params.width, 0, contentWidth + paddingH, undefined);
  containerWidth = clampSize(containerWidth, params.minWidth, params.maxWidth);

  let containerHeight = resolveSize(params.height, 0, contentHeight + paddingV, undefined);
  containerHeight = clampSize(containerHeight, params.minHeight, params.maxHeight);

  const availableWidth = containerWidth - paddingH;
  const availableHeight = containerHeight - paddingV;

  let offsetX = pad.left;
  if (hAlign === 'center') offsetX += (availableWidth - contentWidth) / 2;
  else if (hAlign === 'end') offsetX += availableWidth - contentWidth;

  let offsetY = pad.top;
  if (vAlign === 'center') offsetY += (availableHeight - contentHeight) / 2;
  else if (vAlign === 'end') offsetY += availableHeight - contentHeight;

  const childRects: Record<string, ComputedChildRect> = {};

  for (let i = 0; i < measured.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const child = measured[i];

    let cellX = offsetX;
    for (let c = 0; c < col; c++) cellX += colWidths[c] + hGap;

    let cellY = offsetY;
    for (let r = 0; r < row; r++) cellY += rowHeights[r] + vGap;

    const cellW = colWidths[col];
    const cellH = rowHeights[row];

    const x = cellX + (cellW - child.measuredWidth) / 2;
    const y = cellY + (cellH - child.measuredHeight) / 2;

    childRects[child.id] = {
      x,
      y,
      width: child.measuredWidth,
      height: child.measuredHeight,
    };
  }

  return {
    containerSize: { width: containerWidth, height: containerHeight },
    childRects,
  };
}

// ─── Memoization ───

let lastInputHash = '';
let lastResult: ComputedLayout | null = null;

export function computeLayoutMemoized(
  params: LayoutParams,
  children: ChildMeasurement[],
  direction: 'horizontal' | 'vertical',
  containerConstraint?: { width: number; height: number },
): ComputedLayout {
  const hash = JSON.stringify({ params, children, direction, containerConstraint });
  if (hash === lastInputHash && lastResult) return lastResult;
  lastInputHash = hash;
  lastResult = computeLayout(params, children, direction, containerConstraint);
  return lastResult;
}
