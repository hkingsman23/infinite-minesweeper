import './style.css';
import { World } from './core/world';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { THEMES, detectInitialTheme } from './render/theme';
import { PointerController } from './input/pointerController';
import { LockPanelManager } from './ui/lockPanel';
import { Hud } from './ui/hud';
import { playSfx } from './audio/sfx';
import { vibrate } from './audio/haptics';
import { setupInstallPrompt } from './ui/installPrompt';
import { SECTOR_SIZE } from './core/types';
import { TILE } from './render/renderer';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="game-shell">
    <div id="hud-host"></div>
    <div id="board-frame">
      <canvas id="board"></canvas>
      <div id="panel-host"></div>
    </div>
  </div>
`;

const canvas = document.getElementById('board') as HTMLCanvasElement;
const panelHost = document.getElementById('panel-host')!;
const ctx = canvas.getContext('2d')!;

let theme: 'dark' | 'light' = detectInitialTheme();

function applyThemeToDom() {
  const t = THEMES[theme];
  document.body.style.background = t.bg;
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.classList.toggle('theme-light', theme === 'light');
}

// World is centred at a large offset so the player can pan in any direction
// from the start without hitting a coordinate origin edge case.
const WORLD_CENTER = 100000;
const world = new World();
const camera = new Camera(window.innerWidth, window.innerHeight);
const CENTER_PX = (WORLD_CENTER * SECTOR_SIZE + SECTOR_SIZE / 2) * TILE;
camera.x = CENTER_PX;
camera.y = CENTER_PX;

const renderer = new Renderer(ctx, window.innerWidth, window.innerHeight);
const lockPanels = new LockPanelManager(panelHost, world, renderer);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(w, h);
  renderer.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

const hud = new Hud(
  document.getElementById('hud-host')!,
  world,
  () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyThemeToDom();
    hud.setThemeIsDark(theme === 'dark');
  },
  () => {
    camera.x = CENTER_PX;
    camera.y = CENTER_PX;
    camera.setZoomAround(1, window.innerWidth / 2, window.innerHeight / 2, Infinity, Infinity);
  },
  theme === 'dark',
);

world.on((e) => {
  if (e.type === 'mineHit') {
    renderer.triggerMineFlash();
    playSfx('explosion');
    vibrate('explosion');
  } else if (e.type === 'sectorCleared') {
    renderer.triggerSectorClearPulse(e.sr, e.sc, performance.now());
    playSfx('sectorClear');
    vibrate('sectorClear');
  } else if (e.type === 'gemsEarned') {
    playSfx('gem');
    vibrate('gem');
    hud.flyGems(e.amount);
  }
});

new PointerController(canvas, camera, world, Infinity, Infinity, (cellCount, maxDist) => {
  camera.triggerCascadeZoom(cellCount, maxDist * 86, performance.now());
});

// Board starts fully covered — the player reveals the first tile themselves
// (see Renderer.draw's ungenerated-sector placeholder and World.canRevealAt's
// bootstrap case, which allows the very first tap to land anywhere).

applyThemeToDom();

function frame(now: number) {
  camera.update(now, Infinity, Infinity);
  renderer.draw(world, camera, THEMES[theme], now);
  lockPanels.update(camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Production-only: registering in dev would have the SW cache-serve stale
// bundles over Vite's HMR-served ones, masking live source changes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — the game works the same without offline/install support.
    });
  });
}

setupInstallPrompt();
