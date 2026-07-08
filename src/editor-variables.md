# FlashFX Editor Variables

Central reference for all UI design tokens extracted from the FlashFX editor.
Every hardcoded constant, color, spacing value, and interaction parameter is
catalogued here as a named variable with its current value and usage context.

This file is the definition layer only. It does not implement theming or
settings UI. A future settings system will consume these variables.

---

## 1. Color Tokens

### 1.1 Surface (Background) Scale

```
color.surface.0: #06101a
Root-level background. Deepest layer behind all panels.

color.surface.1: #0a1628
Primary panel background. Input fields, controls, content areas.

color.surface.2: #0e1c32
Elevated surfaces. Modal backgrounds, panel headers, secondary areas.

color.surface.3: #122240
Tertiary elevation. Hover states on surface-1, raised cards.

color.surface.4: #16294a
High-emphasis backgrounds. Active tab indicators, highlight zones.

color.surface.5: #1c3155
Maximum elevation. Strong hover states, active toggle backgrounds.
```

### 1.2 Edge (Border) Scale

```
color.edge.subtle: #142236
Subtle dividers. Separator lines between related elements.

color.edge.default: #1a2a42
Primary border color. Panel edges, input borders, dividers.

color.edge.strong: #243a5c
Emphasized borders. Focus rings, active panel outlines.
```

### 1.3 Accent Colors

```
color.accent.primary: #f7b500
Primary accent. Active tabs, selected items, primary actions, playhead.

color.accent.light: #ffc83d
Accent highlight. Hover state on accent elements.

color.accent.dim: #b8860b
Muted accent. Focus rings, subtle accent indicators.

color.accent.playhead: #ffcc00
Timeline playhead line and scrubber indicator.

color.accent.keyframe: #facc15
Keyframe diamond fill color (selected state).

color.accent.handle: #fbbf24
Bezier handle and control point color.
```

### 1.4 Text Colors

```
color.text.primary: #e2e8f0
Primary readable text. Labels, values, panel content.

color.text.secondary: #94a3b8
Secondary text. Descriptions, hints, inactive labels.

color.text.tertiary: #64748b
Tertiary text. Placeholders, disabled text, timestamps.

color.text.muted: #475569
Muted text. Watermarks, background labels, non-interactive hints.
```

### 1.5 Semantic State Colors

```
color.state.success: #22c55e
Valid state. Correct drop targets, successful validation.

color.state.success.dim: #166534
Dark green. Success backgrounds with high contrast.

color.state.error: #ef4444
Error state. Invalid input, failed operations.

color.state.warning: #f59e0b
Warning state. Caution indicators, non-blocking alerts.

color.state.info: #38bdf8
Informational. Selection outlines, guides, overlays.

color.state.info.alt: #22d3ee
Alternate info. Motion paths, pen tool overlays.
```

### 1.6 Opacity Modifiers

```
opacity.overlay.light: 0.02
Extremely subtle hover. White overlay on dark surfaces.

opacity.overlay.soft: 0.04
Soft hover background. Button hover on dark panels.

opacity.overlay.medium: 0.08
Medium emphasis. Active tool background, selection highlight.

opacity.accent.bg: 0.10
Accent background tint. Active tab, selected row.

opacity.accent.hover: 0.15
Accent hover. Button hover in accent context.

opacity.accent.active: 0.20
Accent pressed. Active button state.

opacity.state.faint: 0.06
State indicator background. Error/success tint on surface.

opacity.state.soft: 0.15
Soft state indicator. Error/success panel backgrounds.

opacity.state.medium: 0.55
Medium state emphasis. State icon overlays.

opacity.disabled: 0.30
Disabled state. Buttons, toggles when non-interactive.
```

---

## 2. Typography Tokens

### 2.1 Font Family

```
font.family.primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif
Body text, all UI labels, headers, descriptions.

font.family.mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace
Code expressions, timecodes, hex values, file paths, numeric inputs.
```

