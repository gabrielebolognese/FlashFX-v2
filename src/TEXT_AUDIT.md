# TEXT SYSTEM AUDIT

## 1. File Map

| File | Role | Status | Used By |
|------|------|--------|---------|
| `src/core/types.ts` (lines 72-90, 291-317, 885-904) | TextAlign, TextMode, TextStyle, TextLayer, ResolvedText type definitions | MODIFY - replace text types inline | Everything |
| `src/core/factory.ts` (lines 373-420) | createTextStyle(), createTextLayer() | MODIFY - replace both functions | store/editor.ts |
| `src/core/interpolation.ts` (lines 316-343) | resolveTextLayer() - converts TextLayer to ResolvedText | MODIFY - rewrite resolver | engine/timeline.ts, playback |
| `src/core/textExplode.ts` | Text splitting for per-glyph animation | KEEP - update to new data model | store/editor.ts |
| `src/engine/textAtlas.ts` | Canvas 2D text rasterization + caching | KEEP - this IS the renderer boundary | engine/renderer.ts, textExplode.ts |
| `src/engine/textExplodePersistence.ts` | Supabase persistence for explode metadata | KEEP - no changes needed |  store/editor.ts |
| `src/engine/renderer.ts` (lines 1835-1883) | WebGPU text pipeline - consumes ResolvedText | KEEP - no changes | - |
| `src/ui/panels/Inspector.tsx` (lines 1269-1466, 1169-1267) | TextProperties, TextMotionControlSection | MODIFY - rewrite text sections | App |
| `src/store/editor.ts` | addText(), explodeTextLayer(), updateLayerProperty() | MODIFY - update text actions | UI |

## 2. Problems with Current Data Model

### 2.1 Single-span limitation
The current model stores `text.content` as a single string with a single `TextStyle`. There is no way to apply different styles to different parts of the text (e.g., one word bold, another colored). This is a hard limitation - not just a missing UI feature.

### 2.2 measuredWidth/measuredHeight in ResolvedText
`ResolvedText` includes `measuredWidth` and `measuredHeight` which are computed layout data stored alongside source data. The measurement is done eagerly during resolution (calling `measureText()` inside `resolveTextLayer()`). This means measurement happens on EVERY frame even for static text, and the computed data pollutes the model.

### 2.3 materialConfig and patternFill on TextStyle
`TextStyle` has `materialConfig?: ShapeMaterialConfig` and `patternFill?: ShapePatternConfig` which are shape-layer concepts that leaked into the text style. These create confusion about what drives the fill color. `resolveDominantColor()` is called in `resolveTextLayer()` to reconcile these.

### 2.4 No vertical alignment
When `mode === 'box'`, there's no vertical alignment option. Text just starts from the top.

### 2.5 No text transform
No uppercase/lowercase/capitalize option - a basic motion graphic need.

### 2.6 No bounding box type system
Only two modes: 'point' (auto-size) and 'box' (fixed dimensions). Missing the 'fixedWidth' case (width constrained, height auto) which is the most common case for lower-thirds.

### 2.7 AnimatableProperty wrapping
fontSize, lineHeight, letterSpacing, strokeWidth use AnimatableProperty which works with the keyframe system. This is correct for animation but the property addressing path is awkward: `text.style.fontSize.defaultValue`. The new model should keep this pattern since it works with the existing keyframe and procedural loop systems.

### 2.8 No font loading system
Fonts are referenced by name (`fontFamily: 'Inter'`) but there's no loading mechanism. The Canvas 2D API just uses whatever the browser has - if a font isn't loaded, it silently falls back to sans-serif with no indicator to the user.

## 3. Renderer Interface Boundary (SACRED - DO NOT CHANGE)

### Input: `ResolvedText`
```typescript
interface ResolvedText {
  content: string;
  mode: 'point' | 'box';
  boxWidth: number;
  boxHeight: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: number;
  textAlign: 'left' | 'center' | 'right';
  underline: boolean;
  strikethrough: boolean;
  measuredWidth: number;
  measuredHeight: number;
}
```

### Consumption: `renderTextToCanvas(text: ResolvedText): CachedTextEntry | null`
Returns: `{ bitmap: ImageBitmap; width: number; height: number; key: string }`

### Also consumed by: `textCacheKey()`, `measureText()`, `getTextLayout()`, `measureStringWidth()`, `measureAdvance()`, `buildFontString()`

### WebGPU uniform layout (per text layer):
- float[0-1]: frame width, height
- float[2-3]: position X, Y (from transform)
- float[4-5]: rendered.width * scaleX, rendered.height * scaleY
- float[6-7]: anchor X, Y
- float[8]: rotation in radians
- float[9]: opacity
- float[10-107]: mask uniforms (up to 12 masks)

## 4. Decision: What Changes, What Stays

### STAYS UNCHANGED (byte-for-byte):
- `src/engine/textAtlas.ts` - the renderer/rasterizer
- `src/engine/renderer.ts` - the WebGPU pipeline
- The `ResolvedText` interface shape (the renderer contract)
- `src/engine/textExplodePersistence.ts` - unrelated persistence

### MODIFIED IN-PLACE:
- `src/core/types.ts` - new TextLayer type, keep ResolvedText
- `src/core/factory.ts` - new createTextLayer
- `src/core/interpolation.ts` - new resolveTextLayer that handles spans
- `src/core/textExplode.ts` - adapt to new data model
- `src/store/editor.ts` - update addText, text editing actions
- `src/ui/panels/Inspector.tsx` - rewrite TextProperties component

### NEW FILES:
- `src/text/types.ts` - TextContent, TextSpan, TextStyle, TextLayoutConfig, TextBoundingBox
- `src/text/measurement.ts` - TextMeasurementStore
- `src/text/fontRegistry.ts` - FontRegistry
- `src/text/spanEditor.ts` - span split/merge algorithm
- `src/text/index.ts` - barrel exports
