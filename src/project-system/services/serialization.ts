import type { Composition } from '../../core/types';
import { validateComposition } from './validation';

export function serializeComposition(composition: Composition): string {
  return JSON.stringify(composition);
}

export function deserializeComposition(data: string): Composition {
  const raw = JSON.parse(data);
  return validateComposition(raw);
}