### 2.2 Font Weights

```
font.weight.normal: 400
Default body text. Descriptions, values, content areas.

font.weight.medium: 500
Standard emphasis. Labels, button text, section headers. Most common.

font.weight.semibold: 600
Strong emphasis. Dialog titles, critical labels, primary headings.
```

### 2.3 Font Sizes

```
font.size.2xs: 7px
Minimal annotations. Grid density labels, pixel-level indicators.

font.size.xs: 8px
Very small captions. Track suffixes, guide list metadata.

font.size.sm: 9px
Secondary labels. Keyframe labels, timestamps, compact property values.

font.size.base: 10px
Standard UI text. Input labels, button text, panel content. Most common.

font.size.md: 11px
Panel headers. Toolbar items, section titles, navigation labels.

font.size.lg: 12px
Larger buttons. Dialog headings, prominent controls.

font.size.xl: 13px
Section headers. Modal titles, primary navigation elements.

font.size.2xl: 15px
Large headings. Dashboard titles, prominent display text.
```

### 2.4 Line Height

```
font.lineHeight.none: 1.0
Tight layout. Single-line labels that need minimal vertical space.

font.lineHeight.tight: 1.25
Compact text. Inline descriptions, multi-line labels in tight areas.

font.lineHeight.normal: 1.5
Standard readability. Body text, panel descriptions.

font.lineHeight.relaxed: 1.625
Comfortable reading. Multi-line content, expression editor text.
```

### 2.5 Letter Spacing

```
font.tracking.normal: 0
Default body text.

font.tracking.wide: 0.025em
Slightly wider. Buttons, interactive labels.

font.tracking.wider: 0.05em
Section headers. Uppercase labels, panel titles. Most common tracking.

font.tracking.widest: 0.15em
Maximum tracking. Vertical panel side labels.
```

### 2.6 Text Transform Conventions

```
text.transform.sectionHeader: uppercase
Section headers, tab labels, category dividers.

text.transform.enumValue: capitalize
Blend modes, shape types, interpolation types.
```

---

## 3. Spacing Tokens

### 3.1 Base Scale (follows 4px grid with 2px subdivisions)

```
spacing.0: 0px
spacing.0.5: 2px
spacing.1: 4px
spacing.1.5: 6px
spacing.2: 8px
spacing.2.5: 10px
spacing.3: 12px
spacing.4: 16px
spacing.5: 20px
spacing.6: 24px
spacing.8: 32px
```

### 3.2 Component Gaps

```
gap.tight: 2px (gap-0.5)
Icon-to-text in compact buttons. Tightly grouped elements.

gap.default: 4px (gap-1)
Standard flex item spacing. Most common gap value.

gap.comfortable: 6px (gap-1.5)
Comfortable element grouping. Form fields, toolbar sections.

gap.medium: 8px (gap-2)
Section spacing. Menu items, card internals.

gap.large: 12px (gap-3)
Section separation. Panel content blocks.

gap.xlarge: 16px (gap-4)
Major section breaks. Dialog content areas.
```

### 3.3 Panel Padding

```
padding.panel.horizontal: 8px (px-2)
Standard horizontal panel content padding.

padding.panel.vertical: 8px (py-2)
Standard vertical panel section padding.

padding.panel.compact: 4px (p-1)
Compact panel content. Timeline rows, dense lists.

padding.panel.spacious: 12px (p-3)
Spacious sections. Dialog content, modal padding.

padding.panel.dialog: 20px (p-5)
Dialog/modal outer padding.

padding.input.horizontal: 6px (px-1.5)
Input field horizontal padding.

padding.input.vertical: 2px (py-0.5)
Input field vertical padding.

padding.button.horizontal: 8px (px-2)
Standard button horizontal padding.

padding.button.vertical: 4px (py-1)
Standard button vertical padding.
```

---

## 4. Layout Tokens

### 4.1 Panel Dimensions

