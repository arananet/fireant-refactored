import PF from 'pathfinding';
import { LEVELS, type Point, type Pickup, type Level } from './levels';

export type Mode = 'ready' | 'playing' | 'paused' | 'cleared' | 'won' | 'lost';
export type GameEvent = 'pebble' | 'amber' | 'key' | 'pulse' | 'bridge' | 'hurt' | 'clear' | 'won' | 'lost';
export type Enemy = Point & {
  home: Point; target: Point; angle: number; stun: number;
  route: number[][]; routeTimer: number; returning: boolean;
};
export type Input = { x: number; y: number; action: boolean };
export const EMPTY_INPUT: Input = { x: 0, y: 0, action: false };
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);

export class Game {
  mode: Mode = 'ready';
  levelIndex = 0;
  colony = 1;
  level: Level = LEVELS[0];
  player: Point = { ...this.level.spawn };
  angle = Math.PI / 2;
  moving = false;
  lives = 3;
  score = 0;
  best = 0;
  pebbles = 0;
  filled = 0;
  hasKey = false;
  time = 0;
  vitality = 900;
  invulnerable = 0;
  cooldown = 0;
  pulseTime = 0;
  pickups: Pickup[] = [];
  enemies: Enemy[] = [];
  events: GameEvent[] = [];
  private actionHeld = false;

  constructor(best = 0) {
    this.best = Number.isFinite(best) ? Math.max(0, best) : 0;
    this.loadLevel();
  }

  get exitReady() { return this.hasKey && this.filled === 3; }
  get canDeposit() { return this.filled < 3 && this.pebbles > 0 && distance(this.player, this.level.water) < 1.6; }

  start(nextColony = false) {
    const advancing = nextColony && this.mode === 'won';
    this.colony = advancing ? this.colony + 1 : 1;
    if (!advancing) this.score = 0;
    this.lives = 3;
    this.vitality = 900;
    this.levelIndex = 0;
    this.loadLevel();
    this.mode = 'playing';
  }

  private loadLevel() {
    this.level = LEVELS[this.levelIndex];
    this.player = { ...this.level.spawn };
    this.pickups = this.level.pickups.map(pickup => ({ ...pickup }));
    this.enemies = this.level.enemies.map(enemy => ({
      ...enemy.start, home: { ...enemy.start }, target: { ...enemy.end },
      angle: 0, stun: 0, route: [], routeTimer: 0, returning: false,
    }));
    this.pebbles = 0;
    this.filled = 0;
    this.hasKey = false;
    this.time = 0;
    this.angle = Math.PI / 2;
    this.invulnerable = 1.5;
    this.cooldown = 0;
    this.pulseTime = 0;
    this.actionHeld = false;
    this.events = [];
  }

  nextLevel() {
    if (this.mode !== 'cleared') return;
    this.levelIndex++;
    this.lives = Math.min(5, this.lives + 1);
    this.loadLevel();
    this.mode = 'playing';
  }

  togglePause() {
    if (this.mode === 'playing') this.mode = 'paused';
    else if (this.mode === 'paused') this.mode = 'playing';
  }

  walkable(x: number, y: number, forEnemy = false) {
    const column = Math.round(x);
    const row = Math.round(y);
    if (this.level.walls[row]?.[column] !== 0) return false;
    if (column === this.level.gate.x && row === this.level.gate.y && (forEnemy || !this.hasKey)) return false;
    if (column === this.level.water.x && row === this.level.water.y && (forEnemy || this.filled < 3)) return false;
    return true;
  }

  private fits(x: number, y: number) {
    const radius = 0.24;
    return [-radius, radius].every(offsetX => [-radius, radius].every(offsetY => this.walkable(x + offsetX, y + offsetY)));
  }

