# FlashFX 3D Feature System — Technical Documentation

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Technology Stack](#2-technology-stack)
- [3. File Structure](#3-file-structure)
- [4. Architecture Deep Dive](#4-architecture-deep-dive)
  - [4.1 Per-Shape Renderer Model](#41-per-shape-renderer-model)
  - [4.2 Canvas Integration](#42-canvas-integration)
  - [4.3 Dirty Flag Render Loop](#43-dirty-flag-render-loop)
  - [4.4 Mode System](#44-mode-system)
  - [4.5 Scene Serialization](#45-scene-serialization)
- [5. ThreeDShapeElement](#5-threedshapeelement)
- [6. ThreeDEngine](#6-threedengine)
- [7. SceneManager](#7-scenemanager)
- [8. GizmoController](#8-gizmocontroller)
- [9. GeometryFactory](#9-geometryfactory)
- [10. MaterialSystem](#10-materialsystem)
- [11. 3D Properties Panel](#11-3d-properties-panel)
- [12. Texture System](#12-texture-system)
- [13. Model Import System](#13-model-import-system)
- [14. 3D Shape Library](#14-3d-shape-library)
- [15. Performance Guide](#15-performance-guide)
- [16. Keyboard Shortcuts Reference](#16-keyboard-shortcuts-reference)
- [17. Troubleshooting](#17-troubleshooting)
- [18. Extending the System](#18-extending-the-system)

---

## 1. Overview

The 3D feature system enables users to embed live, interactive Three.js viewports directly into the 2D design canvas. Each 3D shape behaves like any other canvas element — it can be repositioned, resized, layered, have its opacity adjusted, and participate in the animation timeline — but internally it contains a fully independent Three.js scene where users can place, transform, and material-paint 3D primitives or imported models.

### Snapshot-Bridge Architecture

The core architectural idea is called the **snapshot-bridge**. Every 3D shape on the 2D canvas is a live Three.js renderer embedded as an HTML `<canvas>` element inside a `<div>` that is absolutely positioned within the 2D canvas artboard. The 2D canvas system controls *where* the 3D viewport sits (position, size, rotation, opacity), while the Three.js renderer controls *what* is drawn inside it.

This approach was chosen over two alternatives:

1. **Single shared Three.js scene** — rejected because it creates stacking and z-order conflicts between shapes, and because deletion of one shape would require surgical extraction from a shared scene graph. A bug where shapes would disappear when another was deselected drove the switch to isolation.
2. **Offline render-to-texture** — rejected because it cannot provide real-time orbit interaction. The user needs to orbit, zoom, and pan inside each shape independently while editing.

```
┌─────────────────────────────────────────────────┐
│              2D Canvas (Artboard)                │
│                                                  │
│   ┌──────────────────┐  ┌──────────────────┐     │
│   │ <div> host        │  │ <div> host        │    │
│   │  ┌──────────────┐ │  │  ┌──────────────┐ │   │
│   │  │ WebGLRenderer │ │  │  │ WebGLRenderer │ │   │
│   │  │   <canvas>    │ │  │  │   <canvas>    │ │   │
│   │  │              │ │  │  │              │ │   │
│   │  │  Scene       │ │  │  │  Scene       │ │   │
│   │  │  Camera      │ │  │  │  Camera      │ │   │
│   │  │  OrbitCtrl   │ │  │  │  OrbitCtrl   │ │   │
│   │  └──────────────┘ │  │  └──────────────┘ │   │
│   │  ThreeDShapeElem  │  │  ThreeDShapeElem  │   │
│   └──────────────────┘  └──────────────────┘     │
│                                                  │
│   CSS transform on artboard handles zoom/pan     │
└─────────────────────────────────────────────────┘
```

The bridge between the 2D world and the 3D world is the **`DesignElement`** type. Every 2D element with `type === 'threed-shape'` stores three optional 3D fields:

| Field | Type | Purpose |
|-------|------|---------|
| `threeDMetadata` | `ThreeDMetadata` | Serialized scene snapshot metadata for project save/load |
| `threeDGeometryType` | `GeometryType` | The primitive type the shape was created with (e.g. `'box'`) |
| `threeDSceneState` | `SceneStateSnapshot` | Live scene state used for persistence and restoration |

These fields are defined in `src/types/design.ts` (lines 200-205).

---

## 2. Technology Stack

| Package | Version | Purpose | Documentation | Required? |
|---------|---------|---------|---------------|-----------|
| `three` | `^0.183.1` | Core 3D rendering engine. Provides WebGLRenderer, Scene, Camera, Geometry, Material, and all scene graph primitives. Every file in `src/3d/` depends on it. | [threejs.org/docs](https://threejs.org/docs/) | Hard requirement |
| `@types/three` | `^0.183.1` | TypeScript type definitions for Three.js. Development dependency only. | [npmjs.com/package/@types/three](https://www.npmjs.com/package/@types/three) | Hard requirement (TypeScript) |
| `gsap` | `^3.14.2` | GreenSock animation platform. Used by the broader app animation engine; not directly imported by any `src/3d/` file, but the animation timeline can animate 3D element canvas-level properties (position, opacity). | [gsap.com/docs](https://gsap.com/docs/v3/) | Not directly used by 3D |
| `postprocessing` | `^6.38.3` | Post-processing effects library for Three.js. Listed in `package.json` and referenced in the `PostProcessingConfig` type in `src/3d/types.ts` (lines 177-193), but no actual post-processing passes are currently instantiated in the engine code. The type infrastructure is in place for future bloom and SSAO support. | [npmjs.com/package/postprocessing](https://www.npmjs.com/package/postprocessing) | Soft (future use) |

Additionally, the following Three.js addon modules from `three/examples/jsm/` are used:

| Module | Imported By | Purpose |
|--------|-------------|---------|
| `OrbitControls` | `ThreeDEngine.ts`, `GizmoController.ts` | Camera orbit/pan/zoom interaction |
| `TransformControls` | `GizmoController.ts` | Translate/Rotate/Scale gizmo overlay |
| `GLTFLoader` | `ModelLoader.ts` | Loading `.glb` and `.gltf` files |
| `DRACOLoader` | `ModelLoader.ts` | Decompressing Draco-encoded GLTF meshes |
| `OBJLoader` | `ModelLoader.ts` | Loading `.obj` files |
| `FBXLoader` | `ModelLoader.ts` | Loading `.fbx` files |
| `STLLoader` | `ModelLoader.ts` | Loading `.stl` files |

---

## 3. File Structure

### Core 3D files (`src/3d/`)

| File | Responsibility | Exports |
|------|---------------|---------|
| **`types.ts`** | Central type definitions and default constants for the entire 3D system. Defines all interfaces, enums, and default config objects. | `GeometryType`, `MaterialType`, `GizmoMode`, `SideType`, `ToonSteps`, `Vec3`, `TextureMapState`, `MaterialConfig`, `GeometryConfig`, `EnvironmentConfig`, `PostProcessingConfig`, `Object3DConfig`, `SceneStateSnapshot`, `SerializedObject`, `ThreeDMetadata`, `ThreeDSceneState`, and all `DEFAULT_*` constants |
| **`ThreeDShapeElement.ts`** | Top-level facade. Each instance owns one `ThreeDEngine`. Provides the public API consumed by `ThreeDShapeRenderer.tsx`. | `ThreeDShapeElement` (class), `ThreeDShapeElementOptions` (interface) |
| **`ThreeDEngine.ts`** | Creates and manages the WebGLRenderer, Scene, Camera, OrbitControls, lights, and render loop. Delegates shape management to `SceneManager` and gizmo management to `GizmoController`. | `ThreeDEngine` (class) |
| **`SceneManager.ts`** | Maintains the registry of 3D objects in a scene. Handles add, remove, select, raycast, transform, material, and geometry updates. | `SceneManager` (class) |
| **`GizmoController.ts`** | Wraps Three.js `TransformControls`. Manages attach/detach, mode switching, and the OrbitControls conflict. | `GizmoController` (class) |
| **`GeometryFactory.ts`** | Pure functions that create `BufferGeometry` instances from a `GeometryConfig`. Supports all six primitive types plus SVG extrusion. | `createPrimitiveGeometry()`, `createPrimitiveMesh()`, `extrudeFromShapes()`, `disposeGeometry()` |
| **`MaterialSystem.ts`** | Creates and updates Three.js materials from a `MaterialConfig`. Handles texture loading, caching, and disposal. | `createMaterial()`, `updateMeshMaterial()`, `disposeMaterial()`, `createTextureFromFile()`, `disposeTextureByUrl()` |
| **`ModelLoader.ts`** | Loads external 3D model files. Handles format detection, loader instantiation, normalization, and object URL lifecycle. | `loadModel()`, `isSupported()`, `getSupportedFormatsText()` |
| **`SceneSerializer.ts`** | Serializes the engine's scene state to a JSON-safe snapshot and restores it on load. | `serializeScene()`, `createThreeDMetadata()`, `restoreScene()`, `isThreeDElement()` |

### React UI components (`src/3d/`)

| File | Responsibility | Exports |
|------|---------------|---------|
| **`ThreeDShapeRenderer.tsx`** | React component that mounts a `ThreeDShapeElement` into a DOM container. Manages the element lifecycle, resize syncing, interaction mode, and visibility-based pause/resume. | `ThreeDShapeRenderer` (React component, default export) |
| **`ThreeDPropertiesPanel.tsx`** | The full properties panel shown when a 3D shape is selected. Contains controls for canvas position, gizmo mode, 3D transform, geometry, material type, material properties, and texture maps. | `ThreeDPropertiesPanel` (React component, default export) |
| **`ThreeDShapePicker.tsx`** | Modal dialog for choosing a primitive shape type or importing a model. Shows a grid of six shape cards with SVG icons and a live 3D preview. | `ThreeDShapePicker` (React component, default export) |
| **`ThreeDShapePreview.tsx`** | A self-contained auto-rotating preview renderer used inside `ThreeDShapePicker`. Creates a temporary `ThreeDEngine`, adds the requested primitive, and orbits the camera around it. | `ThreeDShapePreview` (React component, default export) |

### Integration points outside `src/3d/`

| File | 3D Relevance |
|------|-------------|
| `src/types/design.ts` (lines 200-205) | Defines `threeDMetadata`, `threeDGeometryType`, and `threeDSceneState` fields on `DesignElement` |
| `src/components/design-tool/Canvas.tsx` | Renders `ThreeDShapeRenderer` for every `threed-shape` element. Controls pointer event routing via `activeThreeDElementId`. |
| `public/draco/gltf/` | Contains Draco decoder WASM files (`draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js`) required by `DRACOLoader` |

### Dependency Graph

```
types.ts  ←─────────────────────────────────────────────┐
  ↑                                                      │
  ├── GeometryFactory.ts ← MaterialSystem.ts             │
  │         ↑                     ↑                      │
  │         └────── SceneManager.ts ──────────────┐      │
  │                       ↑                       │      │
  │              ThreeDEngine.ts ← GizmoController.ts    │
  │                       ↑                              │
  │              SceneSerializer.ts ──────────────────────┘
  │                       ↑
  │              ThreeDShapeElement.ts
  │                       ↑
  │         ┌─────────────┼──────────────┐
  │         │             │              │
  │  ThreeDShapeRenderer  │  ThreeDPropertiesPanel
  │         │             │
  │         │    ThreeDShapePicker
  │         │             │
  │         │    ThreeDShapePreview
  │         │
  │    Canvas.tsx (design-tool)
  │
  └── design.ts (types)
```

---

## 4. Architecture Deep Dive

### 4.1 Per-Shape Renderer Model

Each `ThreeDShapeElement` instance owns exactly one isolated Three.js world: one `WebGLRenderer`, one `Scene`, one `PerspectiveCamera`, and one set of `OrbitControls`. Shapes do **not** share any Three.js resources.

This is documented directly in the source header of `ThreeDShapeElement.ts` (lines 1-17):

```typescript
/*
 * Each threed-shape element on the canvas owns exactly one isolated Three.js world:
 * one WebGLRenderer, one Scene, one PerspectiveCamera, one set of OrbitControls.
 * Shapes do NOT share any Three.js resources. This design ensures:
 *
 * - Clean disposal: when a shape is deleted, its entire GL context, all geometries,
 *   materials, and textures are released in a single deterministic dispose() call.
 * - Independent animation: each shape renders only when its own dirty flag is set,
 *   keeping GPU work minimal when shapes are idle.
 * - No cross-contamination: selecting, transforming, or changing the material of one
 *   shape has zero effect on the rendering of any other shape.
 */
```

**Tradeoffs:**

- **Pro:** Complete isolation. Deleting a shape is a single `dispose()` call with no entanglement.
- **Pro:** Independent dirty flags mean idle shapes consume zero GPU time.
- **Pro:** No z-order or stacking conflicts between shapes.
- **Con:** Each shape creates its own WebGL context. Browsers enforce a hard limit (typically 8-16 active contexts). Exceeding this causes the oldest context to be silently lost. This limits the practical number of simultaneous 3D shapes.

### 4.2 Canvas Integration

The Three.js renderer canvas is mounted by **`ThreeDShapeRenderer.tsx`**. The component creates a `<div>` with `position: relative; overflow: hidden` and passes it to `ThreeDShapeElement` as the mount container. Inside, `ThreeDEngine` creates a `WebGLRenderer`, sets its DOM element to `display: block; width: 100%; height: 100%`, and appends it to the container (`ThreeDEngine.ts`, lines 56-59).

The host `<div>` is positioned inside the 2D artboard by **`Canvas.tsx`** using absolute positioning:

```typescript
// Canvas.tsx — positioning the 3D host div
<div
  style={{
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity ?? 1,
    overflow: 'hidden',
    pointerEvents: activeThreeDElementId === el.id ? 'auto' : 'none',
    zIndex: elements.indexOf(el) + 1,
    borderRadius: el.borderRadius ?? 0,
  }}
>
  <ThreeDShapeRenderer ... />
</div>
```

The CSS `transform` on the artboard container handles zoom and pan automatically — the 3D `<div>` is a child of the artboard so it inherits the transform.

Resize synchronization happens via a `useEffect` in `ThreeDShapeRenderer.tsx` (lines 50-54) that calls `instance.resize(element.width, element.height)` whenever the element dimensions change:

```typescript
useEffect(() => {
  if (instanceRef.current) {
    instanceRef.current.resize(element.width, element.height);
  }
}, [element.width, element.height]);
```

### 4.3 Dirty Flag Render Loop

The render loop in `ThreeDEngine.ts` (lines 140-151) uses a **render-on-demand** pattern:

```typescript
private startLoop(): void {
  const loop = () => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(loop);
    this.orbit.update();
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };
  loop();
}
```

`requestAnimationFrame` runs every frame, but the actual `renderer.render()` call only fires when `this.dirty === true`. The `orbit.update()` still runs every frame because OrbitControls damping needs continuous updates when enabled.

**Events that set `dirty = true`:**

| Event | Location |
|-------|----------|
| OrbitControls `'change'` event | `ThreeDEngine.ts:71` |
| Gizmo drag (`'change'` event) | `ThreeDEngine.ts:107` |
| `selectObject()` called | `ThreeDEngine.ts:173` |
| `addPrimitive()` called | `ThreeDEngine.ts:187` |
| `removeObject()` called | `ThreeDEngine.ts:233` |
| `setGizmoMode()` called | `ThreeDEngine.ts:238` |
| `updateTransform()` called | `ThreeDEngine.ts:243` |
| `updateMaterial()` called | `ThreeDEngine.ts:248` |
| `updateGeometry()` called | `ThreeDEngine.ts:253` |
| `updateEnvironment()` called | `ThreeDEngine.ts:263` |
| `resize()` called | `ThreeDEngine.ts:312` |
| `setInteracting()` on `ThreeDShapeElement` | `ThreeDShapeElement.ts:55` |
| `markDirty()` called directly | `ThreeDEngine.ts:153-154` |

When a shape is idle (no user interaction, no property changes), it consumes zero GPU resources because the dirty flag stays false.

### 4.4 Mode System

A 3D shape has two interaction states:

1. **Canvas mode** (default): The shape is selected on the 2D canvas. The user can move, resize, and adjust 2D properties (position, opacity, border radius). Pointer events are set to `'none'` on the 3D host div, so clicks pass through to the 2D canvas system.

2. **3D editing mode**: The user has double-clicked the shape (or otherwise set it as the active 3D element). The `activeThreeDElementId` prop on Canvas matches this element's ID. Pointer events are set to `'auto'`, allowing orbit/pan/zoom and object selection inside the Three.js scene.

The transition is controlled by the `isInteracting` prop on `ThreeDShapeRenderer`, which flows into `ThreeDShapeElement.setInteracting()`:

```typescript
// ThreeDShapeElement.ts
setInteracting(active: boolean): void {
  if (this._isInteracting === active) return;
  this._isInteracting = active;
  this.engine.setOrbitEnabled(active);
  this.engine.markDirty();
}
```

When `isInteracting` is `false`, `OrbitControls` are disabled and the shape acts as a static image on the canvas.

### 4.5 Scene Serialization

Scene state is serialized to a JSON-safe object by `SceneSerializer.ts`. The serialization captures:

- All objects in the scene (id, name, geometry type, geometry config, material config, position, rotation, scale, imported model name)
- Camera position and orbit target
- Environment configuration (light intensities, colors, background color)

```typescript
// SceneSerializer.ts — serializeScene()
export function serializeScene(engine: ThreeDEngine, environment: EnvironmentConfig): SceneStateSnapshot {
  const objects: SerializedObject[] = engine.getAllObjects().map((obj) => ({
    id: obj.id,
    name: obj.name,
    geometryType: obj.geometryType,
    geometry: { ...obj.geometry },
    material: { ...obj.material },
    position: { ...obj.position },
    rotation: { ...obj.rotation },
    scale: { ...obj.scale },
    importedModelName: obj.importedModelName,
  }));

  return {
    objects,
    cameraPosition: engine.getCameraPosition(),
    cameraTarget: engine.getCameraTarget(),
    environment: { ...environment },
  };
}
```

**Restoration** is handled by `restoreScene()`. It clears the engine's scene, iterates over the serialized objects, and calls `sceneManager.restoreFromConfig()` for each one. Imported models (`geometryType === 'imported'`) are **skipped** during restoration because their binary mesh data is not stored in the snapshot — only primitive shapes can be fully reconstructed.

After restoring objects, the camera position and environment are applied, and `markDirty()` is called.

---

## 5. ThreeDShapeElement

**File:** `src/3d/ThreeDShapeElement.ts`

The `ThreeDShapeElement` class is the primary facade for the 3D system. Each instance encapsulates a full Three.js environment.

### Constructor

```typescript
constructor(mountContainer: HTMLElement, options: ThreeDShapeElementOptions = {})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `mountContainer` | `HTMLElement` | The DOM element that will receive the WebGLRenderer canvas |
| `options.geometryType` | `GeometryType` (optional) | Primitive type to create initially. Defaults to `'box'` |
| `options.sceneState` | `SceneStateSnapshot` (optional) | If provided, the scene is restored from this snapshot instead of creating a new primitive |

If `sceneState` is provided, the constructor calls `restoreScene()`. Otherwise, it calls `engine.addPrimitive()` with the given geometry type.

### Public Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| **`getEngine()`** | `(): ThreeDEngine` | Returns the underlying engine instance for direct API access |
| **`resize()`** | `(width: number, height: number): void` | Resizes the renderer and updates the camera aspect ratio |
| **`setInteracting()`** | `(active: boolean): void` | Enables/disables orbit controls and marks dirty. When `false`, the shape acts as a static viewport |
| **`isInteracting()`** | `(): boolean` | Returns the current interaction state |
| **`getSceneSnapshot()`** | `(): SceneStateSnapshot` | Serializes the current scene for persistence |
| **`pause()`** | `(): void` | Stops the render loop (for off-screen optimization) |
| **`resume()`** | `(): void` | Restarts the render loop |
| **`dispose()`** | `(): void` | Destroys the engine, releases all GPU resources, removes the canvas from the DOM. **Must be called when the shape is deleted.** |

### Lifecycle

1. **Construction**: `ThreeDShapeRenderer.tsx` creates a `ThreeDShapeElement` in a `useEffect` and passes the container `<div>`.
2. **Active use**: The user interacts via the properties panel or by entering 3D edit mode. Orbit, gizmo, material, and geometry changes flow through `getEngine()`.
3. **Visibility toggling**: When `element.visible` becomes `false`, `pause()` is called. When it becomes `true`, `resume()` is called (`ThreeDShapeRenderer.tsx`, lines 62-70).
4. **Destruction**: The `useEffect` cleanup function calls `dispose()`, which cascades through `ThreeDEngine.dispose()` to release all resources.

### Programmatic Creation Example

```typescript
const container = document.getElementById('my-3d-host')!;
const shape = new ThreeDShapeElement(container, { geometryType: 'sphere' });

// Access the engine for advanced operations
const engine = shape.getEngine();
engine.updateMaterial('some-id', { ...DEFAULT_MATERIAL_CONFIG, color: '#ff0000' });

// When done
shape.dispose();
```

---

## 6. ThreeDEngine

**File:** `src/3d/ThreeDEngine.ts`

The engine is the central coordinator. It creates all Three.js infrastructure and delegates domain-specific tasks to `SceneManager` and `GizmoController`.

### Initialization Sequence

When a new `ThreeDEngine(container)` is constructed, the following happens in order:

#### 1. Renderer Creation (lines 43-59)

```typescript
this.renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
```

| Option | Value | Reason |
|--------|-------|--------|
| `antialias` | `true` | Smooth edges on geometry |
| `alpha` | `true` | Transparent background so the canvas artboard shows through |
| `preserveDrawingBuffer` | `true` | Required for `toDataURL()` / screenshot capture |

#### 2. Renderer Configuration (lines 48-54)

| Setting | Value | Purpose |
|---------|-------|---------|
| `setPixelRatio` | `Math.min(window.devicePixelRatio, 2)` | Caps at 2x to prevent 4x rendering on Retina/HiDPI. Higher ratios quadruple pixel count with diminishing visual returns. |
| `shadowMap.enabled` | `true` | Enables shadow casting |
| `shadowMap.type` | `THREE.PCFSoftShadowMap` | Soft shadow edges. PCF (Percentage-Closer Filtering) with bilinear filtering produces smooth penumbras. |
| `toneMapping` | `THREE.ACESFilmicToneMapping` | ACES filmic curve maps HDR values to LDR. Provides cinema-grade color reproduction with natural highlight rolloff. |
| `toneMappingExposure` | `1.0` | Neutral exposure. |
| `setClearColor` | `0x000000, 0` | Fully transparent clear. The alpha channel is 0 so the background shows through. |

#### 3. Scene Setup (line 61)

```typescript
this.scene = new THREE.Scene();
```

An empty scene. No background color is set (transparent by default due to renderer `alpha: true`).

#### 4. Camera Setup (lines 63-65)

```typescript
this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
this.camera.position.set(4, 3, 4);
this.camera.lookAt(0, 0, 0);
```

| Parameter | Value | Purpose |
|-----------|-------|---------|
| FOV | `50` | Moderate field of view. Avoids the fisheye distortion of wider angles while keeping a natural perspective. |
| Near plane | `0.1` | Close enough that small objects aren't clipped. |
| Far plane | `1000` | Far enough for large imported models. |
| Position | `(4, 3, 4)` | Positioned along a diagonal giving an isometric-like initial view. |

#### 5. OrbitControls Setup (lines 67-71)

```typescript
this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
this.orbit.enableDamping = true;
this.orbit.dampingFactor = 0.1;
this.orbit.target.set(0, 0, 0);
this.orbit.addEventListener('change', () => { this.dirty = true; });
```

Damping creates smooth deceleration when the user releases the mouse during orbit. The `change` event marks the scene dirty so the renderer draws the updated view.

#### 6. Grid Setup (lines 73-76)

```typescript
this.grid = new THREE.GridHelper(20, 40, 0x444444, 0x2a2a2a);
(this.grid.material as THREE.Material).transparent = true;
(this.grid.material as THREE.Material).opacity = 0.4;
this.grid.visible = false;
```

A 20-unit grid with 40 divisions is created but **hidden by default**. The grid is never added to the scene — it exists as a reference that can be retrieved via `getGridHelper()` and toggled externally if needed.

#### 7. Lighting Setup (lines 78-95)

Three lights are added to every scene:

| Light | Type | Color | Intensity | Position | Shadow |
|-------|------|-------|-----------|----------|--------|
| Ambient | `AmbientLight` | `#ffffff` | `0.4` | N/A | No |
| Directional | `DirectionalLight` | `#ffffff` | `1.0` | `(5, 10, 5)` | Yes (2048x2048 shadow map) |
| Point | `PointLight` | `#ffffff` | `0.3` | `(-3, 5, -3)` | No |

The directional light is the primary light source. Its shadow camera is configured with orthographic bounds of -10 to 10 in all directions, a near plane of 0.1, and a far plane of 50.

#### 8. SceneManager and GizmoController (lines 97-116)

```typescript
this.sceneManager = new SceneManager(this.scene);
this.gizmo = new GizmoController(this.camera, this.renderer.domElement, this.scene, this.orbit);
```

The gizmo's drag callbacks are wired to mark the scene dirty on drag and to sync the transform config on drag-end.

#### 9. Pointer Event Handling (line 118)

```typescript
this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
```

A raycaster-based click handler detects which 3D object the user clicked and selects it.

#### 10. Render Loop Start (line 120)

```typescript
this.startLoop();
```

### Key Public Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| **`markDirty()`** | `(): void` | Forces a re-render on the next frame |
| **`onSelect()`** | `(cb: (id: string \| null) => void): void` | Registers a callback for object selection events |
| **`onTransformEnd()`** | `(cb: (id: string, config: Object3DConfig) => void): void` | Registers a callback for when a gizmo drag ends |
| **`selectObject()`** | `(id: string \| null): void` | Selects an object by ID and attaches the gizmo (or deselects if null) |
| **`addPrimitive()`** | `(type, material?, geometry?): Object3DConfig` | Creates a new primitive mesh and adds it to the scene |
| **`importModelFromFile()`** | `(file: File): Promise<Object3DConfig>` | Loads a 3D model file, normalizes it, and adds it to the scene |
| **`removeObject()`** | `(id: string): void` | Removes an object and disposes its resources |
| **`setGizmoMode()`** | `(mode: GizmoMode): void` | Switches gizmo between translate, rotate, and scale |
| **`updateTransform()`** | `(id, pos?, rot?, scale?): void` | Updates an object's position/rotation/scale |
| **`updateMaterial()`** | `(id, config): void` | Replaces an object's material |
| **`updateGeometry()`** | `(id, config): void` | Replaces an object's geometry (primitives only) |
| **`updateEnvironment()`** | `(config): void` | Updates lighting and background color |
| **`getSelectedObject()`** | `(): Object3DConfig \| null` | Returns config of the selected object |
| **`getAllObjects()`** | `(): Object3DConfig[]` | Returns configs for all objects in the scene |
| **`getCameraPosition()`** | `(): Vec3` | Returns current camera position |
| **`getCameraTarget()`** | `(): Vec3` | Returns current orbit target |
| **`setCameraPosition()`** | `(pos, target): void` | Sets camera position and orbit target |
| **`resize()`** | `(width, height): void` | Resizes renderer and updates camera aspect |
| **`setOrbitEnabled()`** | `(enabled: boolean): void` | Enables/disables orbit controls |
| **`pauseLoop()`** | `(): void` | Stops the render loop |
| **`resumeLoop()`** | `(): void` | Restarts the render loop |
| **`dispose()`** | `(): void` | Full teardown: stops loop, removes event listeners, disposes gizmo, scene manager, orbit, and renderer |

### Dispose Sequence

```typescript
dispose(): void {
  this.disposed = true;
  cancelAnimationFrame(this.animFrameId);
  this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
  this.gizmo.dispose();
  this.sceneManager.dispose();
  this.orbit.dispose();
  this.renderer.dispose();
  if (this.renderer.domElement.parentElement) {
    this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
  }
}
```

The order matters: the gizmo is detached before the scene manager disposes all meshes, then orbit and renderer are disposed, and finally the canvas DOM element is removed.

---

## 7. SceneManager

**File:** `src/3d/SceneManager.ts`

### Shape Registry

The `SceneManager` maintains a `Map<string, { config: Object3DConfig; mesh: THREE.Object3D }>` called `objects`. Each entry pairs an immutable config (the serializable state) with a live Three.js mesh/group.

IDs are generated by `generateId()`:

```typescript
let nextId = 1;
function generateId(): string {
  return `3d-${Date.now()}-${nextId++}`;
}
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| **`addPrimitive()`** | `(type, materialConfig, geometryConfig): Object3DConfig` | Creates a mesh via `GeometryFactory.createPrimitiveMesh()`, positions it at `(0, 0.5, 0)`, registers it in the map, and returns the config |
| **`extrudeFromSvgShapes()`** | `(shapes, name, geometryConfig, materialConfig): Object3DConfig` | Creates an extruded mesh from `THREE.Shape[]` arrays (for SVG icon shapes), registers and returns the config |
| **`importModel()`** | `(object, name): Object3DConfig` | Registers an externally-loaded `Object3D` (from `ModelLoader`). The mesh data comes from the loader; the config captures its current transform |
| **`selectObject()`** | `(id: string \| null): void` | Sets the `selectedId`. Does not attach any gizmo — that is the engine's responsibility |
| **`getSelectedId()`** | `(): string \| null` | Returns the currently selected ID or `null` |
| **`getMesh()`** | `(id: string): THREE.Object3D \| null` | Returns the live mesh for an ID |
| **`getConfig()`** | `(id: string): Object3DConfig \| null` | Returns the config for an ID |
| **`getAllConfigs()`** | `(): Object3DConfig[]` | Returns all configs as an array |
| **`removeObject()`** | `(id: string): void` | Removes the mesh from the scene, traverses it to dispose all geometries and materials, deletes from the map, and clears selection if it was the selected object |
| **`removeAll()`** | `(): void` | Removes every object in the map |
| **`raycast()`** | `(raycaster: THREE.Raycaster): string \| null` | Collects all mesh children of all registered objects, runs `raycaster.intersectObjects()`, and walks up the parent chain to find the `userData.configId`. Returns null if nothing was hit |
| **`updateTransform()`** | `(id, pos?, rot?, scale?): void` | Updates both the live mesh and the stored config. Only applies axes that are provided |
| **`syncTransformFromMesh()`** | `(id: string): void` | Reads the mesh's current position/rotation/scale and writes them back to the config. Called after gizmo drag-end |
| **`updateGeometry()`** | `(id, config): void` | Disposes the old geometry and creates a new one via `createPrimitiveGeometry()`. Only works for non-imported, non-extruded types |
| **`updateMaterial()`** | `(id, config): void` | Traverses the object's children and calls `updateMeshMaterial()` on each mesh. Updates the stored config |
| **`restoreFromConfig()`** | `(config: Object3DConfig): THREE.Object3D \| null` | Reconstructs a mesh from a saved config. Returns `null` for imported models (which cannot be reconstructed from config alone). Sets position, rotation, scale, and `userData.configId` |
| **`dispose()`** | `(): void` | Calls `removeAll()` to clean up everything |

---

## 8. GizmoController

**File:** `src/3d/GizmoController.ts`

### Overview

Wraps Three.js `TransformControls` to provide translate, rotate, and scale gizmos for the selected 3D object.

### Constructor

```typescript
constructor(
  camera: THREE.Camera,
  domElement: HTMLElement,
  scene: THREE.Scene,
  orbit: OrbitControls
)
```

The `TransformControls` helper is added to the scene (`scene.add(this.controls.getHelper())`), and the gizmo size is set to `0.75` (slightly smaller than the default).

### OrbitControls Conflict

When the user drags the gizmo, the pointer events would also orbit the camera. To prevent this, the controller listens for the `'dragging-changed'` event:

```typescript
this.controls.addEventListener('dragging-changed', (event: { value: boolean }) => {
  this.orbit.enabled = !event.value;
});
```

When dragging starts (`value: true`), orbit is disabled. When dragging ends (`value: false`), orbit is re-enabled.

### Gizmo Modes

| Mode | Keyboard Shortcut | Three.js Mode String | Visual |
|------|-------------------|---------------------|--------|
| Translate | W | `'translate'` | XYZ axis arrows |
| Rotate | E | `'rotate'` | XYZ rotation rings |
| Scale | R | `'scale'` | XYZ cube handles |

Note: The keyboard shortcuts (W/E/R) are not handled inside `GizmoController` itself. They are handled by the consuming UI component that calls `engine.setGizmoMode()`.

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| **`onDrag()`** | `(changeCb, endCb): void` | Registers callbacks for continuous drag (changeCb) and drag-end (endCb) |
| **`attach()`** | `(id, object): void` | Attaches the gizmo to a mesh and stores the ID |
| **`detach()`** | `(): void` | Detaches the gizmo from any mesh |
| **`getAttachedId()`** | `(): string \| null` | Returns the ID of the currently attached object |
| **`setMode()`** | `(mode: GizmoMode): void` | Switches between translate, rotate, and scale |
| **`getHelper()`** | `(): THREE.Object3D` | Returns the gizmo's visual helper for scene management |
| **`dispose()`** | `(): void` | Detaches and disposes the TransformControls |

---

## 9. GeometryFactory

**File:** `src/3d/GeometryFactory.ts`

### Primitive Geometries

#### Box

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `width` | `number` | `1` | `> 0` | Width along X axis |
| `height` | `number` | `1` | `> 0` | Height along Y axis |
| `depth` | `number` | `1` | `> 0` | Depth along Z axis |
| `widthSegments` | `number` | `1` | `1-10` | Subdivisions along width |
| `heightSegments` | `number` | `1` | `1-10` | Subdivisions along height |
| `depthSegments` | `number` | `1` | `1-10` | Subdivisions along depth |

Three.js class: `THREE.BoxGeometry`

#### Sphere

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `radius` | `number` | `0.5` | `> 0` | Sphere radius |
| `widthSegments` / `segments` | `number` | `32` | `3-64` | Horizontal segments. Higher = smoother |
| `heightSegments` | `number` | half of widthSegments | `2-32` | Vertical segments |

Three.js class: `THREE.SphereGeometry`

The height segments default to `Math.max(2, Math.round(widthSegments / 2))` if not specified.

#### Cylinder

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `radiusTop` | `number` | `0.5` | `>= 0` | Top circle radius. Set to 0 for a cone shape |
| `radiusBottom` | `number` | `0.5` | `>= 0` | Bottom circle radius |
| `height` | `number` | `1` | `> 0` | Height along Y axis |
| `radialSegments` / `segments` | `number` | `16` | `3-64` | Number of faces around the circumference |

Three.js class: `THREE.CylinderGeometry`

#### Cone

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `radius` | `number` | `0.5` | `> 0` | Base circle radius |
| `height` | `number` | `1` | `> 0` | Height from base to apex |
| `radialSegments` / `segments` | `number` | `16` | `3-64` | Number of faces around the circumference |

Three.js class: `THREE.ConeGeometry`

#### Torus

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `radius` | `number` | `0.5` | `> 0` | Distance from center of torus to center of tube |
| `tubeRadius` | `number` | `0.2` | `> 0` | Radius of the tube cross-section |
| `radialSegments` | `number` | `16` | `3-32` | Segments around the tube cross-section |
| `tubularSegments` / `segments` | `number` | `100` | `3-200` | Segments around the ring |

Three.js class: `THREE.TorusGeometry`

#### Capsule

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `radius` | `number` | `0.5` | `> 0` | Radius of the capsule |
| `height` | `number` | `1` | `> 0` | Length of the middle cylindrical section |
| `radialSegments` / `segments` | `number` | `16` | `3-64` | Segments around the circumference |

Three.js class: `THREE.CapsuleGeometry`. Cap segments are hardcoded to `8`.

### ExtrudeGeometry (SVG-based shapes)

The `extrudeFromShapes()` function takes an array of `THREE.Shape` objects (parsed from SVG paths) and creates an `ExtrudeGeometry`:

```typescript
export function extrudeFromShapes(shapes, config, materialConfig): THREE.Mesh {
  const extrudeSettings = {
    depth: config.extrudeDepth,
    bevelEnabled: config.bevelEnabled,
    bevelThickness: config.bevelThickness,
    bevelSize: config.bevelSize,
    bevelSegments: config.bevelSegments,
  };
  const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
  geometry.center();
  // ...
}
```

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `extrudeDepth` | `number` | `0.5` | `0.01-5` | How far the shape is extruded along Z |
| `bevelEnabled` | `boolean` | `true` | — | Whether to add beveled edges |
| `bevelThickness` | `number` | `0.05` | `0-0.5` | How deep the bevel cuts into the shape |
| `bevelSize` | `number` | `0.03` | `0-0.5` | How far the bevel extends outward |
| `bevelSegments` | `number` | `3` | `1-8` | Smoothness of the bevel curve |

Bevels add rounded edges to the extruded shape. At `bevelSegments: 1` the bevel is a simple chamfer; at higher values it becomes a smooth curve.

### Mesh Properties

All meshes created by the factory have `castShadow` and `receiveShadow` set to `true`.

---

## 10. MaterialSystem

**File:** `src/3d/MaterialSystem.ts`

### Material Types

#### Standard (`MeshStandardMaterial`)

The default PBR material. Supports roughness/metalness workflow, emission, and all standard texture maps.

| Property | Type | Range | Default | Three.js Property |
|----------|------|-------|---------|-------------------|
| color | `string` | hex | `'#3B82F6'` | `material.color` |
| roughness | `number` | `0-1` | `0.5` | `material.roughness` |
| metalness | `number` | `0-1` | `0.1` | `material.metalness` |
| emissive | `string` | hex | `'#000000'` | `material.emissive` |
| emissiveIntensity | `number` | `0-3` | `0` | `material.emissiveIntensity` |
| opacity | `number` | `0-1` | `1` | `material.opacity` |
| flatShading | `boolean` | — | `false` | `material.flatShading` |
| envMapIntensity | `number` | `0-3` | `1` | `material.envMapIntensity` |

#### Physical (`MeshPhysicalMaterial`)

Extends Standard with glass/transmission, clearcoat, sheen, and iridescence.

| Property | Type | Range | Default | Three.js Property |
|----------|------|-------|---------|-------------------|
| transmission | `number` | `0-1` | `0` | `material.transmission` |
| ior | `number` | `1-2.5` | `1.5` | `material.ior` |
| thickness | `number` | `0-10` | `0.5` | `material.thickness` |
| clearcoat | `number` | `0-1` | `0` | `material.clearcoat` |
| clearcoatRoughness | `number` | `0-1` | `0` | `material.clearcoatRoughness` |
| sheen | `number` | `0-1` | `0` | `material.sheen` |
| sheenColor | `string` | hex | `'#ffffff'` | `material.sheenColor` |
| sheenRoughness | `number` | `0-1` | `0.5` | `material.sheenRoughness` |
| iridescence | `number` | `0-1` | `0` | `material.iridescence` |
| iridescenceIOR | `number` | `1-2.5` | `1.5` | `material.iridescenceIOR` |
| iridescenceThicknessMin | `number` | — | `100` | `material.iridescenceThicknessRange[0]` |
| iridescenceThicknessMax | `number` | — | `400` | `material.iridescenceThicknessRange[1]` |
| specularIntensity | `number` | `0-1` | `1` | `material.specularIntensity` |
| specularColor | `string` | hex | `'#ffffff'` | `material.specularColor` |

When `transmission > 0`, `transparent` is automatically set to `true` (line 163 of `MaterialSystem.ts`).

#### Lambert (`MeshLambertMaterial`)

A non-physically-based material using Lambertian reflectance. Cheaper to render. Supports color, emissive, opacity, and common texture maps (color, alpha) only.

#### Phong (`MeshPhongMaterial`)

Classic Blinn-Phong shading model with specular highlights.

| Property | Type | Range | Default | Three.js Property |
|----------|------|-------|---------|-------------------|
| phongSpecular | `string` | hex | `'#ffffff'` | `material.specular` |
| shininess | `number` | `0-1000` | `30` | `material.shininess` |

Also supports normal maps and bump maps.

#### Toon (`MeshToonMaterial`)

Cel-shading material with discrete shading steps.

| Property | Type | Options | Default | Description |
|----------|------|---------|---------|-------------|
| toonSteps | `ToonSteps` | `2`, `3`, `5` | `3` | Number of shading levels |

A `DataTexture` gradient map is built by `buildToonGradient()` with NearestFilter to ensure hard transitions between shading bands.

#### Wireframe

Uses `MeshStandardMaterial` with `wireframe: true`. Supports roughness and metalness for specular response on the wire lines.

### Material Switching

When the user switches material types, `handleMaterialType()` in the properties panel preserves only `color`, `opacity`, and `transparent` from the previous material and resets everything else to `DEFAULT_MATERIAL_CONFIG`:

```typescript
handleMaterial({
  ...DEFAULT_MATERIAL_CONFIG,
  type,
  color: prev.color,
  opacity: prev.opacity,
  transparent: prev.transparent
});
```

All PBR-specific, Phong-specific, and Toon-specific properties are lost when switching away from those types.

### Common Properties (All Types)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `transparent` | `boolean` | `false` | Enables alpha blending |
| `depthWrite` | `boolean` | `true` | Whether to write to the depth buffer. Disable for transparent objects to prevent z-fighting |
| `side` | `'front' \| 'back' \| 'double'` | `'double'` | Which face sides to render |
| `wireframe` | `boolean` | `false` | Overlay wireframe on any material type |

### Texture Cache

`MaterialSystem.ts` maintains a module-level `Map<string, THREE.Texture>` called `textureCache`. Textures are cached by URL to avoid re-loading the same texture multiple times across objects. The cache must be manually cleared via `disposeTextureByUrl()` when textures are removed.

---

## 11. 3D Properties Panel

**File:** `src/3d/ThreeDPropertiesPanel.tsx`

The properties panel is shown when a `threed-shape` element is selected. It is organized into the following sections:

### Canvas Position

| Control | Type | Maps To |
|---------|------|---------|
| X | Numeric input | `element.x` |
| Y | Numeric input | `element.y` |
| W | Numeric input | `element.width` |
| H | Numeric input | `element.height` |
| R | Numeric input (step 1) | `element.rotation` |
| Op | Range slider (0-1, step 0.01) | `element.opacity` |

### Gizmo

Three buttons: **Translate**, **Rotate**, **Scale**. Active button is highlighted with cyan.

### Transform

3D object transform (only shown when an object is selected inside the 3D scene):

| Sub-section | Controls | Maps To |
|-------------|----------|---------|
| Position | X, Y, Z numeric inputs (step 0.1) | `Object3DConfig.position` |
| Rotation | X, Y, Z numeric inputs (step 0.1) | `Object3DConfig.rotation` |
| Scale | X, Y, Z numeric inputs (step 0.1) | `Object3DConfig.scale` |

### Geometry

Shown only for non-imported primitives and extruded shapes. Controls vary by geometry type. See [Section 9: GeometryFactory](#9-geometryfactory) for the full parameter breakdown per type.

### Material Type Selector

A `<select>` dropdown with options:

| Option | Label |
|--------|-------|
| `standard` | Standard |
| `physical` | Physical (Glass) |
| `lambert` | Lambert |
| `phong` | Phong |
| `toon` | Toon |
| `wireframe` | Wireframe |

### Base Properties

| Label | Control | Range | Default | Three.js Property |
|-------|---------|-------|---------|-------------------|
| Color | Color picker | — | `#3B82F6` | `material.color` |
| Opacity | Slider | 0-1 (step 0.01) | 1 | `material.opacity` (auto-sets `transparent` if < 1) |
| Transparent | Toggle | — | `false` | `material.transparent` |
| Side | Segmented (Front/Back/Double) | — | Double | `material.side` |
| Wireframe | Toggle | — | `false` | `material.wireframe` |
| Flat Shade | Toggle (hidden for Lambert/Toon/Wireframe) | — | `false` | `material.flatShading` |
| Depth Write | Toggle | — | `true` | `material.depthWrite` |

### PBR Properties (Standard and Physical only)

| Label | Control | Range | Three.js Property |
|-------|---------|-------|-------------------|
| Roughness | Slider | 0-1 (step 0.01) | `material.roughness` |
| Metalness | Slider | 0-1 (step 0.01) | `material.metalness` |
| Emissive | Color picker | — | `material.emissive` |
| Emiss Int | Slider | 0-3 (step 0.01) | `material.emissiveIntensity` |
| Env Map | Slider | 0-3 (step 0.01) | `material.envMapIntensity` |

### Physical Material Properties (Physical only)

| Label | Control | Range | Three.js Property |
|-------|---------|-------|-------------------|
| Transmission | Slider | 0-1 (step 0.01) | `material.transmission` (auto-sets `transparent: true` when > 0) |
| Thickness | Slider | 0-10 (step 0.1) | `material.thickness` |
| IOR | Slider | 1-2.5 (step 0.01) | `material.ior` |
| Clearcoat | Slider | 0-1 (step 0.01) | `material.clearcoat` |
| CC Rough | Slider (shown when clearcoat > 0) | 0-1 (step 0.01) | `material.clearcoatRoughness` |
| Sheen | Slider | 0-1 (step 0.01) | `material.sheen` |
| Sheen Color | Color picker (shown when sheen > 0) | — | `material.sheenColor` |
| Sheen Rough | Slider (shown when sheen > 0) | 0-1 (step 0.01) | `material.sheenRoughness` |
| Iridescence | Slider | 0-1 (step 0.01) | `material.iridescence` |
| Irid IOR | Slider (shown when iridescence > 0) | 1-2.5 (step 0.01) | `material.iridescenceIOR` |
| Irid Min/Max | Numeric inputs (shown when iridescence > 0) | step 10 | `material.iridescenceThicknessRange` |
| Specular Int | Slider | 0-1 (step 0.01) | `material.specularIntensity` |
| Specular Col | Color picker | — | `material.specularColor` |

IOR preset buttons: Water (1.33), Glass (1.5), Diamond (2.4).

### Phong Properties (Phong only)

| Label | Control | Range | Three.js Property |
|-------|---------|-------|-------------------|
| Specular | Color picker | — | `material.specular` |
| Shininess | Slider | 0-1000 (step 1) | `material.shininess` |
| Emissive | Color picker | — | `material.emissive` |
| Emiss Int | Slider | 0-3 (step 0.01) | `material.emissiveIntensity` |

### Lambert Properties (Lambert only)

| Label | Control | Range | Three.js Property |
|-------|---------|-------|-------------------|
| Emissive | Color picker | — | `material.emissive` |
| Emiss Int | Slider | 0-3 (step 0.01) | `material.emissiveIntensity` |

### Toon Properties (Toon only)

| Label | Control | Options | Three.js Property |
|-------|---------|---------|-------------------|
| Shading | Segmented control | 2 Steps / 3 Steps / 5 Steps | `MeshToonMaterial.gradientMap` (rebuilt via `buildToonGradient()`) |

### Texture Maps

Each texture slot shows an Upload button when empty, and the filename with expand/remove buttons when loaded. See [Section 12: Texture System](#12-texture-system) for details.

| Map | Color Space | Available For | Three.js Property |
|-----|-------------|---------------|-------------------|
| Color (Albedo) | sRGB | All types | `material.map` |
| Roughness | Linear | Standard, Physical | `material.roughnessMap` |
| Metalness | Linear | Standard, Physical | `material.metalnessMap` |
| Normal | Linear | Standard, Physical, Phong | `material.normalMap` |
| Bump | Linear | Standard, Physical, Phong | `material.bumpMap` |
| AO | Linear | Standard, Physical | `material.aoMap` |
| Emissive Map | sRGB | Standard, Physical | `material.emissiveMap` |
| Alpha | Linear | All types | `material.alphaMap` (auto-sets `transparent: true`) |

### Texture Transform Controls (per texture, expandable)

| Label | Control | Range | Three.js Property |
|-------|---------|-------|-------------------|
| RepX | Numeric input (step 0.1) | — | `texture.repeat.x` |
| RepY | Numeric input (step 0.1) | — | `texture.repeat.y` |
| Offset X | Slider | -1 to 1 (step 0.01) | `texture.offset.x` |
| Offset Y | Slider | -1 to 1 (step 0.01) | `texture.offset.y` |
| Rotation | Slider + numeric | 0-360 (step 1, degrees) | `texture.rotation` (converted to radians) |
| Wrap | Dropdown (Clamp/Repeat/Mirrored) | — | `texture.wrapS`, `texture.wrapT` |
| Anisotropy | Slider | 1-16 (step 1) | `texture.anisotropy` |

---

## 12. Texture System

### Upload and Loading Pipeline

1. User clicks "Upload" on a texture slot in the properties panel.
2. A file input accepts `.png`, `.jpg`, `.jpeg`, `.webp`.
3. `createTextureFromFile()` in `MaterialSystem.ts` is called:
   - Creates an object URL via `URL.createObjectURL(file)`.
   - Uses `THREE.TextureLoader` to load the texture from the object URL.
   - Sets the `colorSpace` based on the texture type.
   - Caches the texture in the module-level `textureCache` map.
   - **Revokes the object URL** immediately after loading (`URL.revokeObjectURL(url)`).
   - Calls the `onLoad` callback with the texture and URL.

### Color Space Rules

| Map Type | Color Space | Constant | Why |
|----------|-------------|----------|-----|
| Color (Albedo) | sRGB | `THREE.SRGBColorSpace` | Color data is authored in sRGB. Three.js needs to know this to correctly linearize it before lighting calculations. |
| Emissive Map | sRGB | `THREE.SRGBColorSpace` | Same reason as color maps — emissive colors are authored in sRGB. |
| All other maps | Linear | `THREE.LinearSRGBColorSpace` | Roughness, metalness, normal, bump, AO, and alpha maps store non-color data (physical parameters or vectors). If loaded as sRGB, the gamma curve would distort the values, making roughness 0.5 appear as ~0.73. |

If a color map is incorrectly loaded as Linear, colors will appear washed out and desaturated. If a normal map is loaded as sRGB, surface details will be exaggerated and incorrect.

### Texture Transform Controls

| Control | Three.js Property | Visual Effect |
|---------|-------------------|---------------|
| Repeat X/Y | `texture.repeat` | Tiles the texture. Values > 1 repeat it; < 1 stretches it |
| Offset X/Y | `texture.offset` | Slides the texture across the surface |
| Rotation | `texture.rotation` | Rotates the texture around the UV origin (in degrees, converted to radians) |
| Wrap Mode | `texture.wrapS`, `texture.wrapT` | **Clamp**: stretches edge pixels. **Repeat**: tiles seamlessly. **Mirror**: tiles with alternating flip |
| Anisotropy | `texture.anisotropy` | Improves texture clarity at oblique angles. 1 is no filtering; 16 is maximum. Higher values cost more GPU |

### Wrap Mode Mapping

```typescript
const wrapMap = {
  clamp: THREE.ClampToEdgeWrapping,
  repeat: THREE.RepeatWrapping,
  mirror: THREE.MirroredRepeatWrapping,
};
```

### AO Maps and UV2

Three.js `MeshStandardMaterial` reads AO maps from a second UV channel (`uv2`). The current codebase loads and applies AO maps via `mat.aoMap = t` without explicitly creating a `uv2` attribute. For primitive geometries created by Three.js, the default UV coordinates are used for both channels. This works for simple primitives but may produce incorrect AO on imported models that have separate UV2 layouts.

### Disposal

When a texture is removed from a slot, `disposeTextureByUrl()` is called:

```typescript
export function disposeTextureByUrl(url: string): void {
  const tex = textureCache.get(url);
  if (tex) {
    tex.dispose();
    textureCache.delete(url);
  }
}
```

This frees the GPU memory used by the texture.

---

## 13. Model Import System

**File:** `src/3d/ModelLoader.ts`

### Supported Formats

| Format | Extensions | Data Supported | Three.js Loader | Notes |
|--------|-----------|----------------|-----------------|-------|
| GLTF Binary | `.glb` | Geometry, materials, textures, animations, scene hierarchy | `GLTFLoader` | Recommended format. Self-contained binary file. |
| GLTF | `.gltf` | Same as GLB | `GLTFLoader` | JSON file, may reference external `.bin` and texture files (won't work with object URLs for multi-file GLTF) |
| Wavefront OBJ | `.obj` | Geometry only | `OBJLoader` | No materials or textures. All meshes get default material |
| FBX | `.fbx` | Geometry, materials (basic), animations | `FBXLoader` | Autodesk format. Material fidelity varies |
| STL | `.stl` | Geometry only (triangulated mesh) | `STLLoader` | 3D printing format. Gets a default blue material (`#3B82F6`, roughness 0.5, metalness 0.1) |

### Import Pipeline

1. **File picker**: The user clicks "Import 3D Model from PC" in the shape picker. A hidden `<input type="file" accept=".glb,.gltf,.obj,.fbx,.stl">` opens.

2. **Extension detection**: The file extension is extracted via `file.name.split('.').pop()?.toLowerCase()`.

3. **Object URL creation**: `URL.createObjectURL(file)` creates a temporary URL the loader can fetch.

4. **Loader selection**: A `switch` statement selects the appropriate loader:
   ```typescript
   switch (ext) {
     case 'glb':
     case 'gltf': return getGLTFLoader().loadAsync(url);
     case 'obj':  return getOBJLoader().loadAsync(url);
     case 'fbx':  return getFBXLoader().loadAsync(url);
     case 'stl':  // returns geometry, wrapped in a Mesh
   }
   ```

5. **Normalization**: `normalizeModel()` scales and centers the model:
   - Computes the bounding box of the loaded object.
   - Calculates a scale factor so the largest dimension becomes 2 units: `scaleFactor = 2 / maxDim`.
   - Applies the scale.
   - Recomputes the bounding box and translates the object so its center is at the origin.

6. **Shadow setup**: All meshes in the model have `castShadow` and `receiveShadow` set to `true`.

7. **URL revocation**: `URL.revokeObjectURL(url)` releases the temporary URL.

8. **Scene registration**: The engine calls `sceneManager.removeAll()` (clearing any existing primitives) then `sceneManager.importModel(object, name)`.

### Draco Decoder Setup

Draco is a compression algorithm for GLTF meshes. The decoder files must be served from `public/draco/gltf/`:

```
public/draco/gltf/
├── draco_decoder.js
├── draco_decoder.wasm
└── draco_wasm_wrapper.js
```

The path is configured in `getGLTFLoader()`:

```typescript
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/gltf/');
gltfLoader.setDRACOLoader(dracoLoader);
```

If these files are missing, loading Draco-compressed GLTF files will fail silently or throw a network error.

### Loader Caching

Loaders are lazily instantiated as module-level singletons. The first call to `getGLTFLoader()`, `getOBJLoader()`, etc. creates the loader; subsequent calls reuse it.

### Engine Safety

`ThreeDEngine.importModelFromFile()` (lines 195-226) includes safety checks:

1. If the engine is disposed before loading starts, an error is thrown.
2. If the engine is disposed during the async load, the loaded object's geometries and materials are immediately disposed to prevent memory leaks.
3. On success, the existing scene is cleared before the model is added.

### Serialization Limitation

Imported models have `geometryType: 'imported'` in their config. The `restoreScene()` function **skips** imported models because their binary mesh data cannot be reconstructed from the JSON config. If a project is saved and reloaded, imported models will be lost. Only primitive shapes survive serialization.

---

## 14. 3D Shape Library

**File:** `src/3d/ThreeDShapePicker.tsx`

### Opening the Picker

The picker is controlled by an `isOpen` boolean prop. When open, it renders a portal (`createPortal`) into `document.body` with a full-screen backdrop.

### Shape Catalog

The catalog is a hardcoded array of six entries (`SHAPES` constant, lines 74-111):

| Type | Label | Description | Icon |
|------|-------|-------------|------|
| `box` | Box | A solid rectangular cuboid with flat faces | Custom SVG (isometric wireframe) |
| `sphere` | Sphere | A perfect round ball with smooth surface | Custom SVG (circle with meridians) |
| `cylinder` | Cylinder | A tube shape with circular top and bottom | Custom SVG (ellipses + lines) |
| `torus` | Torus | A donut shape with a hole through the center | Custom SVG (nested ellipses) |
| `cone` | Cone | A pointed shape tapering from a circular base | Custom SVG (triangle + ellipse) |
| `capsule` | Capsule | A cylinder capped with hemispheres at both ends | Custom SVG (rounded rect) |

Each icon is a custom inline SVG component (44x44 viewBox) defined in the same file.

### Layout

The modal has two columns:

- **Left column**: A 3x2 grid of shape cards. Clicking a card selects it (highlighted with cyan border). Below the grid is an "Import 3D Model from PC" button.
- **Right column** (192px wide): A live 3D preview (`ThreeDShapePreview`) of the selected shape, the shape name and description, and an "Add to Canvas" button.

### ThreeDShapePreview

**File:** `src/3d/ThreeDShapePreview.tsx`

Creates a temporary `ThreeDEngine` in a small container (default 200x200, configurable via `size` prop). Adds the selected primitive, disables orbit controls, and runs a continuous camera orbit animation:

```typescript
const animate = () => {
  angleRef.current += 0.012;
  const r = 4;
  engine.setCameraPosition(
    { x: Math.sin(angleRef.current) * r, y: 1.5, z: Math.cos(angleRef.current) * r },
    { x: 0, y: 0, z: 0 }
  );
  engine.markDirty();
  rafRef.current = requestAnimationFrame(animate);
};
```

The camera orbits at a distance of 4 units, at a fixed height of 1.5 units, with an angular speed of 0.012 radians per frame.

When the `geometryType` prop changes, the entire engine is disposed and recreated with the new primitive.

### Model Import Flow

When the user clicks "Import 3D Model from PC":

1. A hidden file input is triggered.
2. The selected file is passed to `onImportModel(file)` and the picker closes.
3. The parent component handles the actual import via `engine.importModelFromFile(file)`.

### Keyboard

Pressing `Escape` closes the picker (event listener registered on mount, removed on cleanup).

---

## 15. Performance Guide

### WebGL Context Limit

Browsers enforce a hard limit on the number of simultaneous WebGL contexts (typically 8-16). Since each `ThreeDShapeElement` creates its own `WebGLRenderer` (and thus its own context), exceeding this limit causes the oldest context to be silently lost, resulting in blank or corrupted 3D viewports.

**Mitigation strategies:**

- Always call `dispose()` when deleting a 3D shape. This releases the WebGL context.
- Use `pause()` and `resume()` for shapes that go off-screen or are hidden. `pauseLoop()` sets `disposed = true` which stops the render loop, but note that it does **not** release the WebGL context — it only stops rendering. For true context release, `dispose()` must be called.
- Keep the total number of simultaneous 3D shapes manageable (under 8 is safe for all browsers).

### Dirty Flag Pattern

When adding new interactive features:

1. After any operation that changes the visual state of the scene, call `engine.markDirty()`.
2. Never call `renderer.render()` directly — let the render loop handle it.
3. The render loop runs `requestAnimationFrame` continuously but only calls `renderer.render()` when dirty is true, so marking dirty is cheap.

### Polygon Count Guidelines

- Simple primitives (box, sphere with 32 segments): ~1K-2K triangles. No concern.
- Imported models: Watch for models exceeding 100K triangles. Performance will degrade especially with multiple shapes on canvas.
- `ThreeDShapePreview` creates temporary engines — ensure they are disposed when the picker closes.

### Texture Memory

Texture memory is often the larger bottleneck compared to polygon count:

- A 2048x2048 RGBA texture uses ~16MB of GPU memory.
- A 4096x4096 texture uses ~64MB.
- Multiple texture maps on a single material multiply this cost.
- Use the texture cache (`textureCache` in MaterialSystem) to avoid loading duplicates.

### Pixel Ratio Cap

```typescript
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

This caps the pixel ratio at 2. On a 3x Retina display, rendering at 3x would mean 9x the pixels compared to 1x. The visual difference between 2x and 3x is negligible, but the GPU cost is significant. The cap ensures consistent performance across devices.

### Disposal Checklist

When removing a 3D object or destroying a shape:

1. **Geometries**: `geometry.dispose()` releases vertex buffer GPU memory.
2. **Materials**: `material.dispose()` releases shader programs.
3. **Textures**: `texture.dispose()` releases texture GPU memory.
4. **Renderer**: `renderer.dispose()` releases the WebGL context.

`SceneManager.removeObject()` handles items 1-2 automatically by traversing the mesh. Textures must be handled separately via `disposeTextureByUrl()`. The renderer is disposed by `ThreeDEngine.dispose()`.

### ThreeDShapePreview Performance

The preview component creates a full `ThreeDEngine` for a 152x152 viewport. It runs a continuous animation loop at 60fps. When the picker modal closes, the `useEffect` cleanup disposes the engine. If the preview is used in a scrollable list context, engines should be created only for visible items.

---

## 16. Keyboard Shortcuts Reference

| Key Combination | Mode | Action |
|----------------|------|--------|
| W | 3D Edit | Switch gizmo to Translate mode |
| E | 3D Edit | Switch gizmo to Rotate mode |
| R | 3D Edit | Switch gizmo to Scale mode |
| Escape | Shape Picker | Close the 3D shape picker modal |

Note: The W/E/R shortcuts are not implemented in the core 3D files. They are handled by the UI layer that wraps the `ThreeDPropertiesPanel` and calls `engine.setGizmoMode()`. The gizmo mode buttons in the properties panel provide the same functionality via click.

---

## 17. Troubleshooting

### Imported model shows as a cube instead of the actual model

**Cause:** The project was saved and reloaded. Imported models have `geometryType: 'imported'`, and `restoreScene()` skips imported objects because their binary mesh data is not stored in the snapshot. The fallback in `restoreFromConfig()` creates a box when it encounters an extruded type.

**Solution:** Re-import the model file after loading the project. The model binary data must be present at load time.

### Textures missing on imported GLB

**Cause:** GLB files are self-contained and should include textures. If textures appear missing, the model's materials may use features not supported by the import pipeline (e.g., KHR extensions). The current system does not modify imported model materials — it uses whatever the loader produces.

**Solution:** Open the model in a tool like [gltf.report](https://gltf.report/) to verify textures are embedded. Re-export from Blender with "Pack Resources" enabled.

### Shape disappears when deselected

**Cause:** This was the original bug that motivated the per-shape renderer architecture. In a shared-scene approach, deselecting one shape could affect others. With the current isolated architecture, this should not happen. If it does, check that `setInteracting(false)` is not accidentally calling `pause()` or `dispose()`.

**Solution:** Verify that `setInteracting(false)` only disables orbit and marks dirty. Check that `element.visible` is not being set to `false` when deselecting.

### Gizmo not appearing on selection

**Cause:** The gizmo is only attached when `selectObject(id)` is called with a valid ID and the mesh exists in the scene manager.

**Solution:** Ensure the shape is in 3D editing mode (`isInteracting === true`). Check that the click event successfully raycasts to a mesh (the mesh must have geometry with triangles that the raycaster can intersect).

### 3D canvas bleeding outside canvas boundary

**Cause:** The host `<div>` does not have `overflow: hidden`.

**Solution:** `ThreeDShapeRenderer.tsx` sets `overflow: 'hidden'` on the container div (line 79). `Canvas.tsx` also sets it on the outer positioning div. If bleeding occurs, verify both are present.

### ESC not working in shape picker

**Cause:** Another component may be capturing the keydown event before it reaches the picker's listener.

**Solution:** The picker registers its Escape handler on `window` with no capture option (line 119-123 of `ThreeDShapePicker.tsx`). Check for `stopPropagation()` calls in parent components.

### Properties panel not showing 3D tab on selection

**Cause:** The element's `type` field is not `'threed-shape'`, or the `getThreeDInstance` callback is not returning the instance for the selected element.

**Solution:** Verify the element was created with `type: 'threed-shape'`. Check that the instance registry correctly maps element IDs to `ThreeDShapeElement` instances.

### Performance drops with multiple 3D shapes

**Cause:** Each shape runs its own render loop. Even with the dirty flag optimization, multiple shapes with active orbit damping or continuous animations consume GPU resources.

**Solution:**
- Minimize the number of simultaneous 3D shapes.
- Use `pause()` for shapes not currently visible or being edited.
- Reduce renderer size for shapes that are small on canvas.
- Lower texture resolution.
- Reduce polygon counts on imported models.

---

## 18. Extending the System

### Adding a New Geometry Type

**Step 1:** Add the type to the `GeometryType` union in `src/3d/types.ts`:

```typescript
// Before
export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'cone' | 'capsule';

// After
export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'cone' | 'capsule' | 'octahedron';
```

**Step 2:** Add any new geometry-specific parameters to `GeometryConfig` in `src/3d/types.ts` and update `DEFAULT_GEOMETRY_CONFIG` with default values.

**Step 3:** Add a new `case` to `createPrimitiveGeometry()` in `src/3d/GeometryFactory.ts`:

```typescript
case 'octahedron':
  return new THREE.OctahedronGeometry(config.radius, config.segments);
```

**Step 4:** Add an entry to the `SHAPES` array in `src/3d/ThreeDShapePicker.tsx`:

```typescript
{
  type: 'octahedron',
  label: 'Octahedron',
  description: 'An eight-faced polyhedron.',
  icon: <ShapeIconOctahedron />,
},
```

Create the corresponding SVG icon component in the same file.

**Step 5:** Add geometry controls to the properties panel in `src/3d/ThreeDPropertiesPanel.tsx`. Inside the geometry section conditional block, add a new `geomType === 'octahedron'` branch with the appropriate controls.

**Step 6:** Update `SceneManager.updateGeometry()` in `src/3d/SceneManager.ts` — no changes needed unless the type needs special handling (it uses `createPrimitiveGeometry` which you already updated).

### Adding a New Material Property

**Step 1:** Add the property to the `MaterialConfig` interface in `src/3d/types.ts`:

```typescript
export interface MaterialConfig {
  // ... existing properties
  anisotropyStrength: number;  // new property
}
```

**Step 2:** Add a default value to `DEFAULT_MATERIAL_CONFIG` in the same file.

**Step 3:** Apply the property in `createMaterial()` in `src/3d/MaterialSystem.ts`. Add it to the appropriate material constructor (e.g., for Physical materials only):

```typescript
if (config.type === 'physical') {
  const physConfig = {
    // ... existing
    anisotropy: config.anisotropyStrength,
  };
}
```

**Step 4:** Add a UI control to `src/3d/ThreeDPropertiesPanel.tsx` in the appropriate section:

```tsx
<SliderRow
  label="Anisotropy"
  value={mat.anisotropyStrength}
  min={0} max={1} step={0.01}
  onChange={v => handleMaterial({ anisotropyStrength: v })}
/>
```

Place it inside the conditional block for the material type it applies to (e.g., `{isPhysical && (...)}`).

### Adding a New File Format

**Step 1:** Install the loader package if needed, or import from `three/examples/jsm/loaders/`.

**Step 2:** Add a lazy-initialized loader getter in `src/3d/ModelLoader.ts`:

```typescript
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';

let threeMFLoader: ThreeMFLoader | null = null;

function getThreeMFLoader(): ThreeMFLoader {
  if (!threeMFLoader) threeMFLoader = new ThreeMFLoader();
  return threeMFLoader;
}
```

**Step 3:** Add a `case` to the `switch` in `loadModel()`:

```typescript
case '3mf': {
  object = await getThreeMFLoader().loadAsync(url);
  break;
}
```

**Step 4:** Add the extension to `SUPPORTED_EXTENSIONS`:

```typescript
const SUPPORTED_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', '3mf'];
```

**Step 5:** Update the file input `accept` attribute in `src/3d/ThreeDShapePicker.tsx`:

```html
<input accept=".glb,.gltf,.obj,.fbx,.stl,.3mf" ... />
```

Also update the label text below the import button.

**Step 6:** If the format's loader returns geometry instead of a scene (like STL), wrap it in a `THREE.Mesh` with a default material before returning.
