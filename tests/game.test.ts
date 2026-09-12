import { describe, expect, it } from 'vitest';
import PF from 'pathfinding';
import { Game, EMPTY_INPUT } from '../src/game';
import { LEVELS, type Point } from '../src/levels';

function step(game: Game, seconds: number, x = 0, y = 0, action = false) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) game.update(1 / 60, { x, y, action });
}

function travel(game: Game, destination: Point) {
  const matrix = game.level.walls.map(row => [...row]);
  if (!game.hasKey) matrix[game.level.gate.y][game.level.gate.x] = 1;
  if (game.filled < 3) matrix[game.level.water.y][game.level.water.x] = 1;
  const route = new PF.AStarFinder().findPath(Math.round(game.player.x), Math.round(game.player.y), destination.x, destination.y, new PF.Grid(matrix));
  expect(route.length).toBeGreaterThan(0);
  for (const [x, y] of route) {
    let frames = 0;
    while (Math.hypot(game.player.x - x, game.player.y - y) > 0.02 && game.mode === 'playing') {
      const offsetX = x - game.player.x;
      const offsetY = y - game.player.y;
      const length = Math.hypot(offsetX, offsetY);
      game.update(Math.min(1 / 60, length / 3.5), { x: offsetX / length, y: offsetY / length, action: false });
      expect(++frames).toBeLessThan(300);
    }
  }
}

describe('Fire Ant simulation', () => {
  it('freezes before start and while paused, then resumes', () => {
    const game = new Game();
    step(game, 1, 1);
    expect(game.player).toEqual(game.level.spawn);
    game.start();
    step(game, 0.3, 1);
    expect(game.player.x).toBeGreaterThan(2);
    game.togglePause();
    const before = { ...game.player };
    const vitality = game.vitality;
    step(game, 1, 1);
    expect(game.player).toEqual(before);
    expect(game.vitality).toBe(vitality);
    game.togglePause();
    expect(game.mode).toBe('playing');
  });

  it('blocks walls and normalizes diagonal movement', () => {
    const game = new Game();
    game.start();
    step(game, 2, -1);
    expect(game.player.x).toBeGreaterThan(0.7);
    expect(game.player.x).toBeLessThan(0.85);
    game.start();
    game.update(0.05, { x: 1, y: 1, action: false });
    expect(Math.hypot(game.player.x - 2, game.player.y - 2)).toBeCloseTo(0.175);
  });

  it('collects once and requires a key and filled water to open the exit', () => {
    const game = new Game();
    game.start();
    game.player = { ...game.pickups.find(pickup => pickup.kind === 'pebble')! };
    game.update(0);
    game.update(0);
    expect(game.pebbles).toBe(1);
    expect(game.score).toBe(50);
    expect(game.walkable(game.level.gate.x, game.level.gate.y)).toBe(false);
    game.player = { ...game.pickups.find(pickup => pickup.kind === 'key')! };
    game.update(0);
    expect(game.walkable(game.level.gate.x, game.level.gate.y)).toBe(true);
    expect(game.walkable(game.level.water.x, game.level.water.y)).toBe(false);
    game.player = { ...game.level.exit };
    game.update(0);
    expect(game.mode).toBe('playing');
  });

  it('deposits pebbles near water on distinct presses and builds a bridge', () => {
    const game = new Game();
    game.start();
    game.pebbles = 3;
    game.player = { x: game.level.water.x - 1, y: game.level.water.y };
    for (let count = 0; count < 3; count++) {
      game.update(0, EMPTY_INPUT);
      game.update(0, { ...EMPTY_INPUT, action: true });
      game.update(0, { ...EMPTY_INPUT, action: true });
      expect(game.filled).toBe(count + 1);
    }
    expect(game.pebbles).toBe(0);
    expect(game.walkable(game.level.water.x, game.level.water.y)).toBe(true);
  });

  it('applies damage, invulnerability, game over and a complete restart', () => {
    const game = new Game();
    game.start();
    for (let hit = 0; hit < 3; hit++) {
      game.invulnerable = 0;
      game.player = { x: game.enemies[0].x, y: game.enemies[0].y };
      game.update(0);
      expect(game.lives).toBe(2 - hit);
      game.update(0);
      expect(game.lives).toBe(2 - hit);
    }
    expect(game.mode).toBe('lost');
    game.start();
    expect([game.mode, game.lives, game.score, game.pebbles, game.levelIndex]).toEqual(['playing', 3, 0, 0, 0]);
  });

  it('stuns nearby enemies, enforces cooldown and requires a new press', () => {
    const game = new Game();
    game.start();
    game.enemies[0].x = 3;
    game.enemies[0].y = 2;
    game.update(0, { ...EMPTY_INPUT, action: true });
    expect(game.enemies[0].stun).toBeGreaterThan(3);
    step(game, 5, 0, 0, true);
    expect(game.events.filter(event => event === 'pulse')).toHaveLength(1);
    game.update(0, EMPTY_INPUT);
    game.update(0, { ...EMPTY_INPUT, action: true });
    expect(game.events.filter(event => event === 'pulse')).toHaveLength(2);
  });

  it('cycles hazards and damages only during their active interval', () => {
    const game = new Game();
    game.start();
    game.enemies = [];
    game.invulnerable = 0;
    const hazard = game.level.hazards[0];
    game.player = { ...hazard };
    game.time = 0;
    game.update(0);
    expect(game.lives).toBe(3);
    game.time = 3.5 - hazard.x * 0.17;
    game.update(0);
    expect(game.lives).toBe(2);
  });

  it('ends the rescue when the queen runs out of vitality', () => {
    const game = new Game();
    game.start();
    game.vitality = 0.01;
    game.update(0.05);
    expect(game.mode).toBe('lost');
    game.start();
    expect(game.vitality).toBe(900);
  });

  it('completes eight chambers by movement, items and actions, then starts a new colony', () => {
    const game = new Game();
    game.start();
    for (let chamber = 0; chamber < LEVELS.length; chamber++) {
      game.invulnerable = 10000;
      for (const pickup of [...game.pickups]) travel(game, pickup);
      travel(game, { x: game.level.water.x + (chamber > 3 ? 1 : -1), y: game.level.water.y });
      for (let count = 0; count < 3; count++) {
        game.update(0, EMPTY_INPUT);
        game.update(0, { ...EMPTY_INPUT, action: true });
      }
      expect(game.exitReady).toBe(true);
      travel(game, game.level.exit);
      expect(game.mode).toBe(chamber === 7 ? 'won' : 'cleared');
      if (chamber < 7) game.nextLevel();
    }
    expect(game.best).toBe(game.score);
    const rescuedScore = game.score;
    game.start(true);
    expect(game.colony).toBe(2);
    expect(game.score).toBe(rescuedScore);
    game.start();
    expect(game.colony).toBe(1);
    expect(game.score).toBe(0);
    expect(game.best).toBeGreaterThan(10000);
  });

  it('keeps every collectible reachable without opening the exit', () => {
    for (const level of LEVELS) {
      const matrix = level.walls.map(row => [...row]);
      matrix[level.gate.y][level.gate.x] = 1;
      matrix[level.water.y][level.water.x] = 1;
      for (const position of [...level.pickups, ...level.hazards, level.spawn]) {
        expect(level.walls[position.y][position.x]).toBe(0);
        expect(new PF.AStarFinder().findPath(level.spawn.x, level.spawn.y, position.x, position.y, new PF.Grid(matrix)).length).toBeGreaterThan(0);
      }
    }
  });
});
