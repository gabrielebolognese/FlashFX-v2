# Canvas Background Feature Documentation

## Overview

The FlashFX canvas now supports fully customizable backgrounds with solid colors, gradients, and multiple overlay layers. Users can configure backgrounds through the Properties Panel when no shapes are selected.

## Features

### Background Configuration

- **Up to 4 gradient layers** with independent controls
- **Solid colors** or **gradients** per layer
- **Linear gradients** with 6 directional presets
- **Radial gradients** with 5 positional presets
- **Blend modes** for layer composition
- **Per-color opacity** control
- **Color stop positioning** with drag controls
- **Real-time preview** on canvas

## User Interface

### Accessing Background Settings

1. **Deselect all shapes** on the canvas
2. The **Properties Panel** (right side) automatically shows **Background Settings**
3. When shapes are selected, panel shows shape properties as usual

### Panel Structure

```
┌─────────────────────────────────┐
│ 🎨 Background Settings          │
├─────────────────────────────────┤
│ [Layer controls]                │
│ [Gradient configuration]        │
│ [Color stop management]         │
│ [Add Layer button]              │
└─────────────────────────────────┘
```

### Adding Colors/Layers

1. Click **"Add First Color"** to create initial layer
2. Click **"+ Add Gradient Layer"** to add more layers (max 4)
3. Each layer shows:
   - Layer number and type (Solid/Gradient)
   - Expand/collapse controls
   - Move up/down buttons
   - Delete button

### Layer Configuration

When expanded, each layer provides:

#### For Single Color (Solid)
- Color picker
- Hex color input

#### For Multiple Colors (Gradient)
- **Gradient Type**: Linear or Radial
- **Direction** (Linear):
  - Top → Bottom
  - Bottom → Top
  - Left → Right
  - Right → Left
  - Diagonal ↘
  - Diagonal ↙
- **Position** (Radial):
  - Center
  - Top Left
  - Top Right
  - Bottom Left
  - Bottom Right
- **Blend Mode**:
  - Normal, Multiply, Screen, Overlay
  - Darken, Lighten, Color Dodge, Color Burn
  - Hard Light, Soft Light, Difference, Exclusion

#### Color Stop Management

Each color in a gradient has:
- Color picker and hex input
- Position slider (0-100%)
- Opacity slider (0-100%)
- Delete button (if more than 1 color)
- Add Color button (up to 10 colors per layer)

### Layer Ordering

- Layers stack from bottom to top
- Use **↑** and **↓** buttons to reorder
- Blend modes affect how layers combine

## Technical Implementation

### Type System

```typescript
// Background configuration types
export interface BackgroundConfig {
  enabled: boolean;
  layers: GradientLayer[];
}

export interface GradientLayer {
  id: string;
  type: 'linear' | 'radial';
  colorStops: ColorStop[];
  direction?: LinearDirection;
  radialType?: RadialType;
  angle?: number;
  blendMode: BlendMode;
  opacity: number;
}

export interface ColorStop {
  id: string;
  color: string;      // hex format
  opacity: number;    // 0-100
  position: number;   // 0-100
}
```

### File Structure

```
/src/types/background.ts              # Type definitions
/src/components/layout/
  BackgroundSettingsPanel.tsx         # UI component
  PropertiesPanel.tsx                 # Integration point
/src/components/design-tool/
  Canvas.tsx                          # Rendering
```

### Canvas Rendering

Background is applied as CSS styles:
```typescript
const style = {
  backgroundColor: config.enabled ? undefined : '#1F2937',
  backgroundImage: layers.map(generateGradientCSS).join(', '),
  backgroundBlendMode: layers.map(l => l.blendMode).join(', ')
};
```

## Export Behavior

### Canvas Export (Full Scene)

When exporting the entire canvas:
- Background **IS INCLUDED** exactly as rendered
- Gradients and colors are captured
- Blend modes are preserved
- Export formats: PNG (with background) or JPEG

### Shape Export (Individual/ZIP)

When exporting shapes individually:
- Background **IS NOT INCLUDED**
- Shapes exported with **transparent background**
- Each shape maintains its position
- Perfect for animation workflows

