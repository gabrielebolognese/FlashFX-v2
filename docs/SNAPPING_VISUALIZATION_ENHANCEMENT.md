# Snapping Visualization Enhancement

## Overview
Enhanced the shape snapping system with prominent glowing visual guides that clearly show when and where shapes snap to canvas edges, canvas center, or other shapes.

## What Was Enhanced

### Previous State
- Snapping guides were extremely subtle (1px lines)
- Minimal glow effect (4px shadow)
- Low opacity (0.8)
- Hard to see during editing

### Enhanced State
- **Prominent guide lines**: 2-3px thick (yellow guides are 3px, orange are 2px)
- **Multi-layer glow effect**: Triple-shadow system creates strong luminous appearance
- **Full opacity**: Lines are now completely visible (opacity: 1)
- **Pulsing animation**: Smooth breathing effect that draws attention without being distracting

## Visual Feedback System

### Color Coding

#### Yellow Guides (#FFD700)
Used for **center alignment snapping**:
- Canvas center (horizontal)
- Canvas center (vertical)
- Element center-to-center alignment

**Visual Properties**:
- 3px line width
- Triple glow effect:
  - Inner glow: 12px spread
  - Medium glow: 20px spread
  - Outer glow: 30px spread with transparency

#### Orange Guides (#FF8C00)
Used for **edge snapping**:
- Canvas edges (top, bottom, left, right)
- Element edges (all sides)
- Element-to-element edge alignment (stacking and side-by-side)

**Visual Properties**:
- 2px line width
- Double glow effect:
  - Inner glow: 8px spread
  - Outer glow: 16px spread

### Animation
Custom pulse animation that:
- Cycles every 0.8 seconds
- Smoothly transitions between 100% and 70% opacity
- Adds brightness variation (1.0 to 1.3x)
- Creates a subtle "breathing" effect that catches the eye

## Snapping Behavior

### Canvas Snapping
The system automatically detects and shows guides when shapes align with:

1. **Canvas Center**
   - Horizontal center line (yellow, vertical guide)
   - Vertical center line (yellow, horizontal guide)
   - Shows when shape center aligns with canvas center

2. **Canvas Edges**
   - Top edge (orange, horizontal guide)
   - Bottom edge (orange, horizontal guide)
   - Left edge (orange, vertical guide)
   - Right edge (orange, vertical guide)

### Element-to-Element Snapping
Shows guides when shapes align with other shapes:

1. **Edge Alignment**
   - Left-to-left
   - Right-to-right
   - Top-to-top
   - Bottom-to-bottom

2. **Stacking**
   - Top edge to bottom edge (vertical stacking)
   - Bottom edge to top edge (vertical stacking)

3. **Side-by-Side**
   - Left edge to right edge (horizontal placement)
   - Right edge to left edge (horizontal placement)

4. **Center Alignment**
   - Center X-to-center X (yellow, vertical guide)
   - Center Y-to-center Y (yellow, horizontal guide)

## Technical Implementation

### Files Modified

#### `/src/components/design-tool/SnapGuides.tsx`
- Enhanced line thickness (1px → 2-3px)
- Implemented multi-layer glow effects
- Added custom pulse animation
- Differentiated between yellow and orange guides
- Increased opacity to maximum visibility

### Key Features

1. **Adaptive Line Width**
   ```typescript
   const lineWidth = isYellowGuide ? 3 : 2;
   ```
   Yellow center guides are slightly thicker to emphasize importance

2. **Layered Glow Effect**
   ```css
   boxShadow: `0 0 12px 3px color, 0 0 20px 6px color, 0 0 30px 9px rgba(..., 0.3)`
   ```
   Creates deep, luminous glow that's visible against any background

3. **Smooth Animation**
   ```css
   @keyframes snapPulse {
     0%, 100% { opacity: 1; filter: brightness(1); }
     50% { opacity: 0.7; filter: brightness(1.3); }
   }
   ```
   Breathing effect that maintains visibility while providing motion feedback

4. **Precise Positioning**
   - Lines are centered on snap points using transform
   - `translateX(-${lineWidth/2}px)` for vertical guides
   - `translateY(-${lineWidth/2}px)` for horizontal guides

## User Experience

### When Snapping Occurs
1. User drags a shape near a snap point
2. Shape automatically aligns when within threshold (8px / zoom)
3. Glowing guide line appears instantly
4. Guide pulses gently to confirm snapping
5. Guide disappears when drag ends or shape moves away

### Visual Clarity
- **High contrast**: Bright colors stand out against dark canvas
- **Motion feedback**: Pulsing animation confirms active snapping
- **Color meaning**: Yellow = center alignment, Orange = edge alignment
- **Non-intrusive**: Guides are semi-transparent and positioned behind elements

## Snap Threshold
- Default: 8 pixels
- Zoom-adjusted: `SNAP_THRESHOLD / zoom`
- Ensures consistent snap feel regardless of zoom level

## Performance Considerations
- Guides render only when actively snapping
- Minimal DOM elements (one div per active guide)
- CSS animations (hardware accelerated)
- Automatic cleanup when snapping ends

## Usage Tips for Users
1. **Enable Snapping**: Use the magnet icon in toolbar or press `Ctrl + ;`
2. **Drag Shapes**: Move shapes near edges or centers to see guides
3. **Color Meaning**:
   - Yellow = You're at the center of something
   - Orange = You're at an edge
4. **Multiple Guides**: Can snap horizontally and vertically simultaneously
5. **Disable When Needed**: Toggle snapping off for free-form placement

## Future Enhancement Possibilities
1. Distance indicators showing pixel spacing
2. Snap strength visualization
3. Custom snap point creation
4. Snap-to-grid visualization
5. Keyboard modifier for temporary snap disable
6. Snap sound effects
