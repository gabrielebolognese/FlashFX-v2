# Text Animation Feature - Implementation Plan

## Overview

This document outlines the complete implementation plan for adding comprehensive text animation capabilities to FlashFX. This feature will elevate text animations to a production-grade level, making them the most powerful feature in the application.

---

## Feature Requirements

### 1. Text FX Tab in Properties Panel

**Location**: `/src/components/layout/FXShortcutsTab.tsx`

**Current Structure**:
- Tabs: "All FX", "Favorites", "Presets" 
- Categories with expandable animation lists
- Each animation has: id, name, description, apply function

**New Addition**: "Text FX" Tab
- Add new tab button between "All FX" and "Favorites"
- Contains 34 text animations organized in 6 categories
- Each animation is listed (not fully functional yet)
- Same UI/UX pattern as existing FX tab

**Tab Structure**:
```typescript
const [activeTab, setActiveTab] = useState<'all' | 'textfx' | 'favorites' | 'presets'>('all');

// Tab buttons
<button onClick={() => setActiveTab('textfx')}>Text FX</button>
```

---

### 2. Text Animation Categories & Presets

**Category 1: Text Reveal / Writing** (7 animations)
1. **Typewriter** - Characters appear one by one with cursor blink
2. **Script Write** - Path based handwriting reveal
3. **Word Pop** - Words appear sequentially with micro scale up
4. **Line Reveal** - Lines appear from top to bottom with mask
5. **Mask Wipe** - Text revealed by directional clipping
6. **Fade In Order** - Opacity stagger per character or word
7. **Underline Write** - Line writes first, text follows

**Category 2: Motion In (Entry)** (7 animations)
8. **Slide In** - From left right up down with stagger
9. **Rise From Baseline** - Letters rise from baseline with overshoot
10. **Drop In** - Characters fall with gravity feel
11. **Scale Up** - Subtle zoom in with easing
12. **Elastic In** - Bounce overshoot then settle
13. **Flip In** - 3D flip around X or Y axis
14. **Split Reveal** - Text splits from center outward

**Category 3: Motion Out (Exit)** (5 animations)
15. **Slide Out** - Directional exit
16. **Fade Out Order** - Reverse stagger fade
17. **Collapse** - Text scales down to center
18. **Explode** - Characters scatter outward
19. **Sink** - Text falls below baseline

**Category 4: Emphasis / Loop** (5 animations)
20. **Pulse** - Soft scale and opacity loop
21. **Wiggle** - Micro random position and rotation
22. **Bounce** - Vertical bounce emphasis
23. **Shake** - Horizontal jitter
24. **Glow Pulse** - Glow intensity oscillates

**Category 5: Transform / Structural** (4 animations)
25. **Morph In** - Letters morph from lines or blocks
26. **Stretch In** - Text stretches then snaps back
27. **Skew Snap** - Skew in then straighten
28. **Perspective Push** - Z axis push toward camera

**Category 6: Premium / Advanced** (6 animations)
29. **Kinetic Flow** - Characters follow curved motion path
30. **Wave Write** - Writing head moves in wave pattern
31. **Fragment Assemble** - Text assembles from shards
32. **Neon Draw** - Stroke draw with glow trail
33. **Glitch In** - Digital glitch then settle
34. **Magnetic Align** - Characters snap into place from chaos

---

### 3. Animation Data Structure

Each text animation follows this pattern:

```typescript
interface TextAnimationPreset {
  id: string;
  name: string;
  description: string;
  category: 'reveal' | 'motion-in' | 'motion-out' | 'emphasis' | 'transform' | 'premium';
  // For now, apply function is placeholder - actual implementation comes later
  apply: (
    element: DesignElement,
    startTime: number,
    duration: number,
    addKeyframe: (elementId: string, property: AnimatableProperty, time: number, value: number | string, easing?: EasingType) => void,
    initAnimation: (elementId: string) => void
  ) => void;
}

interface TextAnimationCategory {
  id: string;
  name: string;
  icon?: string;
  animations: TextAnimationPreset[];
}
```

---

### 4. Motion Control Subtab (Coming Soon)

**Location**: `/src/components/design-tool/AdvancedTextSettingsPanel.tsx`

**Current Structure**:
- Header: "Advanced Text Settings" with "Basic Mode" button
- Collapsible sections: Typography, Fill & Color, Texture Fill, etc.
- Last section: "Advanced Features (Coming Soon)"

**New Addition**: Subtab System at Top
- Add tab bar below the header
- Tabs: "Styling" (default/active), "Motion Control" (disabled)
- All current content goes under "Styling" tab
- "Motion Control" tab shows "Coming Soon" message