```
layout.panel.layers.default: 200px
Layer names column default width.

layout.panel.layers.min: 140px
Layer names column minimum width.

layout.panel.layers.max: 360px
Layer names column maximum width.

layout.panel.canvas.min: 300px
Canvas viewport minimum width.

layout.panel.inspector.default: 240px
Inspector panel default width.

layout.panel.inspector.min: 180px
Inspector panel minimum width.

layout.panel.inspector.max: 380px
Inspector panel maximum width.

layout.panel.timeline.default: 220px
Timeline panel default height.

layout.panel.timeline.min: 80px
Timeline panel minimum height.

layout.panel.timeline.max: 500px
Timeline panel maximum height.
```

### 4.2 Workspace Proportions

```
layout.workspace.design.mediaWidth: 31.25%
Media pool width in design mode.

layout.workspace.design.inspectorWidth: 31.25%
Inspector width in design mode.

layout.workspace.design.bottomHeight: 180px
Bottom panel height in design mode.

layout.workspace.edit.mediaWidth: 25%
Media pool width in edit mode.

layout.workspace.edit.inspectorWidth: 27.5%
Inspector width in edit mode.

layout.workspace.edit.bottomHeight: 47%
Bottom panel height in edit mode.

layout.workspace.animate.mediaWidth: 22.5%
Media pool width in animate mode.

layout.workspace.animate.inspectorWidth: 27.5%
Inspector width in animate mode.

layout.workspace.animate.bottomHeight: 47%
Bottom panel height in animate mode.
```

### 4.3 Fixed Layout Elements

```
layout.panelHeader.height: 22px
Panel header bar height.

layout.toolbar.height: 28px
Canvas toolbar height.

layout.transport.height: 32px
Playback transport bar height.

layout.timelineHeader.height: 26px
Timeline header row height.

layout.rulerRow.height: 21px
Timeline/keyframe ruler row height.

layout.navSidebar.width: 116px
Inspector right-side navigation column width.

layout.toolSidebar.width: 32px
Timeline left tool sidebar width.

layout.labelColumn.width: 360px
Timeline layer labels + switches column width.

layout.audioMeter.width: 52px
Review layout audio meter sidebar width.
```

### 4.4 Builder Layout Proportions

```
layout.builder.leftPanel: 64%
Builder mode left panel (editor) width.

layout.builder.rightPanel: 36%
Builder mode right panel (animation builder) width.

layout.builder.topSection: 60%
Builder left panel top section height.

layout.builder.bottomSection: 40%
Builder left panel bottom section (timeline) height.

layout.builder.graphWidth: 45%
Interpolation graph width within top section.
```

### 4.5 Collapsed States

```
layout.collapsed.horizontalPanel: 24px
Width of a collapsed horizontal panel.
```

---

## 5. Component Tokens

### 5.1 Buttons

```
component.button.padding.sm: 2px (p-0.5)
Small icon button padding.

component.button.padding.md: 4px (p-1)
Medium button padding.

component.button.padding.lg: 6px (p-1.5)
Large button padding.

component.button.radius.sm: 4px (rounded)
Standard button border radius.

component.button.radius.md: 6px (rounded-md)
Medium button border radius.

component.button.radius.lg: 8px (rounded-lg)
Large button border radius.

component.button.radius.xl: 12px (rounded-xl)
Extra-large button radius. Dialogs, cards.

component.button.radius.full: 9999px (rounded-full)
Fully round button. Circle buttons, toggles.
```

### 5.2 Input Fields

```
component.input.background: var(--surface-1)
Input field background color.

component.input.border: var(--edge)
Input field border color.

component.input.borderFocus: var(--accent-dim)
Input field border on focus.

component.input.focusRing: rgba(247, 181, 0, 0.15)
Input field focus ring box-shadow.

component.input.radius: 4px
Input field border radius.

component.input.padding: 3px 6px
Input field internal padding (vertical horizontal).

component.input.fontSize: 10px
Input field text size.
```

