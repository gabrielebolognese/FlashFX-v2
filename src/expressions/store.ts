import { create } from 'zustand';
import type { ExpressionDef } from './types';

interface ExpressionStoreState {
  expressions: Map<string, Map<string, ExpressionDef>>;

  setExpression: (layerId: string, propertyPath: string, code: string) => void;
  getExpression: (layerId: string, propertyPath: string) => ExpressionDef | null;
  setEnabled: (layerId: string, propertyPath: string, enabled: boolean) => void;
  setError: (layerId: string, propertyPath: string, error: string | null) => void;
  removeExpression: (layerId: string, propertyPath: string) => void;
  getLayerExpressions: (layerId: string) => Map<string, ExpressionDef>;
  removeLayer: (layerId: string) => void;
  getSnapshot: () => Record<string, Record<string, ExpressionDef>>;
  loadSnapshot: (data: Record<string, Record<string, ExpressionDef>>) => void;
}

export const useExpressionStore = create<ExpressionStoreState>((set, get) => ({
  expressions: new Map(),

  setExpression: (layerId, propertyPath, code) => {
    const { expressions } = get();
    const next = new Map(expressions);
    const layerMap = new Map(next.get(layerId) ?? []);
    const existing = layerMap.get(propertyPath);
    layerMap.set(propertyPath, {
      code,
      enabled: existing?.enabled ?? true,
      error: null,
    });
    next.set(layerId, layerMap);
    set({ expressions: next });
  },

  getExpression: (layerId, propertyPath) => {
    return get().expressions.get(layerId)?.get(propertyPath) ?? null;
  },

  setEnabled: (layerId, propertyPath, enabled) => {
    const { expressions } = get();
    const layerMap = expressions.get(layerId);
    const def = layerMap?.get(propertyPath);
    if (!def) return;
    const next = new Map(expressions);
    const nextLayer = new Map(layerMap!);
    nextLayer.set(propertyPath, { ...def, enabled });
    next.set(layerId, nextLayer);
    set({ expressions: next });
  },

  setError: (layerId, propertyPath, error) => {
    const { expressions } = get();
    const layerMap = expressions.get(layerId);
    const def = layerMap?.get(propertyPath);
    if (!def) return;
    const next = new Map(expressions);
    const nextLayer = new Map(layerMap!);
    nextLayer.set(propertyPath, { ...def, error });
    next.set(layerId, nextLayer);
    set({ expressions: next });
  },

  removeExpression: (layerId, propertyPath) => {
    const { expressions } = get();
    const layerMap = expressions.get(layerId);
    if (!layerMap?.has(propertyPath)) return;
    const next = new Map(expressions);
    const nextLayer = new Map(layerMap);
    nextLayer.delete(propertyPath);
    if (nextLayer.size === 0) {
      next.delete(layerId);
    } else {
      next.set(layerId, nextLayer);
    }
    set({ expressions: next });
  },

  getLayerExpressions: (layerId) => {
    return get().expressions.get(layerId) ?? new Map();
  },

  removeLayer: (layerId) => {
    const { expressions } = get();
    if (!expressions.has(layerId)) return;
    const next = new Map(expressions);
    next.delete(layerId);
    set({ expressions: next });
  },

  getSnapshot: () => {
    const { expressions } = get();
    const out: Record<string, Record<string, ExpressionDef>> = {};
    for (const [layerId, layerMap] of expressions) {
      const props: Record<string, ExpressionDef> = {};
      for (const [path, def] of layerMap) {
        props[path] = { ...def };
      }
      out[layerId] = props;
    }
    return out;
  },

  loadSnapshot: (data) => {
    const next = new Map<string, Map<string, ExpressionDef>>();
    for (const layerId of Object.keys(data)) {
      const layerMap = new Map<string, ExpressionDef>();
      for (const path of Object.keys(data[layerId])) {
        const def = data[layerId][path];
        layerMap.set(path, { code: def.code, enabled: def.enabled, error: null });
      }
      next.set(layerId, layerMap);
    }
    set({ expressions: next });
  },
}));