**UI Structure**:
```tsx
<div className="flex items-center justify-between p-3 border-b border-gray-700">
  <h3>Advanced Text Settings</h3>
  <button>Basic Mode</button>
</div>

{/* NEW: Subtab System */}
<div className="border-b border-gray-700/50">
  <div className="flex">
    <button className="active">Styling</button>
    <button disabled>Motion Control</button>
  </div>
</div>

{/* Current content (under Styling tab) */}
<div className="flex-1 overflow-y-auto p-3">
  {/* All existing sections */}
</div>
```

**Motion Control Tab Content** (when enabled in future):
```tsx
<div className="p-3 bg-gray-800/50">
  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded">
    <Info className="w-5 h-5 text-blue-400 mb-2" />
    <p className="text-sm text-blue-300 font-medium">Motion Control (Coming Soon)</p>
    <p className="text-xs text-blue-300/70 mt-1">
      This section will allow you to fine-tune text animation parameters, 
      timing curves, per-character controls, and motion path editing.
    </p>
  </div>
</div>
```

---

## Implementation Steps

### Step 1: Modify FXShortcutsTab.tsx

**Changes Required**:

1. **Update activeTab state**:
```typescript
const [activeTab, setActiveTab] = useState<'all' | 'textfx' | 'favorites' | 'presets'>('all');
```

2. **Add Text FX tab button**:
```typescript
<button
  onClick={() => setActiveTab('textfx')}
  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
    activeTab === 'textfx'
      ? 'bg-gray-700/50 text-yellow-400 border-b-2 border-yellow-400'
      : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
  }`}
>
  Text FX
</button>
```

3. **Create textAnimationCategories array** (after existing categories):
```typescript
const textAnimationCategories: AnimationCategory[] = [
  {
    id: 'text-reveal',
    name: 'Text Reveal / Writing',
    animations: [
      {
        id: 'typewriter',
        name: 'Typewriter',
        description: 'Characters appear one by one with cursor blink',
        apply: (el, start, dur, addKf) => {
          // Placeholder - actual implementation later
          console.log('Typewriter animation - coming soon');
        }
      },
      // ... rest of reveal animations
    ]
  },
  // ... rest of categories
];
```

4. **Update render logic** to show Text FX content:
```typescript
{activeTab === 'textfx' ? (
  <div className="p-2 space-y-1">
    {textAnimationCategories.map((category) => {
      const isExpanded = expandedCategories.has(category.id);
      return (
        <div key={category.id} className="border border-gray-700/50 rounded-lg overflow-hidden">
          {/* Same category structure as existing FX */}
        </div>
      );
    })}
  </div>
) : activeTab === 'favorites' ? (
  // ... existing favorites logic
) : (
  // ... existing all FX logic
)}
```

### Step 2: Modify AdvancedTextSettingsPanel.tsx

**Changes Required**:

1. **Add subtab state**:
```typescript
const [activeSubtab, setActiveSubtab] = useState<'styling' | 'motion'>('styling');
```

2. **Add subtab bar** (after header, before content):
```typescript
<div className="border-b border-gray-700/50">
  <div className="flex">
    <button
      onClick={() => setActiveSubtab('styling')}
      className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
        activeSubtab === 'styling'
          ? 'bg-gray-700/50 text-blue-400 border-b-2 border-blue-400'
          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
      }`}
    >
      Styling
    </button>
    <button
      disabled
      className="flex-1 px-4 py-2 text-xs font-medium text-gray-600 cursor-not-allowed"
      title="Coming soon"
    >
      Motion Control
    </button>
  </div>
</div>
```

3. **Wrap existing content** in conditional render:
```typescript
{activeSubtab === 'styling' ? (
  <div className="space-y-2 text-sm">
    {/* All existing sections */}
  </div>
) : (
  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded">
    <Info className="w-5 h-5 text-blue-400 mb-2" />
    <p className="text-sm text-blue-300 font-medium">Motion Control (Coming Soon)</p>
    <p className="text-xs text-blue-300/70 mt-1">
      Fine-tune text animation parameters, timing curves, and motion paths.
    </p>
  </div>
)}
```

---

## Complete Text Animation Definitions