  update(delta: number, input: Input = EMPTY_INPUT) {
    if (this.mode !== 'playing') return;
    const elapsed = Math.max(0, Math.min(delta, 0.05));
    this.time += elapsed;
    this.vitality = Math.max(0, this.vitality - elapsed);
    if (this.vitality === 0) { this.mode = 'lost'; this.events.push('lost'); return; }
    this.invulnerable = Math.max(0, this.invulnerable - elapsed);
    this.cooldown = Math.max(0, this.cooldown - elapsed);
    this.pulseTime = Math.max(0, this.pulseTime - elapsed);
    if (input.action && !this.actionHeld) {
      if (this.canDeposit) {
        this.pebbles--;
        this.filled++;
        this.addScore(100);
        this.events.push('bridge');
      } else if (this.cooldown === 0) {
        this.cooldown = 4;
        this.pulseTime = 0.6;
        for (const enemy of this.enemies) if (distance(this.player, enemy) < 3.4) enemy.stun = 3.2;
        this.events.push('pulse');
      }
    }
    this.actionHeld = input.action;
    const magnitude = Math.hypot(input.x, input.y);
    this.moving = magnitude > 0;
    if (this.moving) {
      const speed = 3.5 * elapsed / Math.max(1, magnitude);
      const nextX = this.player.x + input.x * speed;
      if (this.fits(nextX, this.player.y)) this.player.x = nextX;
      const nextY = this.player.y + input.y * speed;
      if (this.fits(this.player.x, nextY)) this.player.y = nextY;
      this.angle = Math.atan2(input.x, input.y);
    }
    this.pickups = this.pickups.filter(pickup => {
      if (distance(this.player, pickup) > 0.48) return true;
      if (pickup.kind === 'pebble') { this.pebbles++; this.addScore(50); }
      if (pickup.kind === 'amber') this.addScore(250);
      if (pickup.kind === 'key') { this.hasKey = true; this.addScore(150); }
      this.events.push(pickup.kind);
      return false;
    });
    this.updateEnemies(elapsed);
    if (this.level.hazards.some(hazard => this.hazardActive(hazard) && distance(hazard, this.player) < 0.42)) this.hurt();
    if (this.exitReady && distance(this.player, this.level.exit) < 0.5 && this.mode === 'playing') {
      this.addScore(1000 + Math.max(0, 500 - Math.floor(this.time * 2)));
      this.mode = this.levelIndex === LEVELS.length - 1 ? 'won' : 'cleared';
      this.events.push(this.mode === 'won' ? 'won' : 'clear');
    }
  }

  hazardActive(hazard: Point) { return (this.time + hazard.x * 0.17) % 4.5 > 3; }

  private addScore(amount: number) {
    this.score += amount;
    this.best = Math.max(this.best, this.score);
  }

  private hurt() {
    if (this.invulnerable > 0 || this.mode !== 'playing') return;
    this.lives--;
    this.events.push('hurt');
    this.invulnerable = 2.5;
    if (this.lives === 0) { this.mode = 'lost'; this.events.push('lost'); }
    else this.player = { ...this.level.spawn };
  }

  private updateEnemies(elapsed: number) {
    for (const enemy of this.enemies) {
      enemy.stun = Math.max(0, enemy.stun - elapsed);
      if (enemy.stun > 0) continue;
      enemy.routeTimer -= elapsed;
      if (enemy.routeTimer <= 0) {
        enemy.routeTimer = 0.55;
        const chasing = distance(this.player, enemy) < 4.3 && this.invulnerable === 0;
        let destination = chasing ? this.player : enemy.returning ? enemy.home : enemy.target;
        if (!chasing && distance(enemy, destination) < 0.4) {
          enemy.returning = !enemy.returning;
          destination = enemy.returning ? enemy.home : enemy.target;
        }
        const matrix = this.level.walls.map(row => [...row]);
        matrix[this.level.gate.y][this.level.gate.x] = 1;
        matrix[this.level.water.y][this.level.water.x] = 1;
        enemy.route = new PF.AStarFinder().findPath(Math.round(enemy.x), Math.round(enemy.y), Math.round(destination.x), Math.round(destination.y), new PF.Grid(matrix));
        if (enemy.route.length > 1) enemy.route.shift();
      }
      const next = enemy.route[0];
      if (next) {
        const offsetX = next[0] - enemy.x;
        const offsetY = next[1] - enemy.y;
        const length = Math.hypot(offsetX, offsetY);
        const step = (1.05 + this.levelIndex * 0.045 + Math.min(5, this.colony - 1) * 0.1) * elapsed;
        if (length <= step) { enemy.x = next[0]; enemy.y = next[1]; enemy.route.shift(); }
        else {
          const nextX = enemy.x + offsetX / length * step;
          const nextY = enemy.y + offsetY / length * step;
          if (this.walkable(nextX, enemy.y, true)) enemy.x = nextX;
          if (this.walkable(enemy.x, nextY, true)) enemy.y = nextY;
          enemy.angle = Math.atan2(offsetX, offsetY);
        }
      }
      if (distance(enemy, this.player) < 0.52) this.hurt();
    }
  }
}