### 5.3 Toggle Switches

```
component.toggle.width: 28px (w-7)
Toggle switch total width.

component.toggle.height: 16px (h-4)
Toggle switch total height.

component.toggle.dot.size: 12px (w-3 h-3)
Toggle switch dot diameter.
```

### 5.4 Sliders

```
component.slider.track.height: 3px
Slider track thickness.

component.slider.thumb.width: 8px (w-2)
Slider thumb width.

component.slider.thumb.height: 14px (h-3.5)
Slider thumb height.

component.slider.track.background: #1c2230
Slider track background color.
```

### 5.5 Context Menus

```
component.contextMenu.minWidth: 200px
Context menu minimum width.

component.contextMenu.background: #1a2233
Context menu background color.

component.contextMenu.border: #2a3a52
Context menu border color.

component.contextMenu.iconSize: 16px (w-4 h-4)
Context menu item icon dimension.

component.contextMenu.edgeClearance: 8px
Context menu distance from viewport edge.
```

### 5.6 Scrollbars

```
component.scrollbar.width: 5px
Scrollbar track width.

component.scrollbar.thumbRadius: 3px
Scrollbar thumb border radius.

component.scrollbar.thumbColor: var(--edge)
Scrollbar thumb default color.

component.scrollbar.thumbHover: var(--edge-strong)
Scrollbar thumb hover color.

component.scrollbar.trackColor: transparent
Scrollbar track background color.
```

### 5.7 Icons

```
component.icon.size.xs: 8px
Minimal icons. Lock, eye toggles in dense lists.

component.icon.size.sm: 9px
Small icons. Inline action indicators.

component.icon.size.md: 10px
Standard compact icons. Chevrons, toggles.

component.icon.size.default: 11px
Default icon size. Toolbar, layer switches.

component.icon.size.lg: 12px
Larger icons. Panel section indicators.

component.icon.size.xl: 13px
Navigation icons. Panel category tabs.

component.icon.size.2xl: 14px
Prominent icons. Transport skip buttons.

component.icon.size.3xl: 16px
Large modal icons. Dialog headers.

component.icon.size.4xl: 20px
Alert icons. Error boundaries.

component.icon.size.5xl: 22px
Extra-large icons. Export modal actions.
```

---

## 6. Timeline Tokens

### 6.1 Track Dimensions

```
timeline.row.height: 22px
Standard track row height.

timeline.row.video.height: 45px
Video track row height (thumbnail preview).

timeline.row.layer.height: 19px
Layer name row height in labels panel.

timeline.group.row.height: 24px
Property group header height in keyframe editor.
```

### 6.2 Zoom Configuration

```
timeline.zoom.baseFrameWidth: 8px
Pixels per frame at 1.0 zoom level.

timeline.zoom.min: 0.05
Minimum zoom level (5%).

timeline.zoom.max: 20
Maximum zoom level (2000%).

timeline.zoom.sensitivity: 0.002
Mouse wheel zoom factor per delta unit.
```

### 6.3 Ruler

```
timeline.ruler.height: 21px
Ruler row height.

timeline.ruler.majorTickTarget: 90px
Target spacing between major tick marks.

timeline.ruler.minMinorSpacing: 9px
Minimum spacing for minor tick marks.
```

### 6.4 Keyframes

```
timeline.keyframe.size: 9px
Individual keyframe diamond size (before 45-degree rotation).

timeline.keyframe.collapsed.size: 8px
Collapsed group keyframe summary diamond size.

timeline.keyframe.color.default: #facc15
Keyframe fill color.

timeline.keyframe.color.selected: #22c55e
Selected keyframe fill color.
```

### 6.5 Playhead

```
timeline.playhead.color: #ffcc00
Playhead vertical line color.

timeline.playhead.width: 1px
Playhead line thickness.

timeline.playhead.triangle.width: 10px
Playhead top triangle total width (5px each side).

timeline.playhead.triangle.height: 6px
Playhead top triangle height.
```

