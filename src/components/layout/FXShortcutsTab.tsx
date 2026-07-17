import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Star, Plus, Trash2, ChevronUp } from 'lucide-react';
import { DesignElement, TextAnimatorLayer } from '../../types/design';
import { useAnimation } from '../../animation-engine/AnimationContext';
import { AnimatableProperty, EasingType, EASING_CONFIGS } from '../../animation-engine/types';
import { v4 as uuidv4 } from 'uuid';
import { animationDefaultsService } from '../../services/AnimationDefaultsService';
import { usePlaybackStore } from '../../store/playbackStore';

interface FXShortcutsTabProps {
  selectedElements: DesignElement[];
  onUpdateElement?: (id: string, updates: Partial<DesignElement>) => void;
}

interface AnimationPreset {
  id: string;
  name: string;
  description: string;
  apply: (
    element: DesignElement,
    startTime: number,
    duration: number,
    addKeyframe: (elementId: string, property: AnimatableProperty, time: number, value: number | string, easing?: EasingType) => void,
    initAnimation: (elementId: string) => void
  ) => void;
}

interface AnimationCategory {
  id: string;
  name: string;
  animations: AnimationPreset[];
}

// ─── TextAnimator Preset Factories ──────────────────────────────────────────

function makeLayer(overrides: Partial<TextAnimatorLayer>): TextAnimatorLayer {
  return {
    id: uuidv4(),
    targetType: 'characters',
    property: 'opacity',
    amount: 0,
    startTime: 0,
    duration: 0.3,
    stagger: 0.05,
    easing: 'ease-out',
    direction: 'forward',
    ...overrides,
  };
}

interface TextAnimatorPreset {
  id: string;
  name: string;
  build: () => TextAnimatorLayer[];
}

const TEXT_ANIMATOR_PRESETS: TextAnimatorPreset[] = [
  {
    id: 'typewriter',
    name: 'Typewriter',
    build: () => [makeLayer({ targetType: 'characters', property: 'opacity', amount: 0, duration: 0.08, stagger: 0.05, easing: 'linear', direction: 'forward' })],
  },
  {
    id: 'slide-up',
    name: 'Slide Up',
    build: () => [
      makeLayer({ targetType: 'characters', property: 'position', amount: 20, axis: 'y', duration: 0.3, stagger: 0.04, easing: 'ease-out', direction: 'forward' }),
      makeLayer({ targetType: 'characters', property: 'opacity', amount: 0, duration: 0.3, stagger: 0.04, easing: 'ease-out', direction: 'forward' }),
    ],
  },
  {
    id: 'line-reveal',
    name: 'Line Reveal',
    build: () => [makeLayer({ targetType: 'lines', property: 'maskHeight', amount: 0, duration: 0.4, stagger: 0.12, easing: 'ease-in-out', direction: 'forward' })],
  },
  {
    id: 'fade-in-words',
    name: 'Fade In Words',
    build: () => [makeLayer({ targetType: 'words', property: 'opacity', amount: 0, duration: 0.35, stagger: 0.08, easing: 'ease-in-out', direction: 'forward' })],
  },
  {
    id: 'scale-in',
    name: 'Scale In',
    build: () => [
      makeLayer({ targetType: 'characters', property: 'scale', amount: 0, duration: 0.25, stagger: 0.03, easing: 'ease-out', direction: 'center' }),
      makeLayer({ targetType: 'characters', property: 'opacity', amount: 0, duration: 0.25, stagger: 0.03, easing: 'ease-out', direction: 'center' }),
    ],
  },
  {
    id: 'blur-in',
    name: 'Blur In',
    build: () => [
      makeLayer({ targetType: 'words', property: 'blur', amount: 8, duration: 0.35, stagger: 0.06, easing: 'ease-out', direction: 'forward' }),
      makeLayer({ targetType: 'words', property: 'opacity', amount: 0, duration: 0.35, stagger: 0.06, easing: 'ease-out', direction: 'forward' }),
    ],
  },
];

const PROPERTY_LABELS: Record<TextAnimatorLayer['property'], string> = {
  opacity: 'Opacity',
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  skew: 'Skew',
  blur: 'Blur',
  maskWidth: 'Mask Width',
  maskHeight: 'Mask Height',
};

const TARGET_LABELS: Record<TextAnimatorLayer['targetType'], string> = {
  characters: 'Characters',
  words: 'Words',
  lines: 'Lines',
};

