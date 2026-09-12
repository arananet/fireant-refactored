export type Point = { x: number; y: number };
export type Pickup = Point & { kind: 'pebble' | 'amber' | 'key'; id: string };
export type Level = {
  name: string; walls: number[][]; spawn: Point; exit: Point; gate: Point; water: Point;
  pickups: Pickup[]; enemies: { start: Point; end: Point }[]; hazards: Point[];
  moss: number; rock: number;
};

export const WIDTH = 25;
export const HEIGHT = 15;
const point = (x: number, y: number): Point => ({ x, y });
const names = ['The Outpost', 'Glassroot Grotto', 'The Sunken Passage', 'Amber Vault', 'Thorn Hollow', 'The Old Aquifer', 'Scorpion Keep', 'The Queen\'s Ascent'];

function makeLevel(index: number): Level {
  const walls = Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(1));
  const room = (left: number, top: number, width: number, height: number) => {
    for (let row = top; row < top + height; row++) {
      for (let column = left; column < left + width; column++) walls[row][column] = 0;
    }
  };
  const tunnel = (from: Point, to: Point) => {
    for (let column = Math.min(from.x, to.x); column <= Math.max(from.x, to.x); column++) walls[from.y][column] = 0;
    for (let row = Math.min(from.y, to.y); row <= Math.max(from.y, to.y); row++) walls[row][to.x] = 0;
  };
  room(1, 1, 5, 4);
  room(9, 1, 6, 3);
  room(19, 1, 5, 4);
  room(2, 7, 5, 3);
  room(10, 6, 5, 4);
  room(19, 7, 5, 3);
  room(2, 12, 6, 2);
  room(12, 12, 8, 2);
  tunnel(point(4, 2), point(11, 2));
  tunnel(point(13, 2), point(21, 3));
  tunnel(point(3, 4), point(3, 8));
  tunnel(point(5, 8), point(11, 8));
  tunnel(point(12, 3), point(12, 7));
  tunnel(point(21, 4), point(21, 8));
  tunnel(point(14, 8), point(20, 8));
  tunnel(point(4, 9), point(4, 12));
  tunnel(point(6, 12), point(13, 12));
  tunnel(point(13, 9), point(13, 12));
  tunnel(point(19, 13), point(23, 13));
  if (index % 3 > 0) {
    walls[8][8] = 1;
    tunnel(point(6, 7), point(6, 5));
    tunnel(point(6, 5), point(12, 5));
  }
  if (index % 3 === 2) {
    walls[2][17] = 1;
    tunnel(point(21, 9), point(21, 11));
    tunnel(point(16, 11), point(21, 11));
    tunnel(point(16, 11), point(16, 12));
  }
  const pebbleSpots = index % 2 === 0
    ? [point(2, 3), point(13, 1), point(3, 13)]
    : [point(4, 3), point(22, 2), point(10, 7)];
  const pickups: Pickup[] = pebbleSpots.map((position, id) => ({ ...position, kind: 'pebble', id: `pebble-${id}` }));
  pickups.push({ ...point(23, 8), kind: 'key', id: 'key' });
  [point(5, 7), point(10, 3), point(18, 12)].forEach((position, id) => pickups.push({ ...position, kind: 'amber', id: `amber-${id}` }));
  const enemies = [
    { start: point(11, 3), end: point(14, 1) },
    { start: point(20, 4), end: point(23, 2) },
    { start: point(19, 8), end: point(23, 9) },
  ];
  if (index > 1) enemies.push({ start: point(10, 8), end: point(14, 6) });
  if (index > 4) enemies.push({ start: point(15, 12), end: point(19, 13) });
  const level: Level = {
    name: names[index], walls, spawn: point(2, 2), exit: point(23, 13),
    gate: point(22, 13), water: point(21, 13), pickups, enemies,
    hazards: index === 0 ? [point(11, 8)] : [point(11, 8), point(4, 8), point(17, 12)],
    moss: [0x84af51, 0x3baaaa, 0x7daf72, 0xa6ad48, 0x418b70, 0x63a4a3, 0x9b9d48, 0x8cab55][index],
    rock: [0x8a9e93, 0x8298a1, 0x849b91, 0x99a18d, 0x799889, 0x8ca1a6, 0x919889, 0xa5b1a1][index],
  };
  if (index > 3) {
    level.walls = walls.map(row => [...row].reverse());
    const mirror = (position: Point) => { position.x = WIDTH - 1 - position.x; };
    [level.spawn, level.exit, level.gate, level.water, ...pickups, ...level.hazards].forEach(mirror);
    enemies.forEach(enemy => { mirror(enemy.start); mirror(enemy.end); });
  }
  return level;
}

export const LEVELS = Array.from({ length: 8 }, (_, index) => makeLevel(index));
