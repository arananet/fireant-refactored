import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import { createIcons, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, RotateCcw, Volume2, VolumeX, Map as MapIcon, Heart, KeyRound, Gem, Circle, Crown, Zap, ArrowUpRight, Bug } from 'lucide';
import { Game } from './game';
import { GameScene } from './scene';
import { GameAudio } from './audio';
import './style.css';

const icons = { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Play, Pause, RotateCcw, Volume2, VolumeX, Map: MapIcon, Heart, KeyRound, Gem, Circle, Crown, Zap, ArrowUpRight, Bug };
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const utility = (id: string, label: string, name: string) => `<button id="${id}" class="icon-button" aria-label="${label}" title="${label}">${icon(name)}</button>`;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">${icon('bug')}</span><div><h1>FIRE ANT<span class="edition"> / 01</span></h1><span class="brand-caption">THE QUEEN'S RESCUE</span></div></div>
    <div class="scoreboard"><div><span class="small-label">SCORE</span><strong id="score">000000</strong></div><div class="best"><span class="small-label">PERSONAL BEST</span><strong id="best">000000</strong></div></div>
    <nav aria-label="Game controls">${utility('map', 'Toggle chamber overview', 'map')}${utility('sound', 'Mute music and effects', 'volume-2')}${utility('pause', 'Pause game', 'pause')}${utility('restart', 'Restart rescue', 'rotate-ccw')}</nav>
  </header>
  <main id="world-shell">
    <div id="world"></div>
    <div class="chapter"><div class="small-label"><span class="live-dot"></span> COLONY <span id="colony">01</span><span class="divider">/</span> CHAMBER <span id="chapter-number">01</span> OF 08</div><h2 id="chapter-name">The Outpost</h2></div>
    <div class="vitality"><div class="small-label">${icon('crown')} QUEEN VITALITY <span id="time">15:00</span></div><progress id="vitality" max="900" value="900" aria-label="Queen vitality"></progress></div>
    <div id="player-tag" aria-hidden="true">YOU</div>
    <div id="notice" role="status" aria-live="polite"></div>
    <div id="overlay" class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-symbol">${icon('crown')}</div><span class="small-label" id="dialog-eyebrow">THE LAST SOLDIER. EIGHT CHAMBERS.</span><h2 id="dialog-title">Bring her home.</h2><div id="dialog-stats"><span>3 lives</span><span>15 minutes</span><span>1 queen</span></div><button id="primary" class="primary">${icon('play')}<span>Enter the colony</span>${icon('arrow-up-right')}</button><button id="cancel" class="text-button" hidden>Keep playing</button></div></div>
    <div id="touch-controls"><div class="dpad" role="group" aria-label="Movement controls"><button data-direction="up" aria-label="Move up">${icon('arrow-up')}</button><button data-direction="left" aria-label="Move left">${icon('arrow-left')}</button><span class="dpad-center"></span><button data-direction="right" aria-label="Move right">${icon('arrow-right')}</button><button data-direction="down" aria-label="Move down">${icon('arrow-down')}</button></div><button id="touch-action" aria-label="Pulse or place pebble" title="Pulse or place pebble">${icon('zap')}<span>PULSE</span></button></div>
  </main>
  <footer class="bottom-bar"><div class="mission"><span class="small-label">CURRENT OBJECTIVE</span><strong id="objective">Gather 3 pebbles & find the key</strong></div><div class="inventory"><div title="Pebbles carried" aria-label="Pebbles carried">${icon('circle')}<span id="pebbles">0</span><span class="inventory-label">PEBBLES</span></div><div id="key" title="Key not found">${icon('key-round')}<span class="inventory-label">KEY</span></div><div class="lives" title="Lives remaining">${icon('heart')}<span id="lives">3</span></div></div><button id="action" class="action-button" title="Pulse or place pebble">${icon('zap')}<span id="action-label">Pulse ready</span><span id="cooldown"></span></button></footer>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let storedBest = 0;
try { storedBest = Number(localStorage.getItem('fire-ant-best') ?? 0); } catch { storedBest = 0; }
const game = new Game(storedBest);
const audio = new GameAudio();
const world = element('world');
let scene: GameScene;
try {
  scene = new GameScene(world);
} catch {
  element('dialog-title').textContent = 'WebGL unavailable';
  element('dialog-eyebrow').textContent = 'A WEBGL-CAPABLE BROWSER IS REQUIRED';
  element('dialog-stats').textContent = 'Enable hardware acceleration and reload.';
  element<HTMLButtonElement>('primary').disabled = true;
  throw new Error('A WebGL renderer could not be initialized.');
}
createIcons({ icons });
const keys = new Set<string>();
const touches = new Map<number, string>();
let actionRequested = false;
let restartPrompt = false;
let resumeAfterCancel = false;
let previousMode = '';
let savedBest = game.best;
let lastNotice = '';
let noticeUntil = 0;
let previousSound = '';
let previousPause = '';
let previousObjective = '';
const clearInput = () => { keys.clear(); touches.clear(); actionRequested = false; };
const unlock = () => { void audio.unlock().catch(() => announce('Audio unavailable in this browser')); };
function announce(text: string) {
  lastNotice = text;
  noticeUntil = performance.now() + 2800;
}
function refreshIcons() { createIcons({ icons }); }