### 6.6 Scrollbar (Timeline-specific)

```
timeline.scrollbar.width: 10px
Timeline horizontal/vertical scrollbar track width.

timeline.scrollbar.thumbMin: 24px
Minimum scrollbar thumb height/width.
```

### 6.7 Property Column

```
timeline.propertyColumn.width: 180px
Keyframe editor property names column width.

timeline.trackHeader.width: 84px
Track header subsection width within label column.
```

---

## 7. Animation Tokens

### 7.1 Default Easing Curves

```
animation.easing.linear: [0, 0, 1, 1]
No easing. Constant speed.

animation.easing.easeIn: [0.42, 0.001, 1, 1]
Accelerating from zero. Slow start.

animation.easing.easeOut: [0.001, 0.001, 0.58, 1]
Decelerating to zero. Slow end.

animation.easing.easeInOut: [0.42, 0.001, 0.58, 1]
Smooth acceleration and deceleration. Default preset easing.

animation.easing.spring: special
Spring interpolation. Uses damping=0.7, frequency=4.
```

### 7.2 Spring Defaults

```
animation.spring.damping: 0.7
Default spring damping coefficient.

animation.spring.frequency: 4
Default spring oscillation frequency.
```

### 7.3 Default Interpolation

```
animation.interpolation.default: 'linear'
Default keyframe interpolation mode for new keyframes.

animation.interpolation.types: linear | bezier | hold | spring
Available interpolation types.
```

---

## 8. Interaction Tokens

### 8.1 Drag Behavior

```
interaction.drag.threshold.input: 3px
Minimum drag distance to initiate DragInput value scrub.

interaction.drag.threshold.timeline: 4px
Minimum drag distance to initiate clip move in timeline.

interaction.drag.resizeEdge: 7px
Resize handle active zone width at clip edges.
```

### 8.2 Auto-scroll

```
interaction.autoscroll.edgeZone: 60px
Distance from edge where auto-scroll activates during resize.

interaction.autoscroll.maxSpeed: 14px
Maximum auto-scroll pixels per animation frame during resize.

interaction.scrub.edgeZone: 0.15
Percentage of viewport width on each side triggering scrub auto-scroll.

interaction.scrub.maxSpeed: 18px
Maximum scrub auto-scroll pixels per rAF tick.
```

### 8.3 Scroll Speed

```
interaction.scroll.vertical.multiplier: 1.0
Vertical scroll speed multiplier for timeline panels.
```

### 8.4 Hover & Delay

```
interaction.submenu.delay: 150ms
Delay before submenu opens on hover.

interaction.autosave.delay: 3000ms
Debounce delay before auto-saving project.

interaction.expression.debounce: 600ms
Debounce delay before auto-applying expression code changes.
```

### 8.5 Timeout & Recovery

```
interaction.expression.timeout: 50ms
Maximum time allowed for expression evaluation before timeout.

interaction.expression.maxTimeouts: 3
Consecutive timeouts before expression is auto-disabled.
```

---

## 9. Transition Tokens

### 9.1 Duration Scale

```
transition.duration.instant: 75ms
Instantaneous transitions. Color changes, hover states. Most common.

transition.duration.fast: 100ms
Fast transitions. Toggle animations.

transition.duration.default: 150ms
Standard transitions. Panel reveals, state changes.

transition.duration.slow: 200ms
Deliberate transitions. Modal open, panel expand.
```

### 9.2 Easing

```
transition.easing.default: ease
Standard CSS easing for UI transitions.

transition.easing.in: ease-in
Enter transitions. Elements appearing.

transition.easing.out: ease-out
Exit transitions. Elements disappearing.
```

### 9.3 CSS Transition Properties

```
transition.property.colors: color, background-color, border-color
Color-only transitions. Hover states.

transition.property.opacity: opacity
Opacity transitions. Show/hide, fade.

transition.property.transform: transform
Transform transitions. Scale, translate.

transition.property.all: all
All-property transition. Complex state changes.
```

