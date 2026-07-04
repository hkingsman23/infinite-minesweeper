/** Minimal inline-SVG icon set (Lucide-style: 24x24, stroke=currentColor, 2px
 * round strokes) — no external icon font/CDN dependency, so these always
 * render regardless of network conditions. */
function svg(inner: string, size = 18): string {
  // xmlns is required for iOS Safari to reliably render an <svg> inserted
  // via innerHTML — without it some WebKit versions silently fail to paint
  // the SVG at all, even though the element parses fine and Chrome renders
  // it regardless.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const icons = {
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  crosshair: svg(
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  ),
  play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  // iOS Safari's own share-sheet glyph — arrow up out of a box — used in the
  // "how to install" instructions modal since iOS has no automatic prompt.
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 22),
  addBox: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', 22),
  device: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', 22),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 18),
} as const;

export type IconName = keyof typeof icons;