## Usage Examples

### Solid Background

1. Deselect all shapes
2. Click "Add First Color"
3. Choose color from picker
4. Canvas updates immediately

### Linear Gradient

1. Add a layer
2. Click "+ Add" next to Colors
3. Select gradient type: Linear
4. Choose direction: Top → Bottom
5. Adjust color stops as needed

### Multi-Layer Gradient

1. Create first gradient layer
2. Click "Add Gradient Layer"
3. Configure second gradient
4. Set blend mode (e.g., Overlay)
5. Adjust opacity per color stop
6. Reorder layers if needed

### Complex Background

1. Add 3-4 layers
2. Mix linear and radial gradients
3. Use different blend modes per layer
4. Fine-tune color stop positions
5. Adjust overall layer opacity

## Keyboard Shortcuts

None currently. Background is managed entirely through Properties Panel.

## Integration Points

### State Management

Background config stored in `UIDesignTool` state:
```typescript
const [background, setBackground] = useState<BackgroundConfig>(
  createDefaultBackground()
);
```

### Canvas Component

Receives background as prop:
```typescript
<Canvas
  background={background}
  // ... other props
/>
```

### Properties Panel

Shows background settings when no selection:
```typescript
<PropertiesPanel
  selectedElements={[]}
  background={background}
  onUpdateBackground={setBackground}
/>
```

## Project Persistence

Background configuration is part of the project schema:

```typescript
interface ProjectFile {
  canvas: {
    width: number;
    height: number;
    background?: BackgroundConfig;
  };
  // ... other fields
}
```

Save/load automatically handles background serialization.

## Performance Considerations

- **CSS-based rendering**: GPU accelerated
- **Real-time updates**: No performance impact
- **Multiple layers**: Efficient blend mode composition
- **Export optimization**: Background detection prevents double rendering

## Browser Compatibility

- Chrome: Full support
- Firefox: Full support
- Safari: Full support
- Edge: Full support

Requires CSS gradient and blend mode support (all modern browsers).

## Limitations

- Maximum 4 gradient layers
- Maximum 10 color stops per layer
- Blend modes depend on browser implementation
- Export captures visual appearance, not editable gradients

## Future Enhancements

Potential improvements:
- Gradient angle slider for custom directions
- Gradient presets library
- Background image support
- Pattern fills
- Animated gradients
- Import/export background configs
- Background templates

## Troubleshooting

### Background not showing
- Ensure no shapes are selected
- Check that layer has at least one color
- Verify background.enabled is true

### Colors look different than expected
- Check blend modes on overlapping layers
- Verify opacity settings on color stops
- Review layer stacking order

### Export includes/excludes background incorrectly
- Canvas export: Always includes background
- Shape export: Always transparent
- This is intentional behavior

### Performance issues
- Unlikely with CSS gradients
- Try reducing number of layers
- Simplify color stops per layer

## API Reference

### Functions

```typescript
// Create default background
createDefaultBackground(): BackgroundConfig

// Create default gradient layer
createDefaultGradientLayer(): GradientLayer

// Create default color stop
createDefaultColorStop(color?: string, position?: number): ColorStop

// Generate CSS gradient string
getGradientCSS(layer: GradientLayer): string

// Convert hex to rgba
hexToRgba(hex: string, alpha: number): string

// Generate complete background style
generateBackgroundStyle(config: BackgroundConfig): CSSProperties
```

### Component Props

```typescript
interface BackgroundSettingsPanelProps {
  background: BackgroundConfig;
  onUpdate: (background: BackgroundConfig) => void;
}
```

## Best Practices

1. **Start simple**: Begin with 1-2 layers
2. **Test exports**: Verify background appears correctly
3. **Use blend modes**: Overlay and Screen work well
4. **Mind performance**: 2-3 layers is usually sufficient
5. **Save presets**: Document successful configurations
6. **Preview often**: Real-time preview shows exact result

## Support

For issues or questions:
1. Verify browser compatibility
2. Check console for errors
3. Review background configuration
4. Test with simple solid color first
5. Ensure project state is valid