### 9.4 CSS Specific Durations

```
transition.css.inputFocus: 0.15s
Input field focus border/shadow transition.

transition.css.buttonTool: 0.12s
Tool button hover/active state transition.
```

---

## 10. Effects & Overlays Tokens

### 10.1 Panel Depth

```
effects.panel.gradient: linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)
Panel surface subtle depth gradient.

effects.panel.insetHighlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.02)
Top-edge highlight for panel depth illusion.
```

### 10.2 Transform Overlay

```
effects.overlay.selection.color: #38bdf8
Selection box/transform handles color.

effects.overlay.selection.fill: rgba(56, 189, 248, 0.06)
Selection rectangle fill color.

effects.overlay.guide.color: #22d3ee
Snap guide and motion path line color.
```

### 10.3 Grid Overlay

```
effects.grid.lineColor: rgba(255, 255, 255, 0.1)
Grid line color at default opacity.

effects.grid.centerLineColor: rgba(255, 255, 255, 0.4)
Center axis line color.
```

### 10.4 Shape Creation

```
effects.shapeCreation.stroke: rgba(220, 220, 220, 0.85)
Shape creation preview stroke color.

effects.shapeCreation.fill: rgba(180, 180, 180, 0.18)
Shape creation preview fill color.
```

### 10.5 Shadows

```
effects.shadow.overlay: rgba(0, 0, 0, 0.3)
Standard shadow overlay.

effects.shadow.medium: rgba(0, 0, 0, 0.35)
Medium shadow for context menus.

effects.shadow.heavy: rgba(0, 0, 0, 0.5)
Heavy shadow for modals.

effects.shadow.tooltip: rgba(20, 24, 33, 0.9)
Tooltip background overlay.
```

---

## 11. Grid & Snap Tokens

```
grid.defaultSpacing: 50px
Default grid spacing in pixels.

grid.subdivisions: 4
Default grid subdivisions between major lines.

snap.tolerance: 5px
Distance threshold for snapping to grid/guides.

snap.guide.color: #22d3ee
Visual snap guide line color.

snap.guide.width: 1px
Snap guide line thickness.
```

---

## 12. Export & Rendering Tokens

```
export.defaultFps: 30
Default export frame rate.

export.defaultWidth: 1920
Default export width.

export.defaultHeight: 1080
Default export height.

export.defaultBitrate: 8000000
Default video bitrate (8 Mbps).
```

---

## Variable Naming Convention

All variables follow dot-notation with these rules:

- **Category** first: `color`, `font`, `spacing`, `layout`, `component`, `timeline`, `animation`, `interaction`, `transition`, `effects`
- **Element** second: the specific UI piece (`surface`, `text`, `button`, `input`)
- **Modifier** third: variant, state, or sub-property (`primary`, `hover`, `min`)

Examples:
```
color.surface.0           -> Category.Element.Variant
font.size.base            -> Category.Property.Scale
component.button.radius.md -> Category.Element.Property.Size
timeline.zoom.sensitivity -> Category.Section.Property
interaction.drag.threshold.input -> Category.Behavior.Property.Context
```

---

## Coverage Summary

| Category       | Token Count | Status      |
|---------------|-------------|-------------|
| Colors         | 42          | Complete    |
| Typography     | 22          | Complete    |
| Spacing        | 18          | Complete    |
| Layout         | 34          | Complete    |
| Components     | 38          | Complete    |
| Timeline       | 22          | Complete    |
| Animation      | 10          | Complete    |
| Interaction    | 14          | Complete    |
| Transitions    | 12          | Complete    |
| Effects        | 14          | Complete    |
| Grid/Snap      | 5           | Complete    |
| Export         | 4           | Complete    |
| **Total**      | **235**     | **Complete**|

All 235 variables represent the complete set of configurable UI constants
currently hardcoded across the FlashFX editor. This forms the foundation
for any future theming, settings, or customization system.
