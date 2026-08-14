/** Tiny classNames joiner — no dependency, drops falsy parts. */
export type ClassValue = string | number | false | null | undefined;

export function cx(...parts: ClassValue[]): string {
  let out = '';
  for (const p of parts) {
    if (!p && p !== 0) continue;
    out = out ? `${out} ${p}` : String(p);
  }
  return out;
}