```typescript
const textAnimationCategories: AnimationCategory[] = [
  {
    id: 'text-reveal',
    name: 'Text Reveal / Writing',
    animations: [
      { id: 'typewriter', name: 'Typewriter', description: 'Characters appear one by one with cursor blink', apply: placeholderApply },
      { id: 'script-write', name: 'Script Write', description: 'Path based handwriting reveal', apply: placeholderApply },
      { id: 'word-pop', name: 'Word Pop', description: 'Words appear sequentially with micro scale up', apply: placeholderApply },
      { id: 'line-reveal', name: 'Line Reveal', description: 'Lines appear from top to bottom with mask', apply: placeholderApply },
      { id: 'mask-wipe', name: 'Mask Wipe', description: 'Text revealed by directional clipping', apply: placeholderApply },
      { id: 'fade-in-order', name: 'Fade In Order', description: 'Opacity stagger per character or word', apply: placeholderApply },
      { id: 'underline-write', name: 'Underline Write', description: 'Line writes first, text follows', apply: placeholderApply }
    ]
  },
  {
    id: 'motion-in',
    name: 'Motion In (Entry)',
    animations: [
      { id: 'slide-in-text', name: 'Slide In', description: 'From left right up down with stagger', apply: placeholderApply },
      { id: 'rise-baseline', name: 'Rise From Baseline', description: 'Letters rise from baseline with overshoot', apply: placeholderApply },
      { id: 'drop-in', name: 'Drop In', description: 'Characters fall with gravity feel', apply: placeholderApply },
      { id: 'scale-up-text', name: 'Scale Up', description: 'Subtle zoom in with easing', apply: placeholderApply },
      { id: 'elastic-in', name: 'Elastic In', description: 'Bounce overshoot then settle', apply: placeholderApply },
      { id: 'flip-in', name: 'Flip In', description: '3D flip around X or Y axis', apply: placeholderApply },
      { id: 'split-reveal', name: 'Split Reveal', description: 'Text splits from center outward', apply: placeholderApply }
    ]
  },
  {
    id: 'motion-out',
    name: 'Motion Out (Exit)',
    animations: [
      { id: 'slide-out-text', name: 'Slide Out', description: 'Directional exit', apply: placeholderApply },
      { id: 'fade-out-order', name: 'Fade Out Order', description: 'Reverse stagger fade', apply: placeholderApply },
      { id: 'collapse-text', name: 'Collapse', description: 'Text scales down to center', apply: placeholderApply },
      { id: 'explode', name: 'Explode', description: 'Characters scatter outward', apply: placeholderApply },
      { id: 'sink', name: 'Sink', description: 'Text falls below baseline', apply: placeholderApply }
    ]
  },
  {
    id: 'emphasis',
    name: 'Emphasis / Loop',
    animations: [
      { id: 'pulse-text', name: 'Pulse', description: 'Soft scale and opacity loop', apply: placeholderApply },
      { id: 'wiggle', name: 'Wiggle', description: 'Micro random position and rotation', apply: placeholderApply },
      { id: 'bounce-text', name: 'Bounce', description: 'Vertical bounce emphasis', apply: placeholderApply },
      { id: 'shake-text', name: 'Shake', description: 'Horizontal jitter', apply: placeholderApply },
      { id: 'glow-pulse', name: 'Glow Pulse', description: 'Glow intensity oscillates', apply: placeholderApply }
    ]
  },
  {
    id: 'transform',
    name: 'Transform / Structural',
    animations: [
      { id: 'morph-in', name: 'Morph In', description: 'Letters morph from lines or blocks', apply: placeholderApply },
      { id: 'stretch-in', name: 'Stretch In', description: 'Text stretches then snaps back', apply: placeholderApply },
      { id: 'skew-snap', name: 'Skew Snap', description: 'Skew in then straighten', apply: placeholderApply },
      { id: 'perspective-push', name: 'Perspective Push', description: 'Z axis push toward camera', apply: placeholderApply }
    ]
  },
  {
    id: 'premium',
    name: 'Premium / Advanced',
    animations: [
      { id: 'kinetic-flow', name: 'Kinetic Flow', description: 'Characters follow curved motion path', apply: placeholderApply },
      { id: 'wave-write', name: 'Wave Write', description: 'Writing head moves in wave pattern', apply: placeholderApply },
      { id: 'fragment-assemble', name: 'Fragment Assemble', description: 'Text assembles from shards', apply: placeholderApply },
      { id: 'neon-draw', name: 'Neon Draw', description: 'Stroke draw with glow trail', apply: placeholderApply },
      { id: 'glitch-in', name: 'Glitch In', description: 'Digital glitch then settle', apply: placeholderApply },
      { id: 'magnetic-align', name: 'Magnetic Align', description: 'Characters snap into place from chaos', apply: placeholderApply }
    ]
  }
];

const placeholderApply = (el: DesignElement, start: number, dur: number, addKf: any, initAnim: any) => {
  console.log('Text animation - implementation coming soon');
  // TODO: Implement actual character-by-character animation logic
};
```