function primaryAction() {
  unlock();
  clearInput();
  if (restartPrompt) { restartPrompt = false; game.start(); scene.reset(); }
  else if (game.mode === 'paused') game.togglePause();
  else if (game.mode === 'cleared') { game.nextLevel(); scene.reset(); }
  else { game.start(game.mode === 'won'); scene.reset(); }
  previousMode = '';
}
element('primary').addEventListener('click', primaryAction);
element('cancel').addEventListener('click', () => { restartPrompt = false; if (resumeAfterCancel) game.togglePause(); previousMode = ''; });
element('pause').addEventListener('click', () => { clearInput(); game.togglePause(); unlock(); });
element('sound').addEventListener('click', () => { audio.toggleMute(); unlock(); });
element('map').addEventListener('click', () => { scene.overview = !scene.overview; element('map').setAttribute('aria-pressed', String(scene.overview)); });
function requestRestart() {
  if (game.mode === 'ready') return;
  clearInput();
  resumeAfterCancel = game.mode === 'playing';
  if (resumeAfterCancel) game.togglePause();
  restartPrompt = true;
  previousMode = '';
}
element('restart').addEventListener('click', requestRestart);
const freshRun = document.createElement('button');
freshRun.id = 'fresh-run';
freshRun.className = 'text-button';
freshRun.innerHTML = `${icon('rotate-ccw')} Restart rescue`;
freshRun.hidden = true;
freshRun.addEventListener('click', requestRestart);
element('cancel').after(freshRun);
refreshIcons();
element('action').addEventListener('click', () => { if (game.mode === 'playing') { actionRequested = true; unlock(); } });

const gameplayKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '];
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (gameplayKeys.includes(key) && game.mode === 'playing') event.preventDefault();
  if (event.repeat) return;
  if ((key === 'enter' || key === ' ') && game.mode === 'ready') { event.preventDefault(); primaryAction(); return; }
  if (key === 'escape' || key === 'p') { if (!restartPrompt) { clearInput(); game.togglePause(); } return; }
  if (key === 'm') { audio.toggleMute(); unlock(); return; }
  if (key === 'tab' && game.mode === 'playing') return;
  if (game.mode === 'playing') {
    keys.add(key);
    if (key === ' ') actionRequested = true;
  }
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); if (game.mode === 'playing') game.togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (game.mode === 'playing') game.togglePause(); audio.sync(false, game.levelIndex); } });
document.querySelectorAll<HTMLButtonElement>('[data-direction], #touch-action').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (game.mode !== 'playing') return;
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.direction ?? 'action');
    if (!button.dataset.direction) actionRequested = true;
    button.classList.add('held');
    unlock();
  });
  const release = (event: PointerEvent) => { touches.delete(event.pointerId); button.classList.remove('held'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
new ResizeObserver(() => scene.resize()).observe(world);

function updateHud(now: number) {
  element('score').textContent = String(game.score).padStart(6, '0');
  element('best').textContent = String(game.best).padStart(6, '0');
  element('colony').textContent = String(game.colony).padStart(2, '0');
  element('chapter-number').textContent = String(game.levelIndex + 1).padStart(2, '0');
  element('chapter-name').textContent = game.level.name;
  element('time').textContent = `${Math.floor(game.vitality / 60)}:${String(Math.floor(game.vitality % 60)).padStart(2, '0')}`;
  (element('vitality') as unknown as HTMLProgressElement).value = game.vitality;
  element('pebbles').textContent = String(game.pebbles);
  element('lives').textContent = String(game.lives);
  element('key').classList.toggle('acquired', game.hasKey);
  element('key').title = game.hasKey ? 'Key found' : 'Key not found';
  const objective = game.exitReady ? (game.levelIndex === 7 ? 'Reach the queen' : 'Reach the glowing exit') : game.canDeposit ? `Place pebbles at the crossing (${game.filled}/3)` : game.pebbles + game.filled < 3 ? `Gather pebbles (${game.pebbles + game.filled}/3)${game.hasKey ? '' : ' & find the key'}` : !game.hasKey ? 'Find the golden key' : `Fill the water crossing (${game.filled}/3)`;
  if (objective !== previousObjective) { element('objective').textContent = objective; previousObjective = objective; }
  element('action-label').textContent = game.canDeposit ? 'Place pebble' : game.cooldown > 0 ? 'Recharging' : 'Pulse ready';
  element('cooldown').textContent = game.canDeposit || game.cooldown === 0 ? '' : `${Math.ceil(game.cooldown)}s`;
  element('touch-action').querySelector('span')!.textContent = game.canDeposit ? 'PLACE' : game.cooldown > 0 ? `${Math.ceil(game.cooldown)}s` : 'PULSE';
  element('touch-action').style.setProperty('--charge', `${(1 - game.cooldown / 4) * 100}%`);
  element('notice').textContent = now < noticeUntil ? lastNotice : '';
  const muteState = audio.muted ? 'muted' : 'unmuted';
  if (muteState !== previousSound) {
    element('sound').innerHTML = icon(audio.muted ? 'volume-x' : 'volume-2');
    element('sound').setAttribute('aria-label', audio.muted ? 'Unmute music and effects' : 'Mute music and effects');
    element('sound').title = audio.muted ? 'Unmute music and effects' : 'Mute music and effects';
    element('sound').setAttribute('aria-pressed', String(audio.muted));
    previousSound = muteState;
    refreshIcons();
  }
  const pauseState = game.mode === 'paused' ? 'paused' : 'active';
  if (pauseState !== previousPause) {
    element('pause').innerHTML = icon(game.mode === 'paused' ? 'play' : 'pause');
    element('pause').setAttribute('aria-label', game.mode === 'paused' ? 'Resume game' : 'Pause game');
    element('pause').title = game.mode === 'paused' ? 'Resume game' : 'Pause game';
    previousPause = pauseState;
    refreshIcons();
  }
  element<HTMLButtonElement>('pause').disabled = !['playing', 'paused'].includes(game.mode) || restartPrompt;
  element<HTMLButtonElement>('action').disabled = game.mode !== 'playing' || (!game.canDeposit && game.cooldown > 0);
  if (game.mode !== previousMode) {
    document.body.dataset.mode = game.mode;
    element('overlay').hidden = game.mode === 'playing' && !restartPrompt;
    element('overlay').classList.toggle('intro', game.mode === 'ready');
    element('cancel').hidden = !restartPrompt;
    freshRun.hidden = restartPrompt || !['paused', 'cleared', 'won'].includes(game.mode);
    const content = restartPrompt ? ['START OVER?', 'A fresh rescue.', 'Your current run will be reset.', 'Restart rescue'] : {
      ready: ['THE LAST SOLDIER. EIGHT CHAMBERS.', 'Bring her home.', '3 lives / 15 minutes / 1 queen', 'Enter the colony'],
      paused: ['RESCUE ON HOLD', 'Catch your breath.', `Chamber ${game.levelIndex + 1} / ${game.score.toLocaleString()} points`, 'Resume rescue'],
      cleared: [`CHAMBER ${String(game.levelIndex + 1).padStart(2, '0')} COMPLETE`, 'One step closer.', `${game.score.toLocaleString()} points / +1 life`, 'Next chamber'],
      won: ['QUEEN RESCUED', 'Home, at last.', `${game.score.toLocaleString()} points / Colony ${game.colony} saved`, 'Next colony'],
      lost: ['RESCUE ENDED', game.vitality === 0 ? 'Out of time.' : 'The colony remembers.', `${game.score.toLocaleString()} points / Best ${game.best.toLocaleString()}`, 'Try again'],
      playing: ['', '', '', ''],
    }[game.mode];
    element('dialog-eyebrow').textContent = content[0];
    element('dialog-title').textContent = content[1];
    element('dialog-stats').textContent = content[2];
    element('primary').querySelector('span')!.textContent = content[3];
    if (game.mode !== 'playing') { clearInput(); element('primary').focus({ preventScroll: true }); }
    else (document.activeElement as HTMLElement)?.blur();
    previousMode = game.mode;
  }
  const tag = scene.playerScreenPosition();
  element('player-tag').style.transform = `translate(${tag.x}px, ${tag.y}px)`;
  element('player-tag').hidden = game.mode !== 'playing' || game.time > 8 || tag.y < 90;
  if (game.best !== savedBest) {
    try { localStorage.setItem('fire-ant-best', String(game.best)); } catch {}
    savedBest = game.best;
  }
}

let lastFrame = performance.now();
function frame(now: number) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  const held = new Set(touches.values());
  const input = {
    x: Number(keys.has('arrowright') || keys.has('d') || held.has('right')) - Number(keys.has('arrowleft') || keys.has('a') || held.has('left')),
    y: Number(keys.has('arrowdown') || keys.has('s') || held.has('down')) - Number(keys.has('arrowup') || keys.has('w') || held.has('up')),
    action: keys.has(' ') || held.has('action') || actionRequested,
  };
  game.update(elapsed, input);
  actionRequested = false;
  audio.sync(game.mode === 'playing', game.levelIndex);
  const messages = { pebble: 'Pebble collected +50', amber: 'Amber found +250', key: 'Key found. Gate unlocked.', bridge: game.filled === 3 ? 'Crossing complete!' : `Crossing ${game.filled}/3`, hurt: 'Soldier lost', pulse: 'Pheromone pulse', clear: 'Chamber cleared', won: 'Queen rescued', lost: 'Rescue ended' };
  for (const event of game.events.splice(0)) { audio.effect(event); announce(messages[event]); }
  scene.render(game, elapsed, now / 1000);
  updateHud(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.VITE_TEST_MODE === '1') Object.assign(window, { __fireAnt: { game, scene, audio } });