const FXShortcutsTab: React.FC<FXShortcutsTabProps> = ({ selectedElements, onUpdateElement }) => {
  const [duration, setDuration] = useState(0.5);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['scale']));
  const [activeTab, setActiveTab] = useState<'all' | 'textfx' | 'favorites' | 'presets'>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [expandedAnimLayers, setExpandedAnimLayers] = useState<Set<string>>(new Set());
  const { addKeyframe, initAnimation } = useAnimation();
  const currentTime = usePlaybackStore((s) => s.currentTime);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem('animationFavorites');
      if (stored) {
        const favoriteIds = JSON.parse(stored) as string[];
        setFavorites(new Set(favoriteIds));
      }
    } catch (error) {
      console.error('Error loading favorites from localStorage:', error);
    }
  };

  const saveFavorites = (favoriteSet: Set<string>) => {
    try {
      const favoriteIds = Array.from(favoriteSet);
      localStorage.setItem('animationFavorites', JSON.stringify(favoriteIds));
    } catch (error) {
      console.error('Error saving favorites to localStorage:', error);
    }
  };

  const toggleFavorite = (animationId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(animationId)) {
        newSet.delete(animationId);
      } else {
        newSet.add(animationId);
      }
      saveFavorites(newSet);
      return newSet;
    });
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const applyAnimation = (preset: AnimationPreset) => {
    if (selectedElements.length === 0) return;
    const defaults = animationDefaultsService.getTiming(preset.id);
    const effectiveDuration = defaults.duration ?? duration;

    selectedElements.forEach(element => {
      initAnimation(element.id);
      preset.apply(element, currentTime, effectiveDuration, addKeyframe, initAnimation);
    });
  };

  const textEl = selectedElements.length === 1 && selectedElements[0].type === 'text'
    ? selectedElements[0]
    : null;

  const applyAnimatorPreset = (preset: TextAnimatorPreset) => {
    if (!textEl || !onUpdateElement) return;
    const existing = textEl.animatorLayers || [];
    if (existing.length > 0 && !window.confirm(`Replace all ${existing.length} existing animator layer(s) with "${preset.name}"?`)) return;
    const builtLayers = preset.build();
    const layers = builtLayers.map((layer, i) => {
      const saved = animationDefaultsService.getTextLayer(preset.id, i);
      return {
        ...layer,
        duration: saved.duration,
        stagger: saved.stagger,
        easing: saved.easing,
        direction: saved.direction,
      };
    });
    onUpdateElement(textEl.id, { animatorLayers: layers, masking: layers.some(l => l.property === 'maskWidth' || l.property === 'maskHeight') });
  };

  const addAnimatorLayer = () => {
    if (!textEl || !onUpdateElement) return;
    const newLayer = makeLayer({});
    const layers = [...(textEl.animatorLayers || []), newLayer];
    onUpdateElement(textEl.id, { animatorLayers: layers });
    setExpandedAnimLayers(prev => new Set([...prev, newLayer.id]));
  };

  const removeAnimatorLayer = (layerId: string) => {
    if (!textEl || !onUpdateElement) return;
    const layers = (textEl.animatorLayers || []).filter(l => l.id !== layerId);
    const hasMask = layers.some(l => l.property === 'maskWidth' || l.property === 'maskHeight');
    onUpdateElement(textEl.id, { animatorLayers: layers, masking: hasMask });
  };

  const updateAnimatorLayer = (layerId: string, updates: Partial<TextAnimatorLayer>) => {
    if (!textEl || !onUpdateElement) return;
    const layers = (textEl.animatorLayers || []).map(l => l.id === layerId ? { ...l, ...updates } : l);
    const hasMask = layers.some(l => l.property === 'maskWidth' || l.property === 'maskHeight');
    onUpdateElement(textEl.id, { animatorLayers: layers, masking: hasMask });
  };

  const toggleAnimLayer = (layerId: string) => {
    setExpandedAnimLayers(prev => {
      const s = new Set(prev);
      s.has(layerId) ? s.delete(layerId) : s.add(layerId);
      return s;
    });
  };

  const categories: AnimationCategory[] = [
    {
      id: 'scale',
      name: 'Scale / Visibility',
      animations: [
        {
          id: 'collapse',
          name: 'Collapse',
          description: 'Scale to 0',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'width', start, el.width);
            addKf(el.id, 'height', start, el.height);
            addKf(el.id, 'width', start + dur, 1);
            addKf(el.id, 'height', start + dur, 1);
          }
        },
        {
          id: 'expand',
          name: 'Expand',
          description: 'Scale from 0 to normal',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'width', start, 1);
            addKf(el.id, 'height', start, 1);
            addKf(el.id, 'width', start + dur, el.width);
            addKf(el.id, 'height', start + dur, el.height);
          }
        },
        {
          id: 'pop-in',
          name: 'Pop In',
          description: '0.7 → 1.05 → 1.0',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w * 0.7);
            addKf(el.id, 'height', start, h * 0.7);
            addKf(el.id, 'width', start + dur * 0.7, w * 1.05);
            addKf(el.id, 'height', start + dur * 0.7, h * 1.05);
            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
          }
        },
        {
          id: 'pop-out',
          name: 'Pop Out',
          description: '1.0 → 1.1 → 0',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'width', start + dur * 0.5, w * 1.1);
            addKf(el.id, 'height', start + dur * 0.5, h * 1.1);
            addKf(el.id, 'width', start + dur, 0);
            addKf(el.id, 'height', start + dur, 0);
          }
        },
        {
          id: 'pulse',
          name: 'Pulse',
          description: '1.0 → 1.08 → 1.0',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'width', start + dur * 0.5, w * 1.08);
            addKf(el.id, 'height', start + dur * 0.5, h * 1.08);
            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
          }
        },
        {
          id: 'breath',
          name: 'Breath',
          description: '0.95 ↔ 1.0 loop',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w * 0.95);
            addKf(el.id, 'height', start, h * 0.95);
            addKf(el.id, 'width', start + dur * 0.5, w);
            addKf(el.id, 'height', start + dur * 0.5, h);
            addKf(el.id, 'width', start + dur, w * 0.95);
            addKf(el.id, 'height', start + dur, h * 0.95);
          }
        }
      ]
    },
    {
      id: 'position',
      name: 'Position / Movement',
      animations: [
        {
          id: 'slide-in-left',
          name: 'Slide In Left',
          description: 'From left offscreen',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, -el.width - 100);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'slide-in-right',
          name: 'Slide In Right',
          description: 'From right offscreen',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, 4000);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'slide-in-top',
          name: 'Slide In Top',
          description: 'From top offscreen',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, -el.height - 100);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'slide-in-bottom',
          name: 'Slide In Bottom',
          description: 'From bottom offscreen',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, 2260);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'slide-out-left',
          name: 'Slide Out Left',
          description: 'Exit to left',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur, -el.width - 100);
          }
        },
        {
          id: 'slide-out-right',
          name: 'Slide Out Right',
          description: 'Exit to right',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur, 4000);
          }
        },
        {
          id: 'slide-out-top',
          name: 'Slide Out Top',
          description: 'Exit to top',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur, -el.height - 100);
          }
        },
        {
          id: 'slide-out-bottom',
          name: 'Slide Out Bottom',
          description: 'Exit to bottom',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur, 2260);
          }
        },
        {
          id: 'nudge-left',
          name: 'Nudge Left',
          description: 'Small move left and back',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur * 0.5, el.x - 20);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'nudge-right',
          name: 'Nudge Right',
          description: 'Small move right and back',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur * 0.5, el.x + 20);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'nudge-up',
          name: 'Nudge Up',
          description: 'Small move up and back',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur * 0.5, el.y - 20);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'nudge-down',
          name: 'Nudge Down',
          description: 'Small move down and back',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur * 0.5, el.y + 20);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'snap-back',
          name: 'Snap Back',
          description: 'Return to original position',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'x', start + dur, el.x);
            addKf(el.id, 'y', start + dur, el.y);
          }
        }
      ]
    },
    {
      id: 'opacity',
      name: 'Opacity',
      animations: [
        {
          id: 'fade-in',
          name: 'Fade In',
          description: 'Opacity 0 → 1',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'opacity', start, 0);
            addKf(el.id, 'opacity', start + dur, el.opacity || 1);
          }
        },
        {
          id: 'fade-out',
          name: 'Fade Out',
          description: 'Opacity → 0',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'opacity', start, el.opacity || 1);
            addKf(el.id, 'opacity', start + dur, 0);
          }
        },
        {
          id: 'flash',
          name: 'Flash',
          description: '1 → 0 → 1',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'opacity', start, 1);
            addKf(el.id, 'opacity', start + dur * 0.5, 0);
            addKf(el.id, 'opacity', start + dur, 1);
          }
        },
        {
          id: 'blink',
          name: 'Blink',
          description: '1 ↔ 0 loop',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'opacity', start, 1);
            addKf(el.id, 'opacity', start + dur * 0.5, 0);
            addKf(el.id, 'opacity', start + dur, 1);
          }
        }
      ]
    },
    {
      id: 'rotation',
      name: 'Rotation',
      animations: [
        {
          id: 'twist-in',
          name: 'Twist In',
          description: '-15° → 0°',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'rotation', start, -15);
            addKf(el.id, 'rotation', start + dur, el.rotation || 0);
          }
        },
        {
          id: 'twist-out',
          name: 'Twist Out',
          description: '→ +15°',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'rotation', start, el.rotation || 0);
            addKf(el.id, 'rotation', start + dur, 15);
          }
        },
        {
          id: 'spin-in',
          name: 'Spin In',
          description: '-180° → 0°',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'rotation', start, -180);
            addKf(el.id, 'rotation', start + dur, el.rotation || 0);
          }
        },
        {
          id: 'spin-out',
          name: 'Spin Out',
          description: '→ +180°',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'rotation', start, el.rotation || 0);
            addKf(el.id, 'rotation', start + dur, 180);
          }
        },
        {
          id: 'wobble',
          name: 'Wobble',
          description: '-6° → +6° → -4° → 0°',
          apply: (el, start, dur, addKf) => {
            const base = el.rotation || 0;
            addKf(el.id, 'rotation', start, base);
            addKf(el.id, 'rotation', start + dur * 0.25, base - 6);
            addKf(el.id, 'rotation', start + dur * 0.5, base + 6);
            addKf(el.id, 'rotation', start + dur * 0.75, base - 4);
            addKf(el.id, 'rotation', start + dur, base);
          }
        }
      ]
    },
    {
      id: 'overshoot',
      name: 'Overshoot / Energy',
      animations: [
        {
          id: 'bounce-in',
          name: 'Bounce In',
          description: 'Overshoot → settle',
          apply: (el, start, dur, addKf) => {
            const x = el.x;
            addKf(el.id, 'x', start, x - 100);
            addKf(el.id, 'x', start + dur * 0.7, x + 20, 'ease-out-back');
            addKf(el.id, 'x', start + dur, x);
          }
        },
        {
          id: 'bounce-out',
          name: 'Bounce Out',
          description: 'Forward → exit',
          apply: (el, start, dur, addKf) => {
            const x = el.x;
            addKf(el.id, 'x', start, x);
            addKf(el.id, 'x', start + dur * 0.3, x - 20);
            addKf(el.id, 'x', start + dur, x + 200, 'ease-out-back');
          }
        },
        {
          id: 'overshoot-scale',
          name: 'Overshoot Scale',
          description: '0.9 → 1.1 → 1.0',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w * 0.9);
            addKf(el.id, 'height', start, h * 0.9);
            addKf(el.id, 'width', start + dur * 0.6, w * 1.1, 'ease-out-back');
            addKf(el.id, 'height', start + dur * 0.6, h * 1.1, 'ease-out-back');
            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
          }
        },
        {
          id: 'snap',
          name: 'Snap',
          description: 'Quick easing change',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur, el.x, 'ease-out-elastic');
          }
        }
      ]
    },
    {
      id: 'attention',
      name: 'Attention / Shake',
      animations: [
        {
          id: 'point-left',
          name: 'Point Left',
          description: 'Move left and return',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur * 0.5, el.x - 30);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'point-right',
          name: 'Point Right',
          description: 'Move right and return',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur * 0.5, el.x + 30);
            addKf(el.id, 'x', start + dur, el.x);
          }
        },
        {
          id: 'point-up',
          name: 'Point Up',
          description: 'Move up and return',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur * 0.5, el.y - 30);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'point-down',
          name: 'Point Down',
          description: 'Move down and return',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'y', start + dur * 0.5, el.y + 30);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'shake-x',
          name: 'Shake X',
          description: 'Horizontal shake',
          apply: (el, start, dur, addKf) => {
            const x = el.x;
            addKf(el.id, 'x', start, x);
            addKf(el.id, 'x', start + dur * 0.2, x - 8);
            addKf(el.id, 'x', start + dur * 0.4, x + 8);
            addKf(el.id, 'x', start + dur * 0.6, x - 6);
            addKf(el.id, 'x', start + dur * 0.8, x + 6);
            addKf(el.id, 'x', start + dur, x);
          }
        },
        {
          id: 'shake-y',
          name: 'Shake Y',
          description: 'Vertical shake',
          apply: (el, start, dur, addKf) => {
            const y = el.y;
            addKf(el.id, 'y', start, y);
            addKf(el.id, 'y', start + dur * 0.2, y - 8);
            addKf(el.id, 'y', start + dur * 0.4, y + 8);
            addKf(el.id, 'y', start + dur * 0.6, y - 6);
            addKf(el.id, 'y', start + dur * 0.8, y + 6);
            addKf(el.id, 'y', start + dur, y);
          }
        }
      ]
    },
    {
      id: 'shape-specific',
      name: 'Shape-Specific',
      animations: [
        {
          id: 'grow-width',
          name: 'Grow Width',
          description: 'Width 0 → full',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'width', start, 0);
            addKf(el.id, 'width', start + dur, el.width);
          }
        },
        {
          id: 'grow-height',
          name: 'Grow Height',
          description: 'Height 0 → full',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'height', start, 0);
            addKf(el.id, 'height', start + dur, el.height);
          }
        },
        {
          id: 'center-expand',
          name: 'Center Expand',
          description: 'Expand from center',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            const cx = el.x + w / 2;
            const cy = el.y + h / 2;

            addKf(el.id, 'width', start, 0);
            addKf(el.id, 'height', start, 0);
            addKf(el.id, 'x', start, cx);
            addKf(el.id, 'y', start, cy);

            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
            addKf(el.id, 'x', start + dur, el.x);
            addKf(el.id, 'y', start + dur, el.y);
          }
        },
        {
          id: 'edge-expand',
          name: 'Edge Expand',
          description: 'Expand from edge',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'width', start, 0);
            addKf(el.id, 'height', start, 0);
            addKf(el.id, 'width', start + dur, el.width);
            addKf(el.id, 'height', start + dur, el.height);
          }
        }
      ]
    },
    {
      id: 'camera',
      name: 'Camera / Global',
      animations: [
        {
          id: 'zoom-focus',
          name: 'Zoom Focus',
          description: 'Scale up + shift',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'y', start, el.y);
            addKf(el.id, 'width', start + dur, w * 1.2);
            addKf(el.id, 'height', start + dur, h * 1.2);
            addKf(el.id, 'x', start + dur, el.x - 10);
            addKf(el.id, 'y', start + dur, el.y - 10);
          }
        },
        {
          id: 'zoom-out',
          name: 'Zoom Out',
          description: 'Scale down + fade',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'opacity', start, el.opacity || 1);
            addKf(el.id, 'width', start + dur, w * 0.8);
            addKf(el.id, 'height', start + dur, h * 0.8);
            addKf(el.id, 'opacity', start + dur, (el.opacity || 1) * 0.5);
          }
        }
      ]
    },
    {
      id: 'timing',
      name: 'Timing Macros',
      animations: [
        {
          id: 'fast-in',
          name: 'Fast In',
          description: 'Quick ease-in',
          apply: (el, start, dur, addKf) => {
            const shortDur = dur * 0.3;
            addKf(el.id, 'x', start, el.x - 50);
            addKf(el.id, 'x', start + shortDur, el.x, 'ease-in-cubic');
          }
        },
        {
          id: 'fast-out',
          name: 'Fast Out',
          description: 'Quick ease-out',
          apply: (el, start, dur, addKf) => {
            const shortDur = dur * 0.3;
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + shortDur, el.x + 50, 'ease-out-cubic');
          }
        },
        {
          id: 'smooth-in-out',
          name: 'Smooth In Out',
          description: 'Smooth easing',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + dur, el.x, 'ease-in-out-cubic');
          }
        },
        {
          id: 'aggressive-snap',
          name: 'Aggressive Snap',
          description: 'Very short + strong ease',
          apply: (el, start, dur, addKf) => {
            const shortDur = dur * 0.2;
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'x', start + shortDur, el.x, 'ease-out-back');
          }
        }
      ]
    },
    {
      id: 'combined',
      name: 'Killer Buttons',
      animations: [
        {
          id: 'appear',
          name: 'Appear',
          description: 'Fade + scale in',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'opacity', start, 0);
            addKf(el.id, 'width', start, w * 0.95);
            addKf(el.id, 'height', start, h * 0.95);
            addKf(el.id, 'opacity', start + dur, el.opacity || 1);
            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
          }
        },
        {
          id: 'disappear',
          name: 'Disappear',
          description: 'Fade + scale out',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'opacity', start, el.opacity || 1);
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'opacity', start + dur, 0);
            addKf(el.id, 'width', start + dur, w * 0.95);
            addKf(el.id, 'height', start + dur, h * 0.95);
          }
        },
        {
          id: 'enter',
          name: 'Enter',
          description: 'Slide + fade in',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x - 50);
            addKf(el.id, 'opacity', start, 0);
            addKf(el.id, 'x', start + dur, el.x);
            addKf(el.id, 'opacity', start + dur, el.opacity || 1);
          }
        },
        {
          id: 'exit',
          name: 'Exit',
          description: 'Slide + fade out',
          apply: (el, start, dur, addKf) => {
            addKf(el.id, 'x', start, el.x);
            addKf(el.id, 'opacity', start, el.opacity || 1);
            addKf(el.id, 'x', start + dur, el.x + 50);
            addKf(el.id, 'opacity', start + dur, 0);
          }
        },
        {
          id: 'emphasize',
          name: 'Emphasize',
          description: 'Scale pulse with overshoot',
          apply: (el, start, dur, addKf) => {
            const w = el.width;
            const h = el.height;
            addKf(el.id, 'width', start, w);
            addKf(el.id, 'height', start, h);
            addKf(el.id, 'width', start + dur * 0.6, w * 1.15, 'ease-out-back');
            addKf(el.id, 'height', start + dur * 0.6, h * 1.15, 'ease-out-back');
            addKf(el.id, 'width', start + dur, w);
            addKf(el.id, 'height', start + dur, h);
          }
        }
      ]
    }
  ];

  // Placeholder apply function for text animations
  const placeholderTextApply = (el: DesignElement, start: number, dur: number, addKf: typeof addKeyframe) => {
    console.log(`Text animation placeholder - implementation coming soon`);
    // For now, just apply a simple fade in as a demonstration
    addKf(el.id, 'opacity', start, 0);
    addKf(el.id, 'opacity', start + dur, el.opacity || 1);
  };

  // Text Animation Categories (34 animations in 6 categories)
  const textAnimationCategories: AnimationCategory[] = [
    {
      id: 'text-reveal',
      name: 'Text Reveal / Writing',
      animations: [
        { id: 'typewriter', name: 'Typewriter', description: 'Characters appear one by one with cursor blink', apply: placeholderTextApply },
        { id: 'script-write', name: 'Script Write', description: 'Path based handwriting reveal', apply: placeholderTextApply },
        { id: 'word-pop', name: 'Word Pop', description: 'Words appear sequentially with micro scale up', apply: placeholderTextApply },
        { id: 'line-reveal', name: 'Line Reveal', description: 'Lines appear from top to bottom with mask', apply: placeholderTextApply },
        { id: 'mask-wipe', name: 'Mask Wipe', description: 'Text revealed by directional clipping', apply: placeholderTextApply },
        { id: 'fade-in-order', name: 'Fade In Order', description: 'Opacity stagger per character or word', apply: placeholderTextApply },
        { id: 'underline-write', name: 'Underline Write', description: 'Line writes first, text follows', apply: placeholderTextApply }
      ]
    },
    {
      id: 'motion-in',
      name: 'Motion In (Entry)',
      animations: [
        { id: 'slide-in-text', name: 'Slide In', description: 'From left right up down with stagger', apply: placeholderTextApply },
        { id: 'rise-baseline', name: 'Rise From Baseline', description: 'Letters rise from baseline with overshoot', apply: placeholderTextApply },
        { id: 'drop-in', name: 'Drop In', description: 'Characters fall with gravity feel', apply: placeholderTextApply },
        { id: 'scale-up-text', name: 'Scale Up', description: 'Subtle zoom in with easing', apply: placeholderTextApply },
        { id: 'elastic-in', name: 'Elastic In', description: 'Bounce overshoot then settle', apply: placeholderTextApply },
        { id: 'flip-in', name: 'Flip In', description: '3D flip around X or Y axis', apply: placeholderTextApply },
        { id: 'split-reveal', name: 'Split Reveal', description: 'Text splits from center outward', apply: placeholderTextApply }
      ]
    },
    {
      id: 'motion-out',
      name: 'Motion Out (Exit)',
      animations: [
        { id: 'slide-out-text', name: 'Slide Out', description: 'Directional exit', apply: placeholderTextApply },
        { id: 'fade-out-order', name: 'Fade Out Order', description: 'Reverse stagger fade', apply: placeholderTextApply },
        { id: 'collapse-text', name: 'Collapse', description: 'Text scales down to center', apply: placeholderTextApply },
        { id: 'explode', name: 'Explode', description: 'Characters scatter outward', apply: placeholderTextApply },
        { id: 'sink', name: 'Sink', description: 'Text falls below baseline', apply: placeholderTextApply }
      ]
    },
    {
      id: 'emphasis',
      name: 'Emphasis / Loop',
      animations: [
        { id: 'pulse-text', name: 'Pulse', description: 'Soft scale and opacity loop', apply: placeholderTextApply },
        { id: 'wiggle', name: 'Wiggle', description: 'Micro random position and rotation', apply: placeholderTextApply },
        { id: 'bounce-text', name: 'Bounce', description: 'Vertical bounce emphasis', apply: placeholderTextApply },
        { id: 'shake-text', name: 'Shake', description: 'Horizontal jitter', apply: placeholderTextApply },
        { id: 'glow-pulse', name: 'Glow Pulse', description: 'Glow intensity oscillates', apply: placeholderTextApply }
      ]
    },
    {
      id: 'transform',
      name: 'Transform / Structural',
      animations: [
        { id: 'morph-in', name: 'Morph In', description: 'Letters morph from lines or blocks', apply: placeholderTextApply },
        { id: 'stretch-in', name: 'Stretch In', description: 'Text stretches then snaps back', apply: placeholderTextApply },
        { id: 'skew-snap', name: 'Skew Snap', description: 'Skew in then straighten', apply: placeholderTextApply },
        { id: 'perspective-push', name: 'Perspective Push', description: 'Z axis push toward camera', apply: placeholderTextApply }
      ]
    },
    {
      id: 'premium',
      name: 'Premium / Advanced',
      animations: [
        { id: 'kinetic-flow', name: 'Kinetic Flow', description: 'Characters follow curved motion path', apply: placeholderTextApply },
        { id: 'wave-write', name: 'Wave Write', description: 'Writing head moves in wave pattern', apply: placeholderTextApply },
        { id: 'fragment-assemble', name: 'Fragment Assemble', description: 'Text assembles from shards', apply: placeholderTextApply },
        { id: 'neon-draw', name: 'Neon Draw', description: 'Stroke draw with glow trail', apply: placeholderTextApply },
        { id: 'glitch-in', name: 'Glitch In', description: 'Digital glitch then settle', apply: placeholderTextApply },
        { id: 'magnetic-align', name: 'Magnetic Align', description: 'Characters snap into place from chaos', apply: placeholderTextApply }
      ]
    }
  ];

  const filteredCategories = activeTab === 'favorites'
    ? categories.map(cat => ({
        ...cat,
        animations: cat.animations.filter(anim => favorites.has(anim.id))
      })).filter(cat => cat.animations.length > 0)
    : categories;

  const allFavoriteAnimations = activeTab === 'favorites'
    ? categories.flatMap(cat => cat.animations.filter(anim => favorites.has(anim.id)))
    : [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-gray-700/50">
        <div className="flex">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-gray-700/50 text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
            }`}
          >
            All FX
          </button>
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
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'favorites'
                ? 'bg-gray-700/50 text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
            }`}
          >
            Favorites
          </button>
          <button
            disabled
            className="flex-1 px-4 py-2.5 text-xs font-medium text-gray-600 cursor-not-allowed"
          >
            Presets
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 border-b border-gray-700/50">
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-2">
            Duration
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
            />
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value) || 0.5)}
              className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-yellow-400"
            />
            <span className="text-xs text-gray-400">s</span>
          </div>
        </div>

        {selectedElements.length === 0 && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
            Select an element to apply animations
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {activeTab === 'textfx' ? (
          <div className="p-2 space-y-2">
            {!textEl ? (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
                Select a single text element to use the Text Animator
              </div>
            ) : (
              <>
                {/* Preset Picker */}
                <div className="border border-gray-700/50 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-700/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Presets</span>
                    {(textEl.animatorLayers || []).length > 0 && (
                      <button
                        onClick={() => onUpdateElement && onUpdateElement(textEl.id, { animatorLayers: [], masking: false })}
                        className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="p-2 grid grid-cols-3 gap-1">
                    {TEXT_ANIMATOR_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => applyAnimatorPreset(preset)}
                        className="px-2 py-1.5 rounded text-xs text-white bg-gray-700/50 hover:bg-yellow-400/20 hover:border-yellow-400/50 border border-transparent transition-all"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Layers */}
                <div className="border border-gray-700/50 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-700/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Layers <span className="text-gray-400 font-normal">({(textEl.animatorLayers || []).length})</span>
                    </span>
                    <button
                      onClick={addAnimatorLayer}
                      className="flex items-center gap-1 text-xs text-gray-300 hover:text-yellow-400 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                  {(textEl.animatorLayers || []).length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-500 text-center">No layers yet — apply a preset or add a layer</div>
                  ) : (
                    <div className="divide-y divide-gray-700/40">
                      {(textEl.animatorLayers || []).map((layer, idx) => {
                        const isExp = expandedAnimLayers.has(layer.id);
                        const needsAxis = layer.property === 'position' || layer.property === 'scale' || layer.property === 'skew';
                        return (
                          <div key={layer.id}>
                            <button
                              onClick={() => toggleAnimLayer(layer.id)}
                              className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-700/30 transition-colors"
                            >
                              <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}</span>
                              <span className="flex-1 text-left text-xs text-white">
                                {TARGET_LABELS[layer.targetType]} — {PROPERTY_LABELS[layer.property]}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); removeAnimatorLayer(layer.id); }}
                                className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              {isExp ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                            {isExp && (
                              <div className="px-3 pb-3 space-y-2 bg-gray-800/20">
                                {/* Target Type */}
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Target</label>
                                  <select
                                    value={layer.targetType}
                                    onChange={e => updateAnimatorLayer(layer.id, { targetType: e.target.value as TextAnimatorLayer['targetType'] })}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                  >
                                    <option value="characters">Characters</option>
                                    <option value="words">Words</option>
                                    <option value="lines">Lines</option>
                                  </select>
                                </div>
                                {/* Property */}
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Property</label>
                                  <select
                                    value={layer.property}
                                    onChange={e => updateAnimatorLayer(layer.id, { property: e.target.value as TextAnimatorLayer['property'] })}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                  >
                                    {(Object.keys(PROPERTY_LABELS) as TextAnimatorLayer['property'][]).map(p => (
                                      <option key={p} value={p}>{PROPERTY_LABELS[p]}</option>
                                    ))}
                                  </select>
                                </div>
                                {/* Axis (conditional) */}
                                {needsAxis && (
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Axis</label>
                                    <select
                                      value={layer.axis || 'y'}
                                      onChange={e => updateAnimatorLayer(layer.id, { axis: e.target.value as 'x' | 'y' })}
                                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                    >
                                      <option value="x">X (horizontal)</option>
                                      <option value="y">Y (vertical)</option>
                                    </select>
                                  </div>
                                )}
                                {/* Amount */}
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">
                                    Amount {layer.property === 'opacity' || layer.property === 'maskWidth' || layer.property === 'maskHeight' ? '(0–1)' : layer.property === 'blur' ? '(px)' : ''}
                                  </label>
                                  <input
                                    type="number"
                                    value={layer.amount}
                                    step={layer.property === 'opacity' || layer.property === 'maskWidth' || layer.property === 'maskHeight' ? 0.1 : 1}
                                    min={layer.property === 'opacity' || layer.property === 'maskWidth' || layer.property === 'maskHeight' ? 0 : undefined}
                                    max={layer.property === 'opacity' || layer.property === 'maskWidth' || layer.property === 'maskHeight' ? 1 : undefined}
                                    onChange={e => updateAnimatorLayer(layer.id, { amount: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                  />
                                </div>
                                {/* Timing row */}
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Start (s)</label>
                                    <input type="number" value={layer.startTime} step={0.1} min={0}
                                      onChange={e => updateAnimatorLayer(layer.id, { startTime: parseFloat(e.target.value) || 0 })}
                                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Dur (s)</label>
                                    <input type="number" value={layer.duration} step={0.05} min={0.01}
                                      onChange={e => updateAnimatorLayer(layer.id, { duration: parseFloat(e.target.value) || 0.1 })}
                                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-400 mb-1">Stagger</label>
                                    <input type="number" value={layer.stagger} step={0.01} min={0}
                                      onChange={e => updateAnimatorLayer(layer.id, { stagger: parseFloat(e.target.value) || 0 })}
                                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                    />
                                  </div>
                                </div>
                                {/* Easing */}
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Easing</label>
                                  <select
                                    value={layer.easing}
                                    onChange={e => updateAnimatorLayer(layer.id, { easing: e.target.value as EasingType })}
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400"
                                  >
                                    {EASING_CONFIGS.map(ec => (
                                      <option key={ec.type} value={ec.type}>{ec.label}</option>
                                    ))}
                                  </select>
                                </div>
                                {/* Direction */}
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Direction</label>
                                  <div className="flex rounded overflow-hidden border border-gray-600">
                                    {(['forward', 'reverse', 'center', 'random'] as const).map(dir => (
                                      <button
                                        key={dir}
                                        onClick={() => updateAnimatorLayer(layer.id, { direction: dir })}
                                        className={`flex-1 py-1 text-xs transition-colors capitalize ${
                                          layer.direction === dir
                                            ? 'bg-yellow-400/20 text-yellow-400'
                                            : 'text-gray-400 hover:bg-gray-700/50'
                                        }`}
                                      >
                                        {dir === 'forward' ? 'Fwd' : dir === 'reverse' ? 'Rev' : dir === 'center' ? 'Ctr' : 'Rnd'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'favorites' ? (
          <div className="p-2 space-y-1">
            {allFavoriteAnimations.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-xs">
                No favorites yet. Star animations from the All FX tab to add them here.
              </div>
            ) : (
              allFavoriteAnimations.map((animation) => (
                <button
                  key={animation.id}
                  onClick={() => applyAnimation(animation)}
                  disabled={selectedElements.length === 0}
                  className={`w-full text-left px-2.5 py-2 rounded transition-all duration-200 relative group ${
                    selectedElements.length > 0
                      ? 'bg-gray-700/50 hover:bg-yellow-400/20 hover:border-yellow-400/50 border border-transparent'
                      : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-white">{animation.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{animation.description}</div>
                    </div>
                    <button
                      onClick={(e) => toggleFavorite(animation.id, e)}
                      className="ml-2 p-1 rounded hover:bg-gray-600/50 transition-colors flex-shrink-0"
                    >
                      <Star
                        className={`w-3.5 h-3.5 transition-all ${
                          favorites.has(animation.id)
                            ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]'
                            : 'text-gray-500 hover:text-gray-400'
                        }`}
                      />
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.id);
              return (
                <div key={category.id} className="border border-gray-700/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full px-3 py-2 flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-xs font-medium text-white">{category.name}</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-400">{category.animations.length}</span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-2 space-y-1 bg-gray-800/30">
                      {category.animations.map((animation) => (
                        <button
                          key={animation.id}
                          onClick={() => applyAnimation(animation)}
                          disabled={selectedElements.length === 0}
                          className={`w-full text-left px-2.5 py-2 rounded transition-all duration-200 relative group ${
                            selectedElements.length > 0
                              ? 'bg-gray-700/50 hover:bg-yellow-400/20 hover:border-yellow-400/50 border border-transparent'
                              : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="text-xs font-medium text-white">{animation.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{animation.description}</div>
                            </div>
                            <button
                              onClick={(e) => toggleFavorite(animation.id, e)}
                              className="ml-2 p-1 rounded hover:bg-gray-600/50 transition-colors flex-shrink-0"
                            >
                              <Star
                                className={`w-3.5 h-3.5 transition-all ${
                                  favorites.has(animation.id)
                                    ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]'
                                    : 'text-gray-500 hover:text-gray-400'
                                }`}
                              />
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FXShortcutsTab;