---

## Files to Modify

### 1. `/src/components/layout/FXShortcutsTab.tsx`
- Add 'textfx' to activeTab type
- Add Text FX tab button
- Add textAnimationCategories array
- Add conditional render for Text FX tab content
- Estimated lines added: ~400

### 2. `/src/components/design-tool/AdvancedTextSettingsPanel.tsx`
- Add activeSubtab state
- Add subtab bar component
- Wrap existing content in conditional
- Add Motion Control "coming soon" placeholder
- Estimated lines added: ~50

---

## Testing Checklist

### Text FX Tab
- [ ] Text FX tab button appears between "All FX" and "Favorites"
- [ ] Clicking Text FX tab shows text animation categories
- [ ] All 6 categories are visible
- [ ] Each category shows correct number of animations:
  - Text Reveal / Writing: 7
  - Motion In (Entry): 7
  - Motion Out (Exit): 5
  - Emphasis / Loop: 5
  - Transform / Structural: 4
  - Premium / Advanced: 6
- [ ] Categories expand/collapse correctly
- [ ] Animation names and descriptions are correct
- [ ] Clicking animation shows console log (placeholder)
- [ ] Favorites system works with text animations
- [ ] Only text elements show these animations

### Motion Control Subtab
- [ ] Advanced Text Settings panel shows subtab bar
- [ ] "Styling" tab is active by default
- [ ] "Motion Control" tab is disabled (grayed out)
- [ ] Hovering "Motion Control" shows tooltip "Coming soon"
- [ ] All existing sections appear under "Styling" tab
- [ ] No functionality is broken

---

## Future Implementation Notes

### Phase 2: Actual Animation Implementation
When implementing the actual animations, each will need:

1. **Character-level control** - Split text into individual characters
2. **Stagger timing** - Sequential animation with delay between characters
3. **Property keyframes** - opacity, position, scale, rotation per character
4. **Easing curves** - Different easing per animation type
5. **Path following** - For advanced animations (wave, kinetic flow)
6. **Particle effects** - For fragment, explode animations
7. **Canvas rendering** - For glow, neon, glitch effects

### Phase 3: Motion Control Implementation
When building Motion Control subtab:

1. **Animation Timeline** - Visual timeline showing character animation
2. **Curve Editor** - Bezier curve editor for custom easing
3. **Per-Character Controls** - Select individual characters to adjust timing
4. **Motion Path Editor** - Draw custom paths for text to follow
5. **Advanced Parameters**:
   - Stagger delay (ms between characters)
   - Direction (left-to-right, right-to-left, center-out, random)
   - Overshoot amount
   - Randomness/chaos factor
   - Spring physics parameters

---

## Design Decisions

### Why Placeholder Functions?
- Focus on UI/UX first
- Text animations require character-level rendering
- Need canvas or SVG implementation
- Allows user to see available animations
- Can add actual implementation incrementally

### Why Separate "Text FX" Tab?
- Text animations are fundamentally different from element animations
- Character-level vs element-level control
- Different parameter sets
- Clearer organization
- Room for text-specific features

### Why Motion Control as Subtab?
- Keeps Advanced Text Settings organized
- Styling vs Animation controls are conceptually different
- Allows future expansion of each subtab
- Prevents overwhelming single screen
- Professional video editor pattern

---

## Success Criteria

### Minimum Viable Product (MVP)
- ✅ Text FX tab visible and functional
- ✅ All 34 animations listed correctly
- ✅ Categories expand/collapse
- ✅ Motion Control subtab exists (disabled)
- ✅ No existing functionality broken
- ✅ Consistent UI/UX with existing features

### Phase 2 (Actual Implementation)
- ⏳ At least 10 animations fully functional
- ⏳ Character-level animation working
- ⏳ Stagger timing system implemented
- ⏳ Preview in timeline

### Phase 3 (Motion Control)
- ⏳ Motion Control subtab enabled
- ⏳ Parameter controls functional
- ⏳ Timeline editor implemented
- ⏳ Motion path editor working

---

## Conclusion

This implementation creates the foundation for professional-grade text animation in FlashFX. The modular approach allows:

1. **Immediate value** - Users see what's possible
2. **Incremental development** - Implement animations one by one
3. **User feedback** - Learn which animations are most wanted
4. **Quality focus** - Build each animation properly
5. **Future expansion** - Motion Control for advanced users

The text animation system will be **the most powerful feature** in FlashFX, setting it apart from competitors and providing professional-grade capabilities for motion designers.
