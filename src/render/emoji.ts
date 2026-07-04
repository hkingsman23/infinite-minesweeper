/** Pre-rasterizes emoji to offscreen canvases so drawing them at any zoom level
 * is a cheap drawImage rather than re-laying-out text every frame. Centering
 * uses the glyph's actual measured bounding box (not just font metrics/
 * baseline guessing), so different emoji — which can sit quite differently
 * within their em-box — all land visually centered rather than needing a
 * separate hand-tuned offset per glyph. */
const cache = new Map<string, HTMLCanvasElement>();

export function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, cx: number, cy: number, size: number) {
  const key = `${emoji}_${Math.round(size)}`;
  let canvas = cache.get(key);
  if (!canvas) {
    const s = Math.ceil(size * 1.4);
    canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const octx = canvas.getContext('2d')!;
    octx.font = `${size}px serif`;
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    const m = octx.measureText(emoji);
    const bboxW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const bboxH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const x = (s - bboxW) / 2 + m.actualBoundingBoxLeft;
    const y = (s - bboxH) / 2 + m.actualBoundingBoxAscent;
    octx.fillText(emoji, x, y);
    cache.set(key, canvas);
  }
  const s = canvas.width;
  ctx.drawImage(canvas, cx - s / 2, cy - s / 2, s, s);
}
