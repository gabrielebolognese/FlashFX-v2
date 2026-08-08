import { isTemplateId, type TemplateId } from './registry';

// Deep-link parsing. The landing page links to `<app>/?template=<id>`; we read it once at startup,
// validate against the whitelist, and strip it so a refresh/bookmark doesn't re-create the project.

export function readTemplateFromUrl(): TemplateId | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('template');
    return raw && isTemplateId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearTemplateParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('template')) return;
    url.searchParams.delete('template');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* history/URL unavailable — harmless */
  }
}
