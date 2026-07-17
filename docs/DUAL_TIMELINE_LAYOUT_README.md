# Dual Timeline Layout - Implementation Guide

## Overview

FlashFX now features a dual-timeline layout system with synchronized playback control. This is a **layout-only change** - all existing features, rendering, shortcuts, and business logic remain unchanged.

## Layout Structure

The interface is divided into:

### Top Band (60% height)
- **Left Column (25% width)**: Layers Panel
- **Center Column (50% width)**: Canvas with red Toolbar on top, white canvas below
- **Right Column (25% width)**: Properties Panel

### Bottom Band (40% height)
- **Left Half (50% width)**: General Timeline - displays clips per layer
- **Right Half (50% width)**: Animation Timeline - placeholder for future keyframe features

**Playhead Style:**
- Yellow colored for high visibility
- Extends full height of each timeline panel (not just the ruler)
- Perfectly synchronized between both timelines
- Draggable from the yellow square handle in the ruler
- Click anywhere on the timeline tracks to seek

## File Locations

### Main Layout File
- `src/components/layout/modes/DesignModeLayout.tsx`
  - Contains the CSS Grid configuration
  - Default percentages defined at lines 96-98:
    - `leftColumnWidth: 25%`
    - `rightColumnWidth: 25%`
    - `topRowHeight: 60%`

### Timeline Components
- `src/components/timeline/GeneralTimeline.tsx` - Displays timeline clips for each shape/layer
- `src/components/timeline/AnimationTimeline.tsx` - Placeholder for property keyframes (disabled)
- `src/components/timeline/ResizableSplitter.tsx` - Draggable splitters (prepared for future use)

## Changing Default Layout Percentages

To modify the default layout proportions, edit `DesignModeLayout.tsx` (lines 96-98):

```typescript
const [leftColumnWidth, setLeftColumnWidth] = useState(25);    // Left panel width %
const [rightColumnWidth, setRightColumnWidth] = useState(25);  // Right panel width %
const [topRowHeight, setTopRowHeight] = useState(60);          // Top band height %
```

**Examples:**
- Make canvas wider: Change `leftColumnWidth` and `rightColumnWidth` to `20` each
- More timeline space: Change `topRowHeight` to `50`
- Narrow layers panel: Change `leftColumnWidth` to `20`

## Timeline Features

### General Timeline (Bottom-Left, Blue)
- Displays one track row per shape/layer
- Each track contains a clip representing the shape's timeline presence
- Default clip duration: 5 seconds
- Clips show under playhead when active (yellow ring highlight)
- Synchronized ruler with seconds and frame markers
- Click ruler or drag playhead to seek

### Animation Timeline (Bottom-Right, Green)
- **Currently a placeholder** - no animation features implemented
- Displays property tracks when a clip is selected
- Shows disabled state with message: "Animation features disabled — timeline reserved"
- Property rows: Position, Scale, Rotation, Opacity, Fill Color, Stroke
- Add Keyframe button is disabled

## Playhead Synchronization

- Single playhead controls both timelines simultaneously
- **Yellow full-height playhead** visible across entire timeline panel height
- Current time displayed in format: `HH:MM:SS:FF`
- Seeking in either timeline updates both timelines and canvas instantly
- Playhead state managed in `DesignModeLayout.tsx`:
  - `currentTime` - current playback position in seconds
  - `duration` - total timeline duration (default: 10s)
  - `fps` - frames per second (default: 30)
- Both timelines share the same `onSeek` callback ensuring perfect synchronization

## What Was NOT Changed

- Canvas rendering pipeline
- Shape creation and manipulation logic
- Keyboard shortcuts
- Export functionality
- All existing tool behaviors
- Grid system
- Snap behavior
- History (undo/redo)
- All component internal logic

## Technical Implementation

### CSS Grid Configuration
The layout uses CSS Grid with dynamic percentages:

```typescript
display: 'grid',
gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
gridTemplateRows: `${topRowHeight}% ${bottomRowHeight}%`,
```

### Grid Cell Assignment
- Layers: `grid-column: 1; grid-row: 1`
- Canvas: `grid-column: 2; grid-row: 1`
- Properties: `grid-column: 3; grid-row: 1`
- General Timeline: `grid-column: 1 / 3; grid-row: 2` (spans 2 columns)
- Animation Timeline: `grid-column: 3 / 4; grid-row: 2`

## Clip Creation Logic

When a new shape is created on the canvas:
1. A corresponding layer entry appears in the Layers panel (left)
2. A clip is automatically created in the General Timeline
3. Clip inherits the shape's color and name
4. Default duration: 5 seconds starting at 0
5. Clip ID: `clip-{shapeID}`

## Future Enhancements (Not Implemented)

- Resizable splitters (component exists but not wired)
- Zoom controls for timeline
- Snap to clip boundaries
- Clip trimming and splitting
- Keyframe editing in Animation Timeline
- Play/Pause button (currently disabled)
- Audio waveform display

## Testing Checklist

- ✅ Layout matches image proportions (25%|50%|25% columns, 60%|40% rows)
- ✅ Red toolbar bar unchanged in size and position
- ✅ All existing features work (shapes, selection, properties)
- ✅ Creating shapes adds clips to General Timeline
- ✅ Playhead moves and syncs between timelines
- ✅ Animation Timeline shows placeholder message
- ✅ No changes to rendering or playback logic
- ✅ Build completes without errors

## Troubleshooting

**Timeline not showing clips:**
- Verify shapes exist on canvas
- Check browser console for errors

**Layout proportions off:**
- Check `leftColumnWidth`, `rightColumnWidth`, `topRowHeight` state values
- Verify CSS Grid template strings

**Playhead not moving:**
- Check `currentTime` state updates
- Verify `onSeek` callback wiring

## Support

For layout adjustments, modify the state initialization in `DesignModeLayout.tsx`.
For timeline behavior, edit the respective timeline components in `src/components/timeline/`.
