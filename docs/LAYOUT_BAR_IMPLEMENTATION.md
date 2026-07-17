# Layout Bar Implementation

## Overview

The Layout Bar feature enables users to switch between two distinct layout modes in the video editing application: **Design Mode** and **Edit Mode**. The bar is positioned at the bottom of the preview panel and provides seamless transitions between layout configurations.

## Feature Requirements

- **Position**: Bottom of preview panel (not canvas area)
- **Width**: Tabs occupy 50% of preview panel width
- **Tabs**: Two tabs - "Design" and "Edit"
- **Design Mode**: 3-column, single-row layout with hidden timelines
- **Edit Mode**: 3-column top row + full-width dual timeline bottom row
- **UI Consistency**: Matches existing design system with gradient buttons

## Architecture

### 1. Layout Mode Hook (`useLayoutMode.ts`)

Manages layout mode state and transitions:

```typescript
export type LayoutMode = 'design' | 'edit';

export const useLayoutMode = () => {
  const [currentMode, setCurrentMode] = useState<LayoutMode>('design');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const setMode = useCallback((mode: LayoutMode) => {
    if (mode === currentMode) return;
    setIsTransitioning(true);
    setCurrentMode(mode);
    setTimeout(() => setIsTransitioning(false), 150);
  }, [currentMode]);

  return { currentMode, setMode, isTransitioning };
};
```

### 2. Layout Bar Component (`LayoutBar.tsx`)

A compact switching interface with two buttons:

- **Design Tab**: Activates 3-column layout without timelines
- **Edit Tab**: Activates dual timeline layout
- **Active State**: Gradient background (yellow to orange)
- **Inactive State**: Gray with hover effects
- **Disabled State**: During transitions

### 3. Design Mode Layout (`DesignModeLayout.tsx`)

The main layout component that dynamically adjusts its grid configuration:

#### Design Mode Grid:
```css
grid-template-columns: 25% 50% 25%
grid-template-rows: 100%
```

#### Edit Mode Grid:
```css
grid-template-columns: 25% 50% 25%
grid-template-rows: 60% 40%
```

The bottom row (timelines) spans all three columns and is only rendered in Edit mode.

## Implementation Details

### Conditional Timeline Rendering

```typescript
{currentMode === 'edit' && (
  <div style={{ gridColumn: '1 / 4' }} className="overflow-hidden">
    <div className="h-full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <GeneralTimeline {...props} />
      <AnimationTimeline {...props} />
    </div>
  </div>
)}
```

### Layout Bar Positioning

The LayoutBar is positioned at the bottom of the canvas container:

```typescript
<div className="flex-1 flex flex-col bg-white relative overflow-hidden">
  <div className="flex-1 relative overflow-hidden">
    <Canvas {...canvasProps} />
  </div>
  <div className="flex-shrink-0">
    <LayoutBar {...layoutBarProps} />
  </div>
</div>
```

### Transition Handling

Transitions are managed through opacity changes and disabled states:

```typescript
const gridLayout = currentMode === 'design'
  ? {
      gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
      gridTemplateRows: '100%',
    }
  : {
      gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
      gridTemplateRows: `${topRowHeight}% ${bottomRowHeight}%`,
    };
```

## User Experience

### Design Mode
- **Purpose**: Focus on visual design and element placement
- **Layout**: Full-height canvas with layers panel (left) and properties panel (right)
- **Timelines**: Hidden to maximize canvas workspace
- **Use Case**: Creating and arranging visual elements

### Edit Mode
- **Purpose**: Animation and timeline editing
- **Layout**: Canvas area above, dual timelines below
- **Timelines**:
  - General Timeline (left 50%): Overview of all elements
  - Animation Timeline (right 50%): Detailed keyframe editing
- **Use Case**: Animating elements and managing timeline clips

## Styling

The Layout Bar uses the application's existing design system:

- **Background**: `bg-gray-800/30` with backdrop blur
- **Container**: `bg-gray-800/50` rounded corners
- **Active Button**: Gradient from yellow-400 to orange-500
- **Inactive Button**: Gray-400 text with hover effects
- **Border**: Top border with gray-700/50
- **Icons**: Lucide React icons (Palette for Design, Film for Edit)

## Integration Points

### LayoutManager Component

The LayoutManager passes the current mode to DesignModeLayout:

```typescript
const renderLayout = () => {
  return <DesignModeLayout {...commonProps} />;
};
```

### UIDesignTool Integration

The layout mode is managed at the top level and passed through the component hierarchy.

## Testing Checklist

- [ ] Design mode shows 3-column layout without timelines
- [ ] Edit mode shows 3-column top + dual timeline bottom
- [ ] Smooth transitions between modes (150ms)
- [ ] Layout bar positioned correctly at bottom of preview panel
- [ ] Buttons disabled during transitions
- [ ] Active state styling matches design system
- [ ] Responsive behavior maintained
- [ ] No layout shifts or flickering during mode changes

## Files Modified

1. `src/hooks/useLayoutMode.ts` - Layout mode state management
2. `src/components/layout/LayoutBar.tsx` - Tab switching component
3. `src/components/layout/modes/DesignModeLayout.tsx` - Dynamic grid layout
4. `src/components/layout/LayoutManager.tsx` - Integration point

## Build Status

The implementation has been verified with a successful build:
```
npm run build
```

All TypeScript compilation checks passed without errors.
