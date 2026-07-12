import './style.css';
import { World, WORLD_STORAGE_KEY } from './core/world';
import { DailyGame, DAILY_STORAGE_KEY } from './core/dailyGame';
import { ECONOMY_STORAGE_KEY } from './core/economy';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { THEMES, detectInitialTheme } from './render/theme';
import { PointerController } from './input/pointerController';
import { DailyPointerController } from './input/dailyPointerController';
import { LockPanelManager } from './ui/lockPanel';
import { Hud } from './ui/hud';
import { DailyView } from './ui/dailyView';
import { showResetConfirm } from './ui/resetConfirm';
import { showSaveTransfer } from './ui/saveTransferModal';
import { showGemShop } from './ui/gemShop';
import { CAMERA_STORAGE_KEY } from './core/saveTransfer';
import { playSfx } from './audio/sfx';
import { vibrate } from './audio/haptics';
import { setupInstallPrompt } from './ui/installPrompt';
import { SECTOR_SIZE } from './core/types';
import { DAILY_WORLD_SIZE, TILE, dailyInitialZoom } from './render/renderer';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="game-shell">
    <div id="hud-host"></div>
    <div id="daily-header-host" style="display: none"></div>
    <div id="board-frame">
      <canvas id="board"></canvas>
      <div id="panel-host"></div>
    </div>
  </div>
`;

const canvas = document.getElementById('board') as HTMLCanvasElement;
const panelHost = document.getElementById('panel-host')!;
const hudHost = document.getElementById('hud-host')!;
const dailyHeaderHost = document.getElementById('daily-header-host')!;
// alpha:false — the canvas fully repaints its own opaque background every
// frame (see Renderer.draw's bg fillRect), so there's never anything for the
// browser to alpha-composite against what's behind it. Telling it that up
// front lets it skip that compositing work every frame, which matters more
// on lower-power mobile GPUs than on desktop.
const ctx = canvas.getContext('2d', { alpha: false })!;

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
const world = World.load();
const camera = new Camera(window.innerWidth, window.innerHeight);
const CENTER_PX = (WORLD_CENTER * SECTOR_SIZE + SECTOR_SIZE / 2) * TILE;

function loadCameraState(): { x: number; y: number; zoom: number } | null {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Flipped just before resetAll()/restoreSave() reloads the page —
// beforeunload fires as part of that same reload and would otherwise
// re-save the (about-to-be-stale) in-memory camera position right after
// storage was cleared/overwritten, silently undoing that piece of it.
let resetting = false;

function saveCameraState() {
  if (resetting) return;
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ x: camera.x, y: camera.y, zoom: camera.zoom }));
  } catch {
    // Non-fatal — resumes centred instead of exactly where you left off.
  }
}

const savedCamera = loadCameraState();
camera.x = savedCamera?.x ?? CENTER_PX;
camera.y = savedCamera?.y ?? CENTER_PX;
if (savedCamera) camera.setZoomImmediate(savedCamera.zoom);

/** Wipes every piece of saved progress (economy, board, camera position,
 * daily streak) and reloads so everything reinitializes from scratch —
 * simplest way to guarantee no in-memory state survives alongside the
 * cleared storage. Gated behind a confirmation modal (see ui/resetConfirm.ts)
 * since it's destructive and irreversible. */
function resetAll() {
  resetting = true;
  for (const key of [ECONOMY_STORAGE_KEY, WORLD_STORAGE_KEY, CAMERA_STORAGE_KEY, DAILY_STORAGE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Non-fatal — matches the tolerance every save()/load() here already has.
    }
  }
  window.location.reload();
}

/** Called after core/saveTransfer.ts's importSave() has already written the
 * restored data into localStorage — just needs the same reload + camera-
 * save-suppression treatment as resetAll() so the current (about-to-be-
 * stale) in-memory state doesn't get re-saved over what was just restored. */
function restoreSave() {
  resetting = true;
  window.location.reload();
}

// visibilitychange fires reliably on mobile (backgrounding/locking), unlike
// beforeunload which mobile OSes can skip entirely when a tab is killed;
// beforeunload is kept too for desktop's more predictable close/refresh.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveCameraState();
});
window.addEventListener('beforeunload', saveCameraState);

const renderer = new Renderer(ctx, window.innerWidth, window.innerHeight);
const lockPanels = new LockPanelManager(panelHost, world, renderer);

const dailyCamera = new Camera(window.innerWidth, window.innerHeight);
dailyCamera.x = DAILY_WORLD_SIZE / 2;
dailyCamera.y = DAILY_WORLD_SIZE / 2;
dailyCamera.setZoomImmediate(dailyInitialZoom(window.innerWidth, window.innerHeight));
// Keeps at least one tile's worth of breathing room past the board edge
// when zoomed/panned in fully — otherwise the last row/column of tiles
// could end up flush against the screen edge, unlike the endless board
// which never runs out of world to keep panning into.
dailyCamera.panMargin = TILE;

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
  dailyCamera.resize(w, h);
  renderer.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

let mode: 'endless' | 'daily' = 'endless';

const hud = new Hud(
  hudHost,
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
  () => enterDaily(),
  () => showResetConfirm(resetAll, () => showSaveTransfer(restoreSave)),
  () => showGemShop(world, (amount) => hud.flyGems(amount)),
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

const pointerController = new PointerController(canvas, camera, world, Infinity, Infinity, (cellCount, maxDist) => {
  camera.triggerCascadeZoom(cellCount, maxDist * 86, performance.now());
});

// --- Daily challenge (see core/dailyGame.ts) ---
const dailyGame = DailyGame.today();
let dailyWasComplete = dailyGame.isComplete();
const dailyView = new DailyView(dailyHeaderHost, dailyGame, () => exitDaily());
const dailyPointerController = new DailyPointerController(canvas, dailyCamera, dailyGame, (_revealedCount, hitMine) => {
  if (hitMine) {
    renderer.triggerMineFlash();
  } else if (!dailyWasComplete && dailyGame.isComplete()) {
    playSfx('sectorClear');
    vibrate('sectorClear');
  }
  dailyWasComplete = dailyGame.isComplete();
});
dailyPointerController.enabled = false;

function enterDaily() {
  mode = 'daily';
  hudHost.style.display = 'none';
  panelHost.style.display = 'none';
  dailyHeaderHost.style.display = '';
  pointerController.enabled = false;
  dailyPointerController.enabled = true;
}

function exitDaily() {
  mode = 'endless';
  hudHost.style.display = '';
  panelHost.style.display = '';
  dailyHeaderHost.style.display = 'none';
  pointerController.enabled = true;
  dailyPointerController.enabled = false;
}

// Board starts fully covered — the player reveals the first tile themselves
// (see Renderer.draw's ungenerated-sector placeholder and World.canRevealAt's
// bootstrap case, which allows the very first tap to land anywhere).

applyThemeToDom();

function frame(now: number) {
  if (mode === 'endless') {
    camera.update(now, Infinity, Infinity);
    renderer.draw(world, camera, THEMES[theme], now);
    lockPanels.update(camera);
  } else {
    dailyCamera.update(now, DAILY_WORLD_SIZE, DAILY_WORLD_SIZE);
    renderer.drawDaily(dailyGame.getSector(), dailyCamera, now, THEMES[theme]);
    dailyView.update();
  }
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
