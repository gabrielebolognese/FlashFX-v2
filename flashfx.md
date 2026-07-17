# FlashFX Complete User Guide

<!-- METADATA
category: documentation
feature: overview
difficulty: beginner
version: FlashFX v1.0
-->

## Table of Contents

1. [What is FlashFX?](#what-is-flashfx)
2. [Getting Started](#getting-started)
3. [Interface Overview](#interface-overview)
4. [Design Tools](#design-tools)
5. [Animation System](#animation-system)
6. [Timeline System](#timeline-system)
7. [Export Features](#export-features)
8. [Project Management](#project-management)
9. [Advanced Features](#advanced-features)
10. [Keyboard Shortcuts](#keyboard-shortcuts)
11. [Tips and Best Practices](#tips-and-best-practices)
12. [Troubleshooting](#troubleshooting)

---

## What is FlashFX?

<!-- METADATA
category: introduction
feature: overview
difficulty: beginner
version: FlashFX v1.0
-->

FlashFX is a professional web-based motion graphics and animation design tool built with modern web technologies. It combines the power of vector design tools with advanced animation capabilities, allowing you to create stunning animations and export professional videos directly in your browser.

### Key Capabilities

<!-- METADATA
category: introduction
feature: capabilities
difficulty: beginner
version: FlashFX v1.0
-->

- Create vector graphics and designs with an intuitive interface
- Animate any property with precise keyframe control
- Apply 60+ professional image filters and effects
- Work with advanced text animation and styling
- Export videos (WebM, MP4) and image sequences
- Save projects to the cloud or work offline in guest mode
- Collaborate with AI-powered design assistance

### Technology Stack

<!-- METADATA
category: introduction
feature: technology
difficulty: advanced
version: FlashFX v1.0
-->

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, Storage)
- **Rendering**: Canvas API, WebGL, HTML-to-Image
- **Export**: JSZip, FileSaver, Video encoding

---

## Getting Started

<!-- METADATA
category: onboarding
feature: first-launch
difficulty: beginner
version: FlashFX v1.0
-->

### First Launch

<!-- METADATA
category: onboarding
feature: authentication
difficulty: beginner
version: FlashFX v1.0
-->

1. **Open FlashFX** in your web browser
2. **Choose your mode**:
   - **Sign Up**: Create an account for cloud storage and cross-device access
   - **Sign In**: Access your existing projects
   - **Continue as Guest**: Work locally without an account
3. **Create a Project**: Click "NEW PROJECT" on the home page

### Creating Your First Project

<!-- METADATA
category: project
feature: new-project
difficulty: beginner
version: FlashFX v1.0
-->

1. **Project Setup**:
   - Enter a project name
   - Choose canvas dimensions (default: 4K - 3840x2160)
   - Or select from presets: HD (1920x1080), 4K, 8K
2. **Start Designing**: You'll see the main editor with an empty canvas
3. **Add Your First Shape**: Press `Q` for rectangle or use the toolbar

### Guest Mode vs Authenticated Mode

<!-- METADATA
category: authentication
feature: storage-modes
difficulty: beginner
version: FlashFX v1.0
-->

#### Guest Mode (Local Storage)
- No account required
- Projects saved to browser storage
- Limited to browser storage quota
- Projects lost if browser data is cleared
- No cross-device sync
- 50MB storage limit

#### Authenticated Mode (Cloud)
- Projects saved to cloud database
- Access from any device
- Storage quota: 50MB free tier (upgradable)
- Automatic backup and sync
- Secure user isolation with Row Level Security

---

## Interface Overview

<!-- METADATA
category: ui
feature: interface
difficulty: beginner
version: FlashFX v1.0
-->

### Layout Modes

<!-- METADATA
category: ui
feature: layout-modes
difficulty: beginner
version: FlashFX v1.0
-->

FlashFX offers three layout modes accessible via the mode switcher:

#### 1. Design Mode

<!-- METADATA
category: ui
feature: design-mode
difficulty: beginner
version: FlashFX v1.0
-->

- **Purpose**: Focus on visual design and element placement
- **Layout**: Three columns (Layers | Canvas | Properties)
- **Timeline**: Hidden to maximize canvas workspace
- **Best for**: Creating and arranging visual elements, setting up designs

#### 2. Animate Mode

<!-- METADATA
category: ui
feature: animate-mode
difficulty: intermediate
version: FlashFX v1.0
-->

- **Purpose**: Animation and timeline editing
- **Layout**: Three columns at top, dual timelines at bottom
- **Timelines**:
  - General Timeline (left): Overview of all elements and clips
  - Animation Timeline (right): Detailed keyframe editing
- **Best for**: Creating animations, managing timeline clips

#### 3. Advanced Mode

<!-- METADATA
category: ui
feature: advanced-mode
difficulty: advanced
version: FlashFX v1.0
-->

- **Purpose**: Full control with all panels visible
- **Layout**: All panels and tools visible simultaneously
- **Best for**: Power users needing complete control

### Main Interface Components

<!-- METADATA
category: ui
feature: interface-components
difficulty: beginner
version: FlashFX v1.0
-->

#### Top Bar

<!-- METADATA
category: ui
feature: top-bar
difficulty: beginner
version: FlashFX v1.0
-->

- **Logo**: FlashFX branding
- **Project Name**: Current project title
- **Save/Load**: Quick access to project management
- **User Menu**: Account settings, sign out

#### Toolbar (Red Bar)

<!-- METADATA
category: ui
feature: toolbar
difficulty: beginner
version: FlashFX v1.0
-->

Located at the top of the canvas area with quick access tools:
- **Selection Tool (V)**: Select and move elements
- **Shape Tools**: Rectangle (Q), Circle (W), Text (E), Line (U), Button (R), Star
- **Zoom Controls**: + (zoom in), - (zoom out)
- **Grid Toggle (G)**: Show/hide alignment grid
- **Export**: Upload icon for export options
- **Settings**: Editor preferences and configurations

#### Layers Panel (Left)

<!-- METADATA
category: ui
feature: layers-panel
difficulty: beginner
version: FlashFX v1.0
-->

- Shows all elements in the project
- Hierarchical view with groups
- Lock/unlock elements
- Show/hide visibility
- Reorder layers with drag-and-drop
- Context menu (right-click) for quick actions

#### Canvas (Center)

<!-- METADATA
category: ui
feature: canvas
difficulty: beginner
version: FlashFX v1.0
-->

- Main design workspace
- White artboard with your project dimensions
- Gray surrounding area
- Zoom and pan with mouse controls
- Snap guides and grid overlay
- Element selection handles

#### Properties Panel (Right)

<!-- METADATA
category: ui
feature: properties-panel
difficulty: beginner
version: FlashFX v1.0
-->

- Shows properties of selected element(s)
- When nothing selected: Background settings
- Context-sensitive controls
- Real-time value updates
- Organized sections (Position, Style, Effects, etc.)

#### Timeline (Bottom - Animate/Advanced Mode)

<!-- METADATA
category: ui
feature: timeline
difficulty: intermediate
version: FlashFX v1.0
-->

- **General Timeline**: Shows clips for each layer
- **Animation Timeline**: Shows keyframes for selected element
- **Playhead**: Yellow indicator showing current time
- **Timeline Ruler**: Time markers in seconds and frames
- **Zoom**: Timeline zoom controls

---

## Design Tools

<!-- METADATA
category: design
feature: shapes
difficulty: beginner
version: FlashFX v1.0
-->

### Shape Creation

<!-- METADATA
category: shapes
feature: shape-types
difficulty: beginner
version: FlashFX v1.0
-->

FlashFX supports multiple element types:

#### Rectangle (Keyboard: Q)

<!-- METADATA
category: shapes
feature: rectangle
difficulty: beginner
version: FlashFX v1.0
shortcut: Q
-->

- Create rectangular shapes
- Adjustable corner radius for rounded corners
- Supports fills, strokes, gradients
- Can apply materials and effects

#### Circle (Keyboard: W)

<!-- METADATA
category: shapes
feature: circle
difficulty: beginner
version: FlashFX v1.0
shortcut: W
-->

- Create perfect circles or ellipses
- Adjust width/height independently for ovals
- Full styling capabilities

#### Text (Keyboard: E)

<!-- METADATA
category: shapes
feature: text
difficulty: beginner
version: FlashFX v1.0
shortcut: E
-->

- Add text elements with rich formatting
- Extensive typography controls
- Gradient fills and effects
- Animation support (character, word, line)

#### Line (Keyboard: U)

<!-- METADATA
category: shapes
feature: line
difficulty: intermediate
version: FlashFX v1.0
shortcut: U
-->

- Create straight or curved lines
- Add points for complex paths
- Arrow heads (start, end, or both)
- Adjustable stroke styles

#### Star

<!-- METADATA
category: shapes
feature: star
difficulty: beginner
version: FlashFX v1.0
-->

- Multi-pointed star shapes
- Adjustable number of points (3-20)
- Inner radius control
- Full styling support

#### Button (Keyboard: R)

<!-- METADATA
category: shapes
feature: button
difficulty: beginner
version: FlashFX v1.0
shortcut: R
-->

- Pre-styled button elements
- Text label support
- Interactive states

#### Chat Bubble (Keyboard: T)

<!-- METADATA
category: shapes
feature: chat-bubble
difficulty: beginner
version: FlashFX v1.0
shortcut: T
-->

- Speech bubble shapes
- Adjustable pointer direction
- Perfect for mockups

#### Image

<!-- METADATA
category: shapes
feature: image
difficulty: beginner
version: FlashFX v1.0
-->

- Import images (PNG, JPG, GIF)
- Apply 60+ filters
- Crop and transform
- Blend modes

#### Group

<!-- METADATA
category: shapes
feature: group
difficulty: intermediate
version: FlashFX v1.0
shortcut: Ctrl+G
-->

- Combine multiple elements
- Transform as single unit
- Hierarchical organization
- Group/ungroup with Ctrl+G / Ctrl+Shift+G

### Element Properties

<!-- METADATA
category: design
feature: properties
difficulty: beginner
version: FlashFX v1.0
-->

#### Position & Transform

<!-- METADATA
category: design
feature: transform
difficulty: beginner
version: FlashFX v1.0
-->

- **Position**: X and Y coordinates
- **Size**: Width and height
- **Rotation**: 0-360 degrees
- **Opacity**: 0-100%
- **Lock**: Prevent accidental edits
- **Visible**: Show/hide element

#### Style Properties

<!-- METADATA
category: design
feature: styling
difficulty: beginner
version: FlashFX v1.0
-->

- **Fill**: Solid color, gradient, or material
- **Stroke**: Border color and width
- **Border Radius**: Rounded corners (0-100)
- **Shadow**: Blur, color, offset X/Y
- **Blend Mode**: How element blends with background

#### Advanced Styling

<!-- METADATA
category: design
feature: advanced-styling
difficulty: advanced
version: FlashFX v1.0
-->

##### Material System

<!-- METADATA
category: design
feature: materials
difficulty: advanced
version: FlashFX v1.0
-->

Create complex visual effects with multi-layer materials:
- **Multiple Layers**: Up to 4 gradient/texture layers per element
- **Gradient Types**: Linear, radial, conic
- **Textures**: Pattern fills with customization
- **Blend Modes**: 15+ composition modes
- **Layer Opacity**: Individual layer transparency
- **Fill and Stroke Materials**: Apply materials to both fill and stroke

##### Blend Modes

<!-- METADATA
category: design
feature: blend-modes
difficulty: intermediate
version: FlashFX v1.0
-->

Available for images and layers:
- Normal, Multiply, Screen, Overlay
- Darken, Lighten, Color Dodge, Color Burn
- Hard Light, Soft Light, Difference, Exclusion
- Hue, Saturation, Color, Luminosity

### Text Features

<!-- METADATA
category: text
feature: typography
difficulty: beginner
version: FlashFX v1.0
-->

#### Basic Typography

<!-- METADATA
category: text
feature: basic-typography
difficulty: beginner
version: FlashFX v1.0
-->

- **Font Family**: Choose from web-safe and custom fonts
- **Font Size**: 6-500px
- **Font Weight**: Thin to Black (100-900)
- **Font Style**: Normal, Italic, Oblique
- **Text Transform**: Uppercase, lowercase, capitalize, small-caps
- **Text Align**: Left, center, right, justify
- **Vertical Align**: Top, middle, bottom

#### Advanced Typography

<!-- METADATA
category: text
feature: advanced-typography
difficulty: intermediate
version: FlashFX v1.0
-->

- **Letter Spacing**: Adjust spacing between characters
- **Line Height**: Control line spacing (80-300%)
- **Word Spacing**: Adjust spacing between words
- **Text Decoration**: Underline, line-through, overline
- **Baseline Shift**: Move text up/down from baseline
- **Text Indent**: First line indentation
- **Text Wrap**: Wrap, nowrap, balance
- **Text Overflow**: Clip, ellipsis, visible
- **Max Lines**: Limit number of visible lines

#### Text Effects

<!-- METADATA
category: text
feature: text-effects
difficulty: intermediate
version: FlashFX v1.0
-->

##### Text Stroke

<!-- METADATA
category: text
feature: text-stroke
difficulty: beginner
version: FlashFX v1.0
-->

- **Stroke Color**: Outline color
- **Stroke Width**: Thickness of outline (0-50px)

##### Text Shadow

<!-- METADATA
category: text
feature: text-shadow
difficulty: beginner
version: FlashFX v1.0
-->

- **Shadow Color**: Shadow color
- **Shadow Blur**: Blur radius (0-100px)
- **Offset X/Y**: Shadow position

##### Text Gradient Fill

<!-- METADATA
category: text
feature: text-gradient
difficulty: intermediate
version: FlashFX v1.0
-->

- **Enable Gradient**: Toggle gradient mode
- **Gradient Type**: Linear or radial
- **Color Stops**: Up to 10 colors
- **Gradient Angle**: Direction (0-360 degrees)

##### Text Glow Effect

<!-- METADATA
category: text
feature: text-glow
difficulty: intermediate
version: FlashFX v1.0
-->

- **Glow Color**: Glow color
- **Glow Size**: Size of glow effect (0-100px)
- **Glow Intensity**: Strength of glow (0-100%)

##### Texture Fill for Text

<!-- METADATA
category: text
feature: text-texture
difficulty: advanced
version: FlashFX v1.0
-->

- **Enable Texture**: Apply image texture to text
- **Texture Image**: Upload or select image
- **Scale**: Size of texture pattern
- **Offset X/Y**: Position adjustment

##### Pattern Fill for Text

<!-- METADATA
category: text
feature: text-pattern
difficulty: advanced
version: FlashFX v1.0
-->

- **Enable Pattern**: Apply pattern to text
- **Pattern Type**: Dots, lines, grid, diagonal, chevron, custom
- **Pattern Color**: Foreground color
- **Background Color**: Background color
- **Size**: Pattern element size
- **Spacing**: Gap between pattern elements
- **Angle**: Rotation of pattern
- **Custom SVG**: Use custom SVG pattern

#### Rich Text Support

<!-- METADATA
category: text
feature: rich-text
difficulty: intermediate
version: FlashFX v1.0
-->

- **Mixed Formatting**: Different styles per segment
- **Per-Character Control**: Individual character properties
- **Inline Styles**: Bold, italic, color within text

#### Text Animation Control

<!-- METADATA
category: text
feature: text-animation
difficulty: intermediate
version: FlashFX v1.0
-->

- **Animation Modes**:
  - **Whole**: Animate text as single unit
  - **Line**: Animate per line
  - **Word**: Animate per word
  - **Character**: Animate per character
- **Stagger Delay**: Time between animated units (0-5 seconds)
- **Apply Control**: Split text into animated units

### Line Properties

<!-- METADATA
category: shapes
feature: line-properties
difficulty: intermediate
version: FlashFX v1.0
-->

#### Basic Line Settings

<!-- METADATA
category: shapes
feature: line-settings
difficulty: intermediate
version: FlashFX v1.0
-->

- **Line Type**: Line, arrow, or pen
- **Points**: Add/remove/edit path points
- **Smooth Points**: Bezier curve smoothing
- **Close Path**: Create closed shape
- **Trim Start**: Animate line drawing from start (0-100%)
- **Trim End**: Animate line drawing to end (0-100%)

#### Line Styling

<!-- METADATA
category: shapes
feature: line-styling
difficulty: intermediate
version: FlashFX v1.0
-->

- **Stroke Width**: Line thickness
- **Stroke Color**: Line color
- **Line Cap**: Round, butt, or square
- **Line Join**: Round, bevel, or miter
- **Dash Array**: Custom dash pattern
- **Dash Intensity**: Dash spacing multiplier

#### Arrowheads

<!-- METADATA
category: shapes
feature: arrowheads
difficulty: intermediate
version: FlashFX v1.0
-->

- **Arrow Start**: Show arrow at start
- **Arrow End**: Show arrow at end
- **Arrowhead Type**: Triangle, circle, bar, diamond
- **Arrowhead Size**: Scale of arrowhead (0.1-5.0)
- **Auto Scale**: Automatically adjust arrow size with stroke

#### Corner Radius for Lines

<!-- METADATA
category: shapes
feature: line-corner-radius
difficulty: intermediate
version: FlashFX v1.0
-->

- **Global Corner Radius**: Apply to all connection points
- **Per-Point Radius**: Individual radius per point

### Image Features

<!-- METADATA
category: images
feature: image-import
difficulty: beginner
version: FlashFX v1.0
-->

#### Image Import

<!-- METADATA
category: images
feature: import-methods
difficulty: beginner
version: FlashFX v1.0
-->

Three ways to add images:
1. **File Upload**: Import from computer
2. **DALL-E Generation**: AI-powered image creation
3. **Google Image Search**: Search and import stock images

#### Image Filters (60+ Professional Filters)

<!-- METADATA
category: images
feature: filters
difficulty: intermediate
version: FlashFX v1.0
-->

##### Basic Adjustments

<!-- METADATA
category: images
feature: basic-adjustments
difficulty: beginner
version: FlashFX v1.0
-->

- Brightness (-100 to 100)
- Contrast (-100 to 100)
- Exposure (-100 to 100)
- Gamma (0.1 to 3.0)
- Temperature (-100 to 100)
- Tint (-100 to 100)
- Vibrance (-100 to 100)
- Saturation (-100 to 100)

##### HSL Adjustments

<!-- METADATA
category: images
feature: hsl-adjustments
difficulty: intermediate
version: FlashFX v1.0
-->

- Hue (-180 to 180)
- Lightness (-100 to 100)
- Grayscale (0 to 100)
- Invert (on/off)
- Sepia (0 to 100)

##### Color Balance

<!-- METADATA
category: images
feature: color-balance
difficulty: intermediate
version: FlashFX v1.0
-->

- Shadows: Red, Green, Blue (-100 to 100)
- Midtones: Red, Green, Blue (-100 to 100)
- Highlights: Red, Green, Blue (-100 to 100)

##### Levels

<!-- METADATA
category: images
feature: levels
difficulty: intermediate
version: FlashFX v1.0
-->

- Black Point (0 to 255)
- Mid Point (0.1 to 9.99)
- White Point (0 to 255)

##### RGB Channels

<!-- METADATA
category: images
feature: rgb-channels
difficulty: intermediate
version: FlashFX v1.0
-->

- Red Channel (-100 to 100)
- Green Channel (-100 to 100)
- Blue Channel (-100 to 100)

##### Blur Effects

<!-- METADATA
category: images
feature: blur
difficulty: beginner
version: FlashFX v1.0
-->

- Gaussian Blur (0 to 100)
- Motion Blur: Angle (0-360), Distance (0-100)
- Radial Blur: Amount (0-100), Center X/Y
- Box Blur (0 to 100)
- Surface Blur (0 to 100)

##### Sharpen

<!-- METADATA
category: images
feature: sharpen
difficulty: intermediate
version: FlashFX v1.0
-->

- Unsharp: Amount, Radius, Threshold
- Sharpen (0 to 100)
- Clarity (-100 to 100)

##### Noise

<!-- METADATA
category: images
feature: noise
difficulty: intermediate
version: FlashFX v1.0
-->

- Add Noise (0 to 100)
- Noise Type: Uniform, Gaussian, Monochrome
- Reduce Noise (0 to 100)
- Median (0 to 100)

##### Distortion

<!-- METADATA
category: images
feature: distortion
difficulty: advanced
version: FlashFX v1.0
-->

- Ripple: Amplitude, Wavelength
- Twirl: Angle, Radius
- Wave: Horizontal, Vertical
- Spherize (-100 to 100)
- Pinch (-100 to 100)
- Bulge (0 to 100)

##### Lens Effects

<!-- METADATA
category: images
feature: lens-effects
difficulty: intermediate
version: FlashFX v1.0
-->

- Vignette: Amount, Roundness, Feather
- Lens Flare: Intensity, Position X/Y
- Chromatic Aberration (0 to 100)
- Lens Distortion (-100 to 100)

##### Stylize

<!-- METADATA
category: images
feature: stylize
difficulty: advanced
version: FlashFX v1.0
-->

- Oil Paint: Brush, Detail
- Cartoon: Edge, Colors
- Glowing Edges: Width, Intensity
- Sketch: Detail, Shading
- Watercolor: Granularity, Intensity
- Emboss: Angle, Amount
- Edge Detection (0 to 100)
- Pixelate (1 to 100)
- Mosaic (1 to 100)

##### Special Effects

<!-- METADATA
category: images
feature: special-effects
difficulty: advanced
version: FlashFX v1.0
-->

- Posterize (2 to 256)
- Solarize (0 to 255)
- Threshold (0 to 255)
- Halftone (0 to 100)
- Crystallize (0 to 100)

### Background Settings

<!-- METADATA
category: design
feature: background
difficulty: beginner
version: FlashFX v1.0
-->

When no elements are selected, the Properties Panel shows Background Settings:

#### Background Configuration

<!-- METADATA
category: design
feature: background-config
difficulty: beginner
version: FlashFX v1.0
-->

- **Enable Background**: Toggle background on/off
- **Multiple Layers**: Up to 4 gradient layers
- **Layer Types**: Solid or gradient per layer
- **Layer Reordering**: Move layers up/down

#### Gradient Options

<!-- METADATA
category: design
feature: gradients
difficulty: intermediate
version: FlashFX v1.0
-->

##### Linear Gradients

<!-- METADATA
category: design
feature: linear-gradients
difficulty: beginner
version: FlashFX v1.0
-->

6 directional presets:
- Top to Bottom
- Bottom to Top
- Left to Right
- Right to Left
- Diagonal (top-left to bottom-right)
- Diagonal (top-right to bottom-left)

##### Radial Gradients

<!-- METADATA
category: design
feature: radial-gradients
difficulty: beginner
version: FlashFX v1.0
-->

5 positional presets:
- Center
- Top Left
- Top Right
- Bottom Left
- Bottom Right

#### Color Stop Management

<!-- METADATA
category: design
feature: color-stops
difficulty: intermediate
version: FlashFX v1.0
-->

- **Add Colors**: Up to 10 color stops per layer
- **Position**: Adjust stop position (0-100%)
- **Opacity**: Per-color transparency (0-100%)
- **Color Picker**: Visual color selection
- **Hex Input**: Direct hex color entry
- **Delete Stops**: Remove unwanted colors

#### Layer Blend Modes

<!-- METADATA
category: design
feature: layer-blend-modes
difficulty: intermediate
version: FlashFX v1.0
-->

15+ blend modes for layer composition:
- Normal, Multiply, Screen, Overlay
- Darken, Lighten, Color Dodge, Color Burn
- Hard Light, Soft Light, Difference, Exclusion

### Smart Guides and Snapping

<!-- METADATA
category: ui
feature: guides
difficulty: beginner
version: FlashFX v1.0
-->

#### Grid System

<!-- METADATA
category: ui
feature: grid
difficulty: beginner
version: FlashFX v1.0
shortcut: G
-->

- **Toggle Grid**: Press G or use toolbar
- **Grid Size**: Adjustable spacing (8-200px)
- **Grid Color**: Customizable color
- **Snap to Grid**: Align elements to grid points

#### Smart Guides

<!-- METADATA
category: ui
feature: smart-guides
difficulty: intermediate
version: FlashFX v1.0
shortcut: Ctrl+;
-->

- **Alignment Guides**: Appear when dragging elements
- **Center Alignment**: Snap to canvas center
- **Edge Alignment**: Snap to canvas edges
- **Element Alignment**: Align with other elements
- **Distance Guides**: Equal spacing indicators
- **Toggle Snapping**: Ctrl+; or Properties Panel

### Canvas Navigation

<!-- METADATA
category: ui
feature: navigation
difficulty: beginner
version: FlashFX v1.0
-->

#### Zoom Controls

<!-- METADATA
category: ui
feature: zoom
difficulty: beginner
version: FlashFX v1.0
shortcut: +/-
-->

- **Keyboard**: + (zoom in), - (zoom out)
- **Mouse**: Ctrl+Scroll wheel
- **Fit to Screen**: Ctrl+0
- **Reset Zoom**: Set zoom to 100%
- **Zoom Slider**: In toolbar

#### Pan Controls

<!-- METADATA
category: ui
feature: pan
difficulty: beginner
version: FlashFX v1.0
shortcut: Spacebar
-->

- **Mouse**: Drag canvas background
- **Spacebar+Drag**: Pan while editing
- **Reset Pan**: Center canvas in viewport

---

## Animation System

<!-- METADATA
category: animation
feature: animation-system
difficulty: intermediate
version: FlashFX v1.0
-->

### Animation Concepts

<!-- METADATA
category: animation
feature: concepts
difficulty: beginner
version: FlashFX v1.0
-->

#### Keyframes

<!-- METADATA
category: animation
feature: keyframes
difficulty: beginner
version: FlashFX v1.0
-->

Keyframes mark specific values at specific times. FlashFX interpolates between keyframes to create smooth animations.

#### Animatable Properties

<!-- METADATA
category: animation
feature: animatable-properties
difficulty: beginner
version: FlashFX v1.0
-->

Almost every property can be animated:
- Position (x, y)
- Size (width, height)
- Rotation (0-360 degrees)
- Opacity (0-100%)
- Fill color
- Stroke color and width
- Border radius
- Shadow properties
- Filter values

#### Easing Functions

<!-- METADATA
category: animation
feature: easing
difficulty: intermediate
version: FlashFX v1.0
-->

16 easing types for natural motion:
- **Linear**: Constant speed
- **Ease In**: Slow start
- **Ease Out**: Slow end
- **Ease In-Out**: Slow start and end
- **Quad, Cubic, Quart, Quint**: Polynomial curves
- **Sine**: Trigonometric curve
- **Expo**: Exponential curve
- **Circ**: Circular curve
- **Back**: Overshoots then returns
- **Elastic**: Spring-like bounce
- **Bounce**: Bouncing effect

### Creating Animations

<!-- METADATA
category: animation
feature: creation-methods
difficulty: intermediate
version: FlashFX v1.0
-->

#### Method 1: Automatic Keyframing

<!-- METADATA
category: animation
feature: auto-keyframe
difficulty: beginner
version: FlashFX v1.0
-->

1. Select an element
2. Move playhead to desired time
3. Change any property in Properties Panel
4. Keyframe is automatically created
5. Repeat for additional keyframes

#### Method 2: Timeline Editor

<!-- METADATA
category: animation
feature: timeline-keyframing
difficulty: intermediate
version: FlashFX v1.0
-->

1. Switch to Animate or Advanced mode
2. Select element in timeline
3. Click on timeline ruler to position playhead
4. Adjust properties
5. View keyframes in Animation Timeline

#### Method 3: FX Shortcuts

<!-- METADATA
category: animation
feature: fx-presets
difficulty: beginner
version: FlashFX v1.0
-->

1. Select an element
2. Open Properties Panel
3. Navigate to FX Shortcuts tab
4. Choose category and animation
5. Click "Apply" to add keyframes

### FX Animation Library

<!-- METADATA
category: animation
feature: fx-library
difficulty: beginner
version: FlashFX v1.0
-->

#### All FX Tab

<!-- METADATA
category: animation
feature: fx-all
difficulty: beginner
version: FlashFX v1.0
-->

Pre-built animation presets organized by category:

##### Entry Animations

<!-- METADATA
category: animation
feature: entry-animations
difficulty: beginner
version: FlashFX v1.0
-->

- Fade In
- Slide In (Left, Right, Up, Down)
- Scale Up
- Bounce In
- Rotate In
- Zoom In
- Flip In

##### Exit Animations

<!-- METADATA
category: animation
feature: exit-animations
difficulty: beginner
version: FlashFX v1.0
-->

- Fade Out
- Slide Out (Left, Right, Up, Down)
- Scale Down
- Bounce Out
- Rotate Out
- Zoom Out
- Flip Out

##### Emphasis Animations

<!-- METADATA
category: animation
feature: emphasis-animations
difficulty: beginner
version: FlashFX v1.0
-->

- Pulse
- Shake
- Bounce
- Wiggle
- Glow
- Flash
- Rubber Band

##### Motion Animations

<!-- METADATA
category: animation
feature: motion-animations
difficulty: intermediate
version: FlashFX v1.0
-->

- Float
- Swing
- Wobble
- Jello
- Tada
- Wave
- Roll

#### Text FX Tab

<!-- METADATA
category: animation
feature: text-fx
difficulty: intermediate
version: FlashFX v1.0
-->

34 text-specific animation presets across 6 categories:

##### Text Reveal / Writing (7 animations)

<!-- METADATA
category: animation
feature: text-reveal
difficulty: intermediate
version: FlashFX v1.0
-->

- Typewriter: Characters appear one by one with cursor blink
- Script Write: Path-based handwriting reveal
- Word Pop: Words appear sequentially with micro scale
- Line Reveal: Lines appear from top to bottom with mask
- Mask Wipe: Text revealed by directional clipping
- Fade In Order: Opacity stagger per character/word
- Underline Write: Line writes first, text follows

##### Motion In (Entry) (7 animations)

<!-- METADATA
category: animation
feature: text-motion-in
difficulty: intermediate
version: FlashFX v1.0
-->

- Slide In: From left/right/up/down with stagger
- Rise From Baseline: Letters rise from baseline with overshoot
- Drop In: Characters fall with gravity feel
- Scale Up: Subtle zoom in with easing
- Elastic In: Bounce overshoot then settle
- Flip In: 3D flip around X or Y axis
- Split Reveal: Text splits from center outward

##### Motion Out (Exit) (5 animations)

<!-- METADATA
category: animation
feature: text-motion-out
difficulty: intermediate
version: FlashFX v1.0
-->

- Slide Out: Directional exit
- Fade Out Order: Reverse stagger fade
- Collapse: Text scales down to center
- Explode: Characters scatter outward
- Sink: Text falls below baseline

##### Emphasis / Loop (5 animations)

<!-- METADATA
category: animation
feature: text-emphasis
difficulty: intermediate
version: FlashFX v1.0
-->

- Pulse: Soft scale and opacity loop
- Wiggle: Micro random position and rotation
- Bounce: Vertical bounce emphasis
- Shake: Horizontal jitter
- Glow Pulse: Glow intensity oscillates

##### Transform / Structural (4 animations)

<!-- METADATA
category: animation
feature: text-transform
difficulty: advanced
version: FlashFX v1.0
-->

- Morph In: Letters morph from lines or blocks
- Stretch In: Text stretches then snaps back
- Skew Snap: Skew in then straighten
- Perspective Push: Z axis push toward camera

##### Premium / Advanced (6 animations)

<!-- METADATA
category: animation
feature: text-premium
difficulty: advanced
version: FlashFX v1.0
-->

- Kinetic Flow: Characters follow curved motion path
- Wave Write: Writing head moves in wave pattern
- Fragment Assemble: Text assembles from shards
- Neon Draw: Stroke draw with glow trail
- Glitch In: Digital glitch then settle
- Magnetic Align: Characters snap into place from chaos

#### Favorites Tab

<!-- METADATA
category: animation
feature: favorites
difficulty: beginner
version: FlashFX v1.0
-->

- Mark animations as favorites
- Quick access to most-used effects
- Click star icon to favorite/unfavorite
- Syncs across sessions (authenticated users)

#### Presets Tab

<!-- METADATA
category: animation
feature: animation-presets
difficulty: intermediate
version: FlashFX v1.0
-->

- Save custom animation presets
- Apply complete element styles
- Save multiple elements as preset
- Share presets (future feature)

### Interpolation Graph

<!-- METADATA
category: animation
feature: interpolation-graph
difficulty: advanced
version: FlashFX v1.0
-->

Fine-tune animation curves with the interpolation editor:
- **Visual Curve Editor**: See animation timing visually
- **Bezier Handles**: Adjust curve shape
- **Preset Curves**: Quick access to easing types
- **Custom Curves**: Create unique timing
- **Per-Keyframe Control**: Different easing per segment

### Text Animation Control

<!-- METADATA
category: animation
feature: text-animation-control
difficulty: intermediate
version: FlashFX v1.0
-->

Special controls for text animations:

#### Animation Modes

<!-- METADATA
category: animation
feature: text-split-modes
difficulty: intermediate
version: FlashFX v1.0
-->

- **Whole**: Animate entire text as one unit
- **Line**: Split and animate per line
- **Word**: Split and animate per word
- **Character**: Split and animate per character

#### Stagger Settings

<!-- METADATA
category: animation
feature: stagger
difficulty: intermediate
version: FlashFX v1.0
-->

- **Stagger Delay**: Time between animated units (0-5 seconds)
- **Direction**: Left-to-right, right-to-left, center-out, random
- **Apply Control**: Convert text into animated units

#### Process

<!-- METADATA
category: animation
feature: text-animation-process
difficulty: intermediate
version: FlashFX v1.0
-->

1. Select text element
2. Set animation mode (character, word, or line)
3. Set stagger delay
4. Click "Apply Text Animation Control"
5. Text splits into individual elements
6. Apply FX animations to see stagger effect

---

## Timeline System

<!-- METADATA
category: timeline
feature: timeline-system
difficulty: intermediate
version: FlashFX v1.0
-->

### Timeline Layout

<!-- METADATA
category: timeline
feature: layout
difficulty: intermediate
version: FlashFX v1.0
-->

#### Design Mode

<!-- METADATA
category: timeline
feature: design-mode-timeline
difficulty: beginner
version: FlashFX v1.0
-->

- No timeline visible
- Focus on design and layout
- Maximum canvas space

#### Animate/Advanced Mode

<!-- METADATA
category: timeline
feature: animate-mode-timeline
difficulty: intermediate
version: FlashFX v1.0
-->

Two timeline panels at bottom:

##### General Timeline (Left Half)

<!-- METADATA
category: timeline
feature: general-timeline
difficulty: intermediate
version: FlashFX v1.0
-->

- **Purpose**: Overview of all elements
- **Display**: One track per element/layer
- **Clips**: Visual representation of element presence
- **Features**:
  - Clip trimming
  - Clip moving
  - Layer reordering
  - Clip duration adjustment
  - Color-coded by element

##### Animation Timeline (Right Half)

<!-- METADATA
category: timeline
feature: animation-timeline
difficulty: intermediate
version: FlashFX v1.0
-->

- **Purpose**: Detailed keyframe editing
- **Display**: Property tracks for selected element
- **Features**:
  - View all keyframes
  - Add/delete keyframes
  - Adjust keyframe timing
  - Change easing per keyframe
  - Copy/paste keyframes

### Timeline Controls

<!-- METADATA
category: timeline
feature: controls
difficulty: intermediate
version: FlashFX v1.0
-->

#### Playhead

<!-- METADATA
category: timeline
feature: playhead
difficulty: beginner
version: FlashFX v1.0
-->

- **Yellow indicator**: Current time position
- **Synchronized**: Moves in both timelines
- **Draggable**: Drag square handle to seek
- **Click to Seek**: Click anywhere on ruler
- **Full Height**: Extends entire timeline height

#### Timeline Ruler

<!-- METADATA
category: timeline
feature: ruler
difficulty: beginner
version: FlashFX v1.0
-->

- **Time Format**: HH:MM:SS:FF (hours:minutes:seconds:frames)
- **Frame Markers**: Individual frame indicators
- **Second Markers**: Larger tick marks
- **Current Time Display**: Digital readout

#### Playback Controls

<!-- METADATA
category: timeline
feature: playback
difficulty: beginner
version: FlashFX v1.0
shortcut: Spacebar
-->

- **Play/Pause**: Spacebar (when not editing text)
- **Frame Forward**: Right arrow
- **Frame Backward**: Left arrow
- **Jump to Start**: Home key
- **Jump to End**: End key

#### Timeline Navigation

<!-- METADATA
category: timeline
feature: navigation
difficulty: intermediate
version: FlashFX v1.0
-->

- **Zoom Timeline**: Ctrl+Scroll (on timeline)
- **Pan Timeline**: Ctrl+Drag (on timeline)
- **Fit Timeline**: Show entire duration

### Working with Clips

<!-- METADATA
category: timeline
feature: clips
difficulty: intermediate
version: FlashFX v1.0
-->

#### Creating Clips

<!-- METADATA
category: timeline
feature: clip-creation
difficulty: intermediate
version: FlashFX v1.0
-->

- Clips automatically created when elements are added
- Default duration: 5 seconds
- Starts at current playhead position

#### Editing Clips

<!-- METADATA
category: timeline
feature: clip-editing
difficulty: intermediate
version: FlashFX v1.0
-->

- **Move Clip**: Drag left/right
- **Trim Start**: Drag left edge
- **Trim End**: Drag right edge
- **Resize**: Drag clip edges
- **Delete**: Select and press Delete

#### Clip Properties

<!-- METADATA
category: timeline
feature: clip-properties
difficulty: intermediate
version: FlashFX v1.0
-->

- **Name**: Matches element name
- **Color**: Matches element color
- **Duration**: Clip length
- **Start Time**: When clip begins
- **End Time**: When clip ends

### Working with Keyframes

<!-- METADATA
category: timeline
feature: keyframe-editing
difficulty: intermediate
version: FlashFX v1.0
-->

#### Adding Keyframes

<!-- METADATA
category: timeline
feature: add-keyframes
difficulty: beginner
version: FlashFX v1.0
-->

- **Automatic**: Change property at current time
- **Manual**: Click "Add Keyframe" button
- **Copy**: Duplicate existing keyframe

#### Editing Keyframes

<!-- METADATA
category: timeline
feature: edit-keyframes
difficulty: intermediate
version: FlashFX v1.0
-->

- **Select**: Click keyframe
- **Move**: Drag to new time
- **Delete**: Select and press Delete
- **Adjust Value**: Change in Properties Panel
- **Change Easing**: Select easing type

#### Keyframe Selection

<!-- METADATA
category: timeline
feature: keyframe-selection
difficulty: intermediate
version: FlashFX v1.0
-->

- **Single**: Click keyframe
- **Multiple**: Ctrl+Click additional keyframes
- **Range**: Shift+Click start and end
- **All**: Ctrl+A (on timeline)

### Sequences

<!-- METADATA
category: timeline
feature: sequences
difficulty: advanced
version: FlashFX v1.0
-->

Group animations into reusable sequences:

#### Creating Sequences

<!-- METADATA
category: timeline
feature: create-sequences
difficulty: advanced
version: FlashFX v1.0
-->

1. Click "Create Sequence" button
2. Name your sequence
3. Set duration
4. Select elements to include
5. Sequence appears in timeline

#### Sequence Benefits

<!-- METADATA
category: timeline
feature: sequence-benefits
difficulty: advanced
version: FlashFX v1.0
-->

- Organize complex animations
- Reuse animation patterns
- Export specific sequences
- Layer multiple sequences

---

## Export Features

<!-- METADATA
category: export
feature: export-system
difficulty: intermediate
version: FlashFX v1.0
-->

### Export Modes

<!-- METADATA
category: export
feature: export-modes
difficulty: intermediate
version: FlashFX v1.0
shortcut: Ctrl+E
-->

Access export options via toolbar button (Upload icon) or Ctrl+E.

#### 1. Export Entire Canvas

<!-- METADATA
category: export
feature: export-canvas
difficulty: beginner
version: FlashFX v1.0
-->

- **Output**: Single PNG or JPEG image
- **Includes**: All visible elements and background
- **Resolution Options**:
  - Canvas native resolution
  - Full HD (1920×1080)
  - 4K (3840×2160)
  - 8K (7680×4320)
  - Custom width and height
- **Quality**: 2x pixel ratio for high quality
- **Formats**:
  - PNG with transparency
  - JPEG with solid background

#### 2. Export ZIP for Animation (Primary Feature)

<!-- METADATA
category: export
feature: export-zip
difficulty: intermediate
version: FlashFX v1.0
-->

- **Output**: ZIP file with multiple PNG files
- **Process**: Each visible shape exported individually
- **Transparency**: All shapes have transparent backgrounds
- **Position Preservation**: Exact canvas positions maintained
- **Layer Order**: Bottom to top (stack order)
- **Naming**: `[projectName]_shape_00.png`, `_shape_01.png`, etc.
- **Use Case**: Import into video editors or compositing software
- **Result**: When overlaid, recreates original canvas perfectly

#### 3. Export Selection

<!-- METADATA
category: export
feature: export-selection
difficulty: beginner
version: FlashFX v1.0
-->

- **Single Element**: Downloads as individual PNG
- **Multiple Elements**: Creates ZIP file
- **Quality**: Same as ZIP export
- **Use Case**: Export specific elements only

### Video Export

<!-- METADATA
category: export
feature: video-export
difficulty: advanced
version: FlashFX v1.0
-->

Export animations as video files:

#### Video Formats

<!-- METADATA
category: export
feature: video-formats
difficulty: advanced
version: FlashFX v1.0
-->

- **WebM**: VP8 or VP9 codec
- **MP4**: H.264 codec (coming soon)

#### Export Settings

<!-- METADATA
category: export
feature: video-settings
difficulty: advanced
version: FlashFX v1.0
-->

- **Frame Rate**: 24, 30, or 60 fps
- **Quality**: Low, Medium, High, Maximum
- **Resolution**: Match canvas or custom
- **Duration**: Export full timeline or range
- **Sequences**: Export specific sequence

#### Export Process

<!-- METADATA
category: export
feature: export-process
difficulty: intermediate
version: FlashFX v1.0
-->

1. Click Export button
2. Select "Video Export" tab
3. Choose format and settings
4. Click "Start Export"
5. Monitor progress bar
6. Video downloads when complete

#### Export Progress

<!-- METADATA
category: export
feature: export-progress
difficulty: beginner
version: FlashFX v1.0
-->

Real-time feedback during export:
- Current frame being rendered
- Progress percentage
- Estimated time remaining
- Frame preview
- Cancel option

### Image Sequence Export

<!-- METADATA
category: export
feature: image-sequence
difficulty: intermediate
version: FlashFX v1.0
-->

Export animation as numbered PNG frames:

#### Settings

<!-- METADATA
category: export
feature: sequence-settings
difficulty: intermediate
version: FlashFX v1.0
-->

- **Format**: PNG with transparency
- **Naming**: Sequential numbering
- **Frame Range**: All frames or custom range
- **Resolution**: Match canvas or custom

#### Use Cases

<!-- METADATA
category: export
feature: sequence-use-cases
difficulty: intermediate
version: FlashFX v1.0
-->

- Import into After Effects
- Use in game engines
- Create GIF animations
- Frame-by-frame editing

### Export Best Practices

<!-- METADATA
category: export
feature: best-practices
difficulty: intermediate
version: FlashFX v1.0
-->

#### Before Exporting

<!-- METADATA
category: export
feature: pre-export-checklist
difficulty: beginner
version: FlashFX v1.0
-->

1. Save your project first
2. Test playback at full quality
3. Hide unwanted elements
4. Check canvas dimensions
5. Verify animation timing

#### For Best Quality

<!-- METADATA
category: export
feature: quality-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use highest resolution needed
2. Select maximum quality setting
3. Use 60fps for smooth playback
4. Export at 2x canvas size
5. Use lossless formats when possible

#### For File Size

<!-- METADATA
category: export
feature: filesize-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use lower quality settings
2. Reduce frame rate to 24fps
3. Use WebM with VP9 codec
4. Export at 1x canvas size
5. Trim timeline to needed duration

---

## Project Management

<!-- METADATA
category: project
feature: project-management
difficulty: beginner
version: FlashFX v1.0
-->

### Creating Projects

<!-- METADATA
category: project
feature: create-project
difficulty: beginner
version: FlashFX v1.0
-->

#### New Project

<!-- METADATA
category: project
feature: new-project
difficulty: beginner
version: FlashFX v1.0
-->

1. Click "NEW PROJECT" on home page
2. Enter project name
3. Set canvas dimensions
4. Click "Create"

#### Project Settings

<!-- METADATA
category: project
feature: project-settings
difficulty: beginner
version: FlashFX v1.0
-->

- **Name**: Descriptive project name
- **Canvas Size**: Width and height in pixels
- **FPS**: Frames per second (24, 30, 60)
- **Duration**: Initial timeline length
- **Unit**: Pixels (px)

### Saving Projects

<!-- METADATA
category: project
feature: save-project
difficulty: beginner
version: FlashFX v1.0
-->

#### Auto-Save

<!-- METADATA
category: project
feature: auto-save
difficulty: beginner
version: FlashFX v1.0
-->

- Automatically saves every 60 seconds
- Preview thumbnail generated
- Saves to cloud (authenticated) or local (guest)
- No user action required

#### Manual Save

<!-- METADATA
category: project
feature: manual-save
difficulty: beginner
version: FlashFX v1.0
shortcut: Ctrl+S
-->

- **Ctrl+S**: Quick save
- **Save Button**: In top bar
- **Save As**: Create duplicate with new name

#### What Gets Saved

<!-- METADATA
category: project
feature: save-contents
difficulty: intermediate
version: FlashFX v1.0
-->

- All elements and properties
- Animation keyframes
- Timeline clips
- Canvas settings (zoom, pan)
- Grid settings
- Background configuration
- Layer visibility and lock states

### Loading Projects

<!-- METADATA
category: project
feature: load-project
difficulty: beginner
version: FlashFX v1.0
-->

#### From Home Page

<!-- METADATA
category: project
feature: load-from-home
difficulty: beginner
version: FlashFX v1.0
-->

1. Navigate to home page
2. View project cards with thumbnails
3. Click project to open
4. Projects sorted by "last modified"

#### From Editor

<!-- METADATA
category: project
feature: load-from-editor
difficulty: beginner
version: FlashFX v1.0
-->

1. Click "Load" button in top bar
2. Browse project list
3. Select project
4. Opens in current window

#### Project List Features

<!-- METADATA
category: project
feature: project-list
difficulty: beginner
version: FlashFX v1.0
-->

- **Thumbnails**: Preview of last save
- **Project Name**: Click to open
- **Last Modified**: Date/time stamp
- **Delete**: Remove project (with confirmation)
- **Rename**: Change project name
- **Duplicate**: Create copy

### Project Files

<!-- METADATA
category: project
feature: project-files
difficulty: intermediate
version: FlashFX v1.0
-->

#### Export Project File

<!-- METADATA
category: project
feature: export-project-file
difficulty: intermediate
version: FlashFX v1.0
-->

1. Click "Save As File" button
2. Downloads `.flashfx` file
3. Contains all project data
4. Includes embedded assets

#### Import Project File

<!-- METADATA
category: project
feature: import-project-file
difficulty: intermediate
version: FlashFX v1.0
-->

1. Click "Load from File" button
2. Select `.flashfx` file
3. Project loads into editor
4. All data preserved

#### Project File Format

<!-- METADATA
category: project
feature: file-format
difficulty: advanced
version: FlashFX v1.0
-->

- **Extension**: `.flashfx`
- **Structure**: Compressed JSON + assets
- **Compression**: ZIP format
- **Size**: Depends on assets and complexity

### Cloud Storage

<!-- METADATA
category: project
feature: cloud-storage
difficulty: intermediate
version: FlashFX v1.0
-->

#### Authenticated Users

<!-- METADATA
category: project
feature: cloud-auth
difficulty: intermediate
version: FlashFX v1.0
-->

- **Storage Quota**: 50MB free tier
- **Upgrade Options**: Available in settings
- **Sync**: Automatic across devices
- **Backup**: Daily automated backups

#### Storage Management

<!-- METADATA
category: project
feature: storage-management
difficulty: intermediate
version: FlashFX v1.0
-->

View storage usage in Settings:
- Total storage used
- Available storage
- Per-project size
- Media pool usage

### Media Pool

<!-- METADATA
category: project
feature: media-pool
difficulty: beginner
version: FlashFX v1.0
-->

Manage project assets:

#### Adding Media

<!-- METADATA
category: project
feature: add-media
difficulty: beginner
version: FlashFX v1.0
-->

1. Click Media Pool tab in sidebar
2. Click "Add Media" button
3. Select files or drag-and-drop
4. Supported: PNG, JPG, GIF, SVG

#### Media Features

<!-- METADATA
category: project
feature: media-features
difficulty: beginner
version: FlashFX v1.0
-->

- **Preview**: Thumbnail view
- **Metadata**: Name, size, dimensions, date
- **Search**: Filter by name
- **Sort**: By name, date, or size
- **Delete**: Remove unused media
- **Rename**: Change asset name

#### Media Info

<!-- METADATA
category: project
feature: media-info
difficulty: beginner
version: FlashFX v1.0
-->

Right-click media for details:
- File name
- Dimensions (width × height)
- File size
- Upload date
- Usage count (where used in project)

---

## Advanced Features

<!-- METADATA
category: advanced
feature: advanced-features
difficulty: advanced
version: FlashFX v1.0
-->

### AI Integration

<!-- METADATA
category: ai
feature: ai-integration
difficulty: intermediate
version: FlashFX v1.0
-->

#### AI Chat Assistant

<!-- METADATA
category: ai
feature: ai-chat
difficulty: beginner
version: FlashFX v1.0
-->

1. Click AI icon in sidebar
2. Type design questions or requests
3. AI provides suggestions
4. Can generate elements
5. Understands FlashFX context

#### Example Prompts

<!-- METADATA
category: ai
feature: ai-prompts
difficulty: beginner
version: FlashFX v1.0
-->

- "Create a button with gradient background"
- "Add a title with shadow effect"
- "Animate this element to fade in"
- "How do I export as video?"

#### DALL-E Image Generation

<!-- METADATA
category: ai
feature: dalle
difficulty: intermediate
version: FlashFX v1.0
-->

1. Open image import menu
2. Select "Generate with DALL-E"
3. Enter image description
4. AI generates image
5. Automatically imported to canvas

#### Google Image Search

<!-- METADATA
category: ai
feature: google-search
difficulty: beginner
version: FlashFX v1.0
-->

1. Open image import menu
2. Select "Search Images"
3. Enter search term
4. Browse results
5. Click to import

### Presets

<!-- METADATA
category: presets
feature: presets-system
difficulty: intermediate
version: FlashFX v1.0
-->

#### Saving Presets

<!-- METADATA
category: presets
feature: save-preset
difficulty: intermediate
version: FlashFX v1.0
-->

1. Select element(s) to save
2. Click "Save as Preset" button
3. Enter name and description
4. Preset saved to library

#### Using Presets

<!-- METADATA
category: presets
feature: use-preset
difficulty: beginner
version: FlashFX v1.0
-->

1. Open Presets tab
2. Browse preset library
3. Click preset to apply
4. Positioned at mouse cursor

#### Preset Types

<!-- METADATA
category: presets
feature: preset-types
difficulty: intermediate
version: FlashFX v1.0
-->

- **Style Presets**: Colors, effects, styling
- **Element Presets**: Complete elements
- **Group Presets**: Multiple elements
- **Animation Presets**: Keyframes and timing

### JSON Editor

<!-- METADATA
category: advanced
feature: json-editor
difficulty: advanced
version: FlashFX v1.0
-->

For advanced users who want direct data access:

#### Element JSON Editor

<!-- METADATA
category: advanced
feature: element-json
difficulty: advanced
version: FlashFX v1.0
-->

1. Right-click element
2. Select "Edit JSON"
3. Monaco editor opens
4. Edit element properties
5. Save to apply changes

#### Project JSON Editor

<!-- METADATA
category: advanced
feature: project-json
difficulty: advanced
version: FlashFX v1.0
-->

1. Click Settings → Advanced
2. Select "Edit Project JSON"
3. View/edit entire project structure
4. Schema validation
5. Syntax highlighting

#### Use Cases

<!-- METADATA
category: advanced
feature: json-use-cases
difficulty: advanced
version: FlashFX v1.0
-->

- Bulk property changes
- Copy complex configurations
- Debug element issues
- Advanced transformations
- Script integration

### Shape Defaults

<!-- METADATA
category: advanced
feature: shape-defaults
difficulty: intermediate
version: FlashFX v1.0
-->

Configure default properties for new shapes:

#### Accessing Defaults

<!-- METADATA
category: advanced
feature: access-defaults
difficulty: intermediate
version: FlashFX v1.0
-->

1. Open Settings
2. Navigate to "Shape Defaults"
3. Select shape type
4. Set default properties

#### Configurable Defaults

<!-- METADATA
category: advanced
feature: default-options
difficulty: intermediate
version: FlashFX v1.0
-->

- Fill color
- Stroke color and width
- Opacity
- Border radius
- Shadow settings
- Font settings (for text)
- Line caps and joins (for lines)

### Grid System

<!-- METADATA
category: ui
feature: grid-system
difficulty: intermediate
version: FlashFX v1.0
-->

Advanced grid configuration:

#### Grid Settings

<!-- METADATA
category: ui
feature: grid-settings
difficulty: intermediate
version: FlashFX v1.0
-->

- **Grid Size**: 8, 16, 24, 32, 48, 64, 128, 200px
- **Grid Color**: Customizable
- **Subdivisions**: Major and minor grid lines
- **Snap Threshold**: Distance for snapping

#### Grid Types

<!-- METADATA
category: ui
feature: grid-types
difficulty: intermediate
version: FlashFX v1.0
-->

- **Square Grid**: Uniform spacing
- **Isometric Grid**: 30-degree angle (coming soon)
- **Custom Grid**: Define your own spacing

### Snapping System

<!-- METADATA
category: ui
feature: snapping-system
difficulty: intermediate
version: FlashFX v1.0
-->

Precise element alignment:

#### Snap Types

<!-- METADATA
category: ui
feature: snap-types
difficulty: intermediate
version: FlashFX v1.0
-->

- **Snap to Grid**: Align to grid points
- **Snap to Elements**: Align with other elements
- **Snap to Canvas**: Align to canvas edges
- **Snap to Center**: Align to canvas center

#### Smart Snapping

<!-- METADATA
category: ui
feature: smart-snapping
difficulty: intermediate
version: FlashFX v1.0
-->

- **Distance Indicators**: Equal spacing between elements
- **Alignment Lines**: Visual guides when aligned
- **Corner Snapping**: Snap corners to grid
- **Center Snapping**: Snap centers to guides

### Groups and Hierarchy

<!-- METADATA
category: shapes
feature: groups
difficulty: intermediate
version: FlashFX v1.0
-->

Organize complex projects:

#### Creating Groups

<!-- METADATA
category: shapes
feature: create-group
difficulty: intermediate
version: FlashFX v1.0
shortcut: Ctrl+G
-->

1. Select multiple elements (Ctrl+Click)
2. Press Ctrl+G or right-click → Group
3. Elements combined into group
4. Group appears in layers panel

#### Working with Groups

<!-- METADATA
category: shapes
feature: work-with-groups
difficulty: intermediate
version: FlashFX v1.0
-->

- **Select Group**: Click any element in group
- **Edit Individual**: Double-click to enter group
- **Exit Group**: Click outside group
- **Ungroup**: Ctrl+Shift+G

#### Group Benefits

<!-- METADATA
category: shapes
feature: group-benefits
difficulty: intermediate
version: FlashFX v1.0
-->

- Transform multiple elements together
- Organize layers hierarchically
- Hide/show multiple elements
- Lock multiple elements
- Apply group-level transformations

### History and Undo

<!-- METADATA
category: ui
feature: undo-redo
difficulty: beginner
version: FlashFX v1.0
-->

Comprehensive undo/redo system:

#### Undo/Redo

<!-- METADATA
category: ui
feature: undo-redo-controls
difficulty: beginner
version: FlashFX v1.0
shortcut: Ctrl+Z
-->

- **Undo**: Ctrl+Z
- **Redo**: Ctrl+Y or Ctrl+Shift+Z
- **History Depth**: Unlimited (memory permitting)

#### What Can Be Undone

<!-- METADATA
category: ui
feature: undo-scope
difficulty: beginner
version: FlashFX v1.0
-->

- Element creation/deletion
- Property changes
- Position/transform changes
- Keyframe creation/deletion
- Layer reordering
- Group/ungroup operations

### Clipboard

<!-- METADATA
category: ui
feature: clipboard
difficulty: beginner
version: FlashFX v1.0
-->

Copy and paste elements:

#### Copy/Paste

<!-- METADATA
category: ui
feature: copy-paste
difficulty: beginner
version: FlashFX v1.0
shortcut: Ctrl+C/V
-->

- **Copy**: Ctrl+C
- **Paste**: Ctrl+V
- **Duplicate**: Ctrl+D (copies and pastes in one step)

#### What Gets Copied

<!-- METADATA
category: ui
feature: copy-contents
difficulty: intermediate
version: FlashFX v1.0
-->

- Element properties
- Animation keyframes
- Child elements (for groups)
- Relative positioning maintained

### Canvas Context Menu

<!-- METADATA
category: ui
feature: context-menu
difficulty: beginner
version: FlashFX v1.0
-->

Right-click on canvas (empty area) for quick actions:

#### Create Shape

<!-- METADATA
category: ui
feature: context-create-shape
difficulty: beginner
version: FlashFX v1.0
-->

- Rectangle
- Circle
- Text
- Line
- Image

#### Import

<!-- METADATA
category: ui
feature: context-import
difficulty: beginner
version: FlashFX v1.0
-->

- Import image at cursor position
- Select from media pool

#### Apply Preset

<!-- METADATA
category: ui
feature: context-preset
difficulty: beginner
version: FlashFX v1.0
-->

- Choose from preset library
- Positioned at cursor

#### View

<!-- METADATA
category: ui
feature: context-view
difficulty: beginner
version: FlashFX v1.0
-->

- Fit to screen
- Reset zoom
- Clear canvas
- Reset transform

---

## Keyboard Shortcuts

<!-- METADATA
category: shortcuts
feature: keyboard-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

### Shape Creation

<!-- METADATA
category: shortcuts
feature: shape-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

- **Q**: Add Rectangle
- **W**: Add Circle
- **E**: Add Text
- **R**: Add Button
- **T**: Add Chat Bubble
- **Y**: Add Chat Frame
- **U**: Add Line
- **V**: Select Tool

### View Controls

<!-- METADATA
category: shortcuts
feature: view-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

- **+**: Zoom in (5%)
- **-**: Zoom out (5%)
- **Ctrl+0**: Fit to screen
- **Ctrl+=**: Zoom in
- **Ctrl+-**: Zoom out
- **G**: Toggle grid
- **Ctrl+;**: Toggle snapping
- **Ctrl+'**: Toggle smart guides

### Edit Operations

<!-- METADATA
category: shortcuts
feature: edit-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo
- **Ctrl+Shift+Z**: Redo (alternative)
- **Ctrl+D**: Duplicate selected
- **Delete**: Delete selected
- **Backspace**: Delete selected

### Selection

<!-- METADATA
category: shortcuts
feature: selection-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

- **Ctrl+A**: Select all
- **Escape**: Deselect all
- **Ctrl+G**: Group selected
- **Ctrl+Shift+G**: Ungroup selected
- **Tab**: Select next element
- **Shift+Tab**: Select previous element

### Navigation

<!-- METADATA
category: shortcuts
feature: navigation-shortcuts
difficulty: beginner
version: FlashFX v1.0
-->

- **Arrow Keys**: Nudge selected 1px
- **Shift+Arrow**: Nudge selected 10px
- **Ctrl+Arrow**: Move to edge
- **Spacebar**: Pan canvas (drag)

### Timeline

<!-- METADATA
category: shortcuts
feature: timeline-shortcuts
difficulty: intermediate
version: FlashFX v1.0
-->

- **Spacebar**: Play/pause (when not editing text)
- **Left Arrow**: Previous frame
- **Right Arrow**: Next frame
- **Home**: Jump to start
- **End**: Jump to end

### Advanced

<!-- METADATA
category: shortcuts
feature: advanced-shortcuts
difficulty: intermediate
version: FlashFX v1.0
-->

- **Ctrl+E**: Export
- **Ctrl+S**: Save project
- **Ctrl+O**: Open project
- **Ctrl+N**: New project
- **Ctrl+Alt+Shift+S**: Show shortcuts list

### Layer Management

<!-- METADATA
category: shortcuts
feature: layer-shortcuts
difficulty: intermediate
version: FlashFX v1.0
-->

- **Ctrl+]**: Bring forward
- **Ctrl+[**: Send backward
- **Ctrl+Shift+]**: Bring to front
- **Ctrl+Shift+[**: Send to back
- **Ctrl+L**: Lock selected
- **Ctrl+Shift+L**: Unlock selected
- **Ctrl+H**: Hide selected
- **Ctrl+Shift+H**: Show selected

---

## Tips and Best Practices

<!-- METADATA
category: tips
feature: best-practices
difficulty: intermediate
version: FlashFX v1.0
-->

### Design Tips

<!-- METADATA
category: tips
feature: design-tips
difficulty: beginner
version: FlashFX v1.0
-->

#### Starting a New Project

<!-- METADATA
category: tips
feature: project-start-tips
difficulty: beginner
version: FlashFX v1.0
-->

1. Plan canvas dimensions for final output
2. Use 4K (3840×2160) for video
3. Use HD (1920×1080) for web
4. Set appropriate FPS (30 for web, 60 for smooth motion)

#### Organizing Layers

<!-- METADATA
category: tips
feature: layer-organization-tips
difficulty: beginner
version: FlashFX v1.0
-->

1. Use descriptive names for elements
2. Group related elements together
3. Use consistent naming conventions
4. Lock background elements
5. Hide elements you're not working on

#### Color Management

<!-- METADATA
category: tips
feature: color-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use consistent color palette
2. Save colors as presets
3. Use gradients for depth
4. Consider accessibility (contrast)

#### Typography

<!-- METADATA
category: tips
feature: typography-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Limit font families (2-3 per project)
2. Establish type hierarchy
3. Use appropriate line height (120-150%)
4. Consider readability at export resolution

### Animation Tips

<!-- METADATA
category: tips
feature: animation-tips
difficulty: intermediate
version: FlashFX v1.0
-->

#### Smooth Animations

<!-- METADATA
category: tips
feature: smooth-animation-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use Ease In-Out for natural motion
2. Avoid linear easing (unless intentional)
3. Add slight overshoot with Back easing
4. Use Elastic sparingly for emphasis
5. Match easing to content (fast for tech, smooth for luxury)

#### Timing and Pacing

<!-- METADATA
category: tips
feature: timing-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Fast animations: 0.2-0.3 seconds
2. Standard animations: 0.4-0.6 seconds
3. Slow animations: 0.8-1.2 seconds
4. Add delays between staggered elements
5. Don't animate too many properties at once

#### Text Animation Best Practices

<!-- METADATA
category: tips
feature: text-animation-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use character animation for emphasis
2. Use word animation for readability
3. Keep stagger delays short (0.05-0.15s)
4. Combine with motion for impact
5. Test at final frame rate

#### Keyframe Management

<!-- METADATA
category: tips
feature: keyframe-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Start with fewer keyframes
2. Add detail as needed
3. Use interpolation to smooth curves
4. Delete unnecessary keyframes
5. Copy keyframes for consistency

### Export Tips

<!-- METADATA
category: tips
feature: export-tips
difficulty: intermediate
version: FlashFX v1.0
-->

#### Before Exporting

<!-- METADATA
category: tips
feature: pre-export-tips
difficulty: beginner
version: FlashFX v1.0
-->

1. Test animation at full quality
2. Check all elements are visible
3. Verify timeline duration
4. Save project first
5. Close unnecessary applications

#### For Video

<!-- METADATA
category: tips
feature: video-export-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Export at final resolution (don't upscale)
2. Use 60fps for smooth motion
3. Choose WebM VP9 for quality
4. Use maximum quality for final output
5. Export preview at lower quality first

#### For Animation (ZIP)

<!-- METADATA
category: tips
feature: zip-export-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use for After Effects or Premiere
2. Export at 2x resolution for scaling
3. Verify all layers export correctly
4. Check layer order in output
5. Test import before final export

### Performance Tips

<!-- METADATA
category: tips
feature: performance-tips
difficulty: intermediate
version: FlashFX v1.0
-->

#### Canvas Performance

<!-- METADATA
category: tips
feature: canvas-performance-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Use appropriate canvas size
2. Limit elements to necessary items
3. Reduce image sizes before import
4. Use groups to organize
5. Hide off-screen elements

#### Animation Performance

<!-- METADATA
category: tips
feature: animation-performance-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Limit simultaneous animations
2. Use simple easing functions
3. Reduce keyframe count
4. Optimize image filters
5. Test on target device

#### Export Performance

<!-- METADATA
category: tips
feature: export-performance-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Close other applications
2. Export at appropriate resolution
3. Use lower quality for previews
4. Export in smaller sequences
5. Monitor system resources

### Workflow Tips

<!-- METADATA
category: tips
feature: workflow-tips
difficulty: intermediate
version: FlashFX v1.0
-->

#### Efficient Workflow

<!-- METADATA
category: tips
feature: efficient-workflow-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Learn keyboard shortcuts
2. Use presets for consistency
3. Save work frequently (Ctrl+S)
4. Organize media in media pool
5. Use descriptive names everywhere

#### Collaboration

<!-- METADATA
category: tips
feature: collaboration-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Export project files for sharing
2. Document design decisions
3. Use consistent naming
4. Save preset libraries
5. Export style guides

#### Backup Strategy

<!-- METADATA
category: tips
feature: backup-tips
difficulty: intermediate
version: FlashFX v1.0
-->

1. Enable auto-save
2. Export project files regularly
3. Save to cloud storage
4. Keep local backups
5. Version your project files

---

## Troubleshooting

<!-- METADATA
category: troubleshooting
feature: common-issues
difficulty: beginner
version: FlashFX v1.0
-->

### Common Issues

<!-- METADATA
category: troubleshooting
feature: canvas-issues
difficulty: beginner
version: FlashFX v1.0
-->

#### Canvas Not Showing

<!-- METADATA
category: troubleshooting
feature: blank-canvas
difficulty: beginner
version: FlashFX v1.0
-->

**Problem**: Canvas appears blank or elements don't render

**Solutions**:
1. Check browser compatibility (Chrome, Firefox, Edge, Safari)
2. Clear browser cache
3. Disable browser extensions
4. Try incognito/private mode
5. Update browser to latest version

#### Elements Won't Select

<!-- METADATA
category: troubleshooting
feature: selection-issues
difficulty: beginner
version: FlashFX v1.0
-->

**Problem**: Can't click or select elements

**Solutions**:
1. Check if element is locked (unlock in layers panel)
2. Check if element is hidden (show in layers panel)
3. Try selecting from layers panel instead
4. Check if element is behind others (reorder layers)
5. Zoom in for small elements

#### Animation Not Playing

<!-- METADATA
category: troubleshooting
feature: playback-issues
difficulty: intermediate
version: FlashFX v1.0
-->

**Problem**: Timeline playhead doesn't move or animation doesn't play

**Solutions**:
1. Check if playhead is at start position
2. Verify timeline duration is long enough
3. Check if elements have keyframes
4. Try switching layout modes
5. Refresh the page and reload project

#### Export Fails

<!-- METADATA
category: troubleshooting
feature: export-issues
difficulty: intermediate
version: FlashFX v1.0
-->

**Problem**: Export process fails or produces corrupt files

**Solutions**:
1. Save project first
2. Reduce canvas resolution
3. Export fewer elements
4. Close other applications
5. Check available disk space
6. Try different export format

#### Memory Issues

<!-- METADATA
category: troubleshooting
feature: memory-issues
difficulty: intermediate
version: FlashFX v1.0
-->

**Problem**: Application slow or browser crashes

**Solutions**:
1. Reduce canvas size
2. Optimize images before import
3. Delete unused media from media pool
4. Limit number of elements
5. Close other browser tabs
6. Restart browser

#### Project Won't Save

<!-- METADATA
category: troubleshooting
feature: save-issues
difficulty: intermediate
version: FlashFX v1.0
-->

**Problem**: Can't save project to cloud or local storage

**Solutions**:
1. Check storage quota (Settings → Storage)
2. Delete unused projects
3. Clear media pool of unused assets
4. For guest mode: Check browser storage settings
5. For cloud: Check internet connection
6. Export project file as backup

#### Keyframes Not Creating

<!-- METADATA
category: troubleshooting
feature: keyframe-issues
difficulty: intermediate
version: FlashFX v1.0
-->

**Problem**: Changing properties doesn't create keyframes

**Solutions**:
1. Ensure element is selected
2. Check if in Animate or Advanced mode
3. Move playhead to different time
4. Try manual keyframe creation
5. Check if property is animatable

#### Background Not Showing

<!-- METADATA
category: troubleshooting
feature: background-issues
difficulty: beginner
version: FlashFX v1.0
-->

**Problem**: Background settings don't appear or don't render

**Solutions**:
1. Deselect all elements first
2. Check background is enabled
3. Verify layer has color stops
4. Check layer opacity settings
5. Verify blend modes

### Browser Compatibility

<!-- METADATA
category: troubleshooting
feature: browser-compatibility
difficulty: beginner
version: FlashFX v1.0
-->

#### Supported Browsers

<!-- METADATA
category: troubleshooting
feature: supported-browsers
difficulty: beginner
version: FlashFX v1.0
-->

- **Chrome**: Version 90+ (Recommended)
- **Firefox**: Version 88+
- **Safari**: Version 14+
- **Edge**: Version 90+

#### Required Features

<!-- METADATA
category: troubleshooting
feature: browser-requirements
difficulty: advanced
version: FlashFX v1.0
-->

- ES2020 JavaScript support
- Canvas API
- Web Workers
- IndexedDB
- Local Storage
- File API (for downloads)
- WebGL (for filters)

#### Not Supported

<!-- METADATA
category: troubleshooting
feature: unsupported-browsers
difficulty: beginner
version: FlashFX v1.0
-->

- Internet Explorer (any version)
- Older browser versions
- Mobile browsers (limited support)

### Performance Optimization

<!-- METADATA
category: troubleshooting
feature: performance-optimization
difficulty: intermediate
version: FlashFX v1.0
-->

#### If FlashFX is Running Slow:

<!-- METADATA
category: troubleshooting
feature: slow-performance-fixes
difficulty: intermediate
version: FlashFX v1.0
-->

1. **Reduce Canvas Size**: Use 1920×1080 instead of 4K for editing
2. **Optimize Images**: Compress images before importing
3. **Limit Elements**: Keep element count under 50 for smooth performance
4. **Reduce Filters**: Image filters are GPU-intensive
5. **Close Other Tabs**: Free up browser memory
6. **Disable Extensions**: Some extensions interfere with canvas rendering
7. **Update Graphics Drivers**: Ensure GPU drivers are current
8. **Use Hardware Acceleration**: Enable in browser settings

### Getting Help

<!-- METADATA
category: troubleshooting
feature: getting-help
difficulty: beginner
version: FlashFX v1.0
-->

#### Resources

<!-- METADATA
category: troubleshooting
feature: help-resources
difficulty: beginner
version: FlashFX v1.0
-->

1. **This Documentation**: Complete feature reference
2. **Keyboard Shortcuts List**: Press Ctrl+Alt+Shift+S
3. **AI Chat Assistant**: Ask questions in the app
4. **Browser Console**: Check for error messages (F12)

#### Reporting Bugs

<!-- METADATA
category: troubleshooting
feature: bug-reporting
difficulty: intermediate
version: FlashFX v1.0
-->

1. Check browser console for errors
2. Note steps to reproduce
3. Save project and export project file
4. Include browser version and OS
5. Describe expected vs actual behavior

---

## Appendix

<!-- METADATA
category: reference
feature: appendix
difficulty: beginner
version: FlashFX v1.0
-->

### Glossary

<!-- METADATA
category: reference
feature: glossary
difficulty: beginner
version: FlashFX v1.0
-->

- **Artboard**: The canvas area where you design
- **Clip**: Visual representation of element on timeline
- **Easing**: Speed curve of animation
- **Element**: Any shape, text, or image on canvas
- **FPS**: Frames per second
- **Keyframe**: Animation point marking property value at specific time
- **Layer**: Element in layers panel (stacking order)
- **Material**: Multi-layer visual effect system
- **Playhead**: Timeline indicator showing current time
- **Preset**: Saved style or animation configuration
- **Property**: Attribute of element (position, color, etc.)
- **Sequence**: Group of animations
- **Snap**: Alignment to grid or other elements
- **Track**: Timeline row showing keyframes for property

### File Formats

<!-- METADATA
category: reference
feature: file-formats
difficulty: beginner
version: FlashFX v1.0
-->

#### Import Formats

<!-- METADATA
category: reference
feature: import-formats
difficulty: beginner
version: FlashFX v1.0
-->

- **Images**: PNG, JPG, GIF, SVG
- **Project**: .flashfx (FlashFX project file)

#### Export Formats

<!-- METADATA
category: reference
feature: export-formats
difficulty: beginner
version: FlashFX v1.0
-->

- **Images**: PNG (transparent), JPEG
- **Video**: WebM (VP8, VP9), MP4 (coming soon)
- **Archive**: ZIP (for animation export)
- **Project**: .flashfx (for sharing)

### System Requirements

<!-- METADATA
category: reference
feature: system-requirements
difficulty: beginner
version: FlashFX v1.0
-->

#### Minimum Requirements

<!-- METADATA
category: reference
feature: minimum-requirements
difficulty: beginner
version: FlashFX v1.0
-->

- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **RAM**: 4GB
- **Display**: 1280×720 or higher
- **Internet**: Required for cloud features, optional for guest mode
- **Storage**: 100MB browser storage for guest mode

#### Recommended Requirements

<!-- METADATA
category: reference
feature: recommended-requirements
difficulty: beginner
version: FlashFX v1.0
-->

- **Browser**: Latest Chrome or Edge
- **RAM**: 8GB or more
- **Display**: 1920×1080 or higher
- **Internet**: Stable broadband connection
- **GPU**: Dedicated graphics card for complex filters and effects
- **Storage**: Cloud account for unlimited projects

### Future Features

<!-- METADATA
category: reference
feature: future-features
difficulty: beginner
version: FlashFX v1.0
-->

Features planned for future releases:
- Real-time collaboration
- Video import and editing
- Audio tracks and synchronization
- Shape morphing animations
- 3D transform support
- Plugin system
- Template marketplace
- Mobile responsive design
- Advanced particle effects
- More export formats (GIF, SVG, PDF)
- Custom font uploads
- Background image support
- Animated gradients

---

## Conclusion

<!-- METADATA
category: conclusion
feature: summary
difficulty: beginner
version: FlashFX v1.0
-->

FlashFX is a powerful, professional-grade motion graphics tool accessible directly in your browser. This guide covers all features, from basic shape creation to advanced animation techniques and video export.

### Quick Start Checklist

<!-- METADATA
category: conclusion
feature: quick-start
difficulty: beginner
version: FlashFX v1.0
-->

To get productive quickly:
1. Create an account or continue as guest
2. Create your first project
3. Learn 5 keyboard shortcuts: Q, W, E, Ctrl+D, Delete
4. Add and style a shape
5. Switch to Animate mode
6. Create a simple animation
7. Export your work

### Learning Path

<!-- METADATA
category: conclusion
feature: learning-path
difficulty: beginner
version: FlashFX v1.0
-->

For beginners:
1. **Week 1**: Master shape creation and styling
2. **Week 2**: Learn basic animations and timeline
3. **Week 3**: Explore text features and effects
4. **Week 4**: Practice export and project management

For advanced users:
- Explore material system for complex visuals
- Master keyframe editing and easing curves
- Create reusable presets and animation libraries
- Use JSON editor for advanced control
- Develop efficient workflows with shortcuts

### Community and Support

<!-- METADATA
category: conclusion
feature: support
difficulty: beginner
version: FlashFX v1.0
-->

FlashFX is continuously evolving. Stay updated:
- Check documentation for new features
- Use AI assistant for context-specific help
- Report bugs through proper channels
- Share feedback for improvements

**Happy creating with FlashFX!**
