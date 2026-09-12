import * as THREE from 'three';
import { Game } from './game';
import { WIDTH, HEIGHT } from './levels';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
const box = new THREE.BoxGeometry(1, 1, 1);
const stone = new THREE.IcosahedronGeometry(1, 0);
const up = new THREE.Vector3(0, 1, 0);
const materials = new Map<string, THREE.MeshStandardMaterial>();
const material = (color: number, glow = 0) => {
  const key = `${color}-${glow}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.68, emissive: color, emissiveIntensity: glow }));
  return materials.get(key)!;
};

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material, position: number[], scale: number[]) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(position[0], position[1], position[2]);
  object.scale.set(scale[0], scale[1], scale[2]);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function limb(parent: THREE.Object3D, from: number[], to: number[], radius: number, color: number) {
  const start = new THREE.Vector3(...from as [number, number, number]);
  const end = new THREE.Vector3(...to as [number, number, number]);
  const object = mesh(parent, cylinder, material(color), start.clone().add(end).multiplyScalar(0.5).toArray(), [radius, start.distanceTo(end), radius]);
  object.quaternion.setFromUnitVectors(up, end.sub(start).normalize());
  return object;
}

function insect(scorpion = false, queen = false) {
  const group = new THREE.Group();
  const body = scorpion ? 0x9f5474 : queen ? 0xf3bd4e : 0xf55b2f;
  const dark = scorpion ? 0x59354c : 0x782e23;
  mesh(group, sphere, material(body), [0, 0.36, -0.3], [0.25, 0.25, 0.34]);
  mesh(group, sphere, material(body), [0, 0.35, 0.06], [0.17, 0.18, 0.19]);
  mesh(group, sphere, material(body), [0, 0.38, 0.34], [0.23, 0.21, 0.23]);
  for (const side of [-1, 1]) {
    mesh(group, sphere, material(0xf8efda), [side * 0.16, 0.47, 0.47], [0.075, 0.078, 0.06]);
    mesh(group, sphere, material(0x172621), [side * 0.16, 0.48, 0.516], [0.036, 0.046, 0.024]);
    if (!scorpion) {
      limb(group, [side * 0.11, 0.53, 0.38], [side * 0.2, 0.73, 0.53], 0.023, dark);
      limb(group, [side * 0.2, 0.73, 0.53], [side * 0.29, 0.73, 0.67], 0.023, body);
    }
  }
  const legs: THREE.Group[] = [];
  for (let index = 0; index < 3; index++) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.1, 0.27, (index - 1) * 0.21);
      limb(leg, [0, 0, 0], [side * 0.28, -0.015, (index - 1) * 0.12], 0.035, body);
      limb(leg, [side * 0.28, -0.015, (index - 1) * 0.12], [side * 0.37, -0.24, (index - 1) * 0.21], 0.028, dark);
      group.add(leg);
      legs.push(leg);
    }
  }
  if (scorpion) {
    for (const side of [-1, 1]) {
      limb(group, [side * 0.18, 0.32, 0.26], [side * 0.4, 0.28, 0.6], 0.06, body);
      mesh(group, sphere, material(body), [side * 0.41, 0.3, 0.73], [0.14, 0.1, 0.2]);
      limb(group, [side * 0.42, 0.3, 0.78], [side * 0.29, 0.3, 0.95], 0.04, 0xe6b5ba);
    }
    const tail = [[0, 0.43, -0.5], [0, 0.65, -0.76], [0, 0.92, -0.7], [0, 1.08, -0.48], [0, 0.99, -0.24]];
    tail.forEach((position, index) => {
      mesh(group, sphere, material(index === 4 ? 0xf2d3b7 : body), position, [0.095, 0.11, 0.12]);
      if (index) limb(group, tail[index - 1], position, 0.075, body);
    });
    group.scale.setScalar(0.88);
  }
  if (queen) {
    group.scale.setScalar(1.2);
    for (let index = 0; index < 3; index++) {
      mesh(group, new THREE.ConeGeometry(0.055, 0.22, 5), material(0xffd667, 0.6), [(index - 1) * 0.12, 0.66, 0.35], [1, 1, 1]);
    }
  }
  group.userData.legs = legs;
  return group;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 120);
  private terrain = new THREE.Group();
  private entities = new THREE.Group();
  private ant = insect();
  private scorpions: THREE.Group[] = [];
  private pickups = new Map<string, THREE.Group>();
  private gate = new THREE.Group();
  private bridge = new THREE.Group();
  private water!: THREE.Mesh;
  private exit!: THREE.Mesh;
  private queen = insect(false, true);
  private hazardMeshes: THREE.Mesh[] = [];
  private pulse: THREE.Mesh;
  private marker: THREE.Mesh;
  private playerLight = new THREE.PointLight(0xffb272, 7, 3.5, 2);
  private cameraTarget = new THREE.Vector3();
  private cameraWidth = 32;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private loaded = -1;
  overview = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: import.meta.env.VITE_TEST_MODE === '1' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.domElement.setAttribute('aria-label', 'Fire Ant underground game world');
    this.renderer.domElement.setAttribute('role', 'img');
    host.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xe8fff0, 0x263f3c, 2.5));
    const sun = new THREE.DirectionalLight(0xfff0da, 4.2);
    sun.position.set(-9, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 55 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x78c6bc, 2);
    rim.position.set(5, 6, -10);
    this.scene.add(rim);
    const shadowGround = mesh(this.scene, new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.24 }), [0, -2.1, 0], [1, 1, 1]);
    shadowGround.rotation.x = -Math.PI / 2;
    shadowGround.castShadow = false;
    this.scene.add(this.terrain, this.entities, this.ant, this.playerLight);
    this.marker = mesh(this.scene, new THREE.RingGeometry(0.51, 0.56, 48), new THREE.MeshBasicMaterial({ color: 0xffdc95, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), [0, 0.05, 0], [1, 1, 1]);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.castShadow = false;
    this.pulse = mesh(this.scene, new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffc680, transparent: true, opacity: 0.65, side: THREE.DoubleSide }), [0, 0.1, 0], [1, 1, 1]);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.castShadow = false;
    this.camera.position.set(0, 27, 21);
    this.camera.lookAt(0, 0, 0);
    this.resize();
  }

  resize() {
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight);
  }

  private load(game: Game) {
    this.terrain.clear();
    this.entities.clear();
    this.pickups.clear();
    this.scorpions = [];
    this.hazardMeshes = [];
    this.gate = new THREE.Group();
    this.bridge = new THREE.Group();
    this.loaded = game.levelIndex;
    const level = game.level;
    mesh(this.terrain, box, material(0x3b534a), [0, -0.7, 0], [WIDTH, 1.35, HEIGHT]);
    mesh(this.terrain, box, material(0x556960), [0, -1.42, 0], [WIDTH - 0.35, 0.2, HEIGHT - 0.3]);
    mesh(this.terrain, box, material(0x253c34), [0, -1.67, 0], [WIDTH - 0.8, 0.3, HEIGHT - 0.7]);
    const dummy = new THREE.Object3D();
    const cells = level.walls.flat().filter(Boolean).length;
    const walls = new THREE.InstancedMesh(box, material(level.rock), cells);
    walls.castShadow = walls.receiveShadow = true;
    const caps = new THREE.InstancedMesh(box, material(level.moss), cells);
    caps.castShadow = caps.receiveShadow = true;
    const rocks = new THREE.InstancedMesh(stone, material(0x496b50), cells);
    rocks.castShadow = rocks.receiveShadow = true;
    let cursor = 0;
    for (let row = 0; row < HEIGHT; row++) {
      for (let column = 0; column < WIDTH; column++) {
        const worldX = column - 12;
        const worldZ = row - 7;
        const seed = Math.abs(Math.sin(column * 17.13 + row * 61.7 + game.levelIndex) * 43758) % 1;
        if (level.walls[row][column]) {
          const height = 0.64 + seed * 0.16;
          dummy.position.set(worldX, height / 2, worldZ);
          dummy.scale.set(1.005, height, 1.005);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          walls.setMatrixAt(cursor, dummy.matrix);
          walls.setColorAt(cursor, new THREE.Color(level.rock).multiplyScalar(0.86 + seed * 0.25));
          dummy.position.y = height + 0.035;
          dummy.scale.set(0.99, 0.08, 0.99);
          dummy.updateMatrix();
          caps.setMatrixAt(cursor, dummy.matrix);
          caps.setColorAt(cursor, new THREE.Color(level.moss).multiplyScalar(0.65 + seed * 0.5));
          dummy.position.set(worldX + seed * 0.3, height + 0.12, worldZ - seed * 0.22);
          dummy.scale.set(0.18 + seed * 0.17, 0.1 + seed * 0.14, 0.2);
          dummy.rotation.y = seed * Math.PI;
          dummy.updateMatrix();
          rocks.setMatrixAt(cursor++, dummy.matrix);
          if (seed > 0.72 && (column < 2 || column > 22 || row < 2 || row > 12)) this.plant(worldX, height, worldZ, seed);
          if (seed < 0.12) this.mushroom(worldX, height, worldZ, seed);
        } else if (seed > 0.45) {
          mesh(this.terrain, stone, material(0x637164), [worldX + seed * 0.3, 0.015, worldZ - 0.25], [0.045, 0.04, 0.08]);
        }
      }
    }
    this.terrain.add(walls, caps, rocks);
    for (let index = 0; index < 18; index++) {
      const crystal = mesh(this.terrain, new THREE.ConeGeometry(0.12, 0.6, 5), material(index % 3 ? 0x8ee0bb : 0xf3c066, 0.2), [-11.5 + index * 1.33, -0.42, 7.02], [1, 1, 1]);
      crystal.rotation.z = Math.sin(index * 13) * 0.45;
    }
    for (const pickup of level.pickups) {
      const group = new THREE.Group();
      group.position.set(pickup.x - 12, 0.12, pickup.y - 7);
      if (pickup.kind === 'pebble') {
        mesh(group, stone, material(0xe5efdc, 0.15), [0, 0.2, 0], [0.24, 0.21, 0.2]);
        const ring = mesh(group, new THREE.RingGeometry(0.3, 0.33, 24), new THREE.MeshBasicMaterial({ color: 0xc7eab3, side: THREE.DoubleSide }), [0, -0.08, 0], [1, 1, 1]);
        ring.rotation.x = -Math.PI / 2;
      } else if (pickup.kind === 'amber') {
        mesh(group, new THREE.OctahedronGeometry(0.24), material(0xf2bc58, 0.3), [0, 0.32, 0], [0.8, 1.5, 0.8]);
      } else {
        const loop = mesh(group, new THREE.TorusGeometry(0.16, 0.06, 8, 16), material(0xffd168, 0.45), [0, 0.51, 0], [1, 1, 1]);
        loop.rotation.y = Math.PI / 2;
        mesh(group, box, material(0xffd168, 0.45), [0, 0.25, 0], [0.09, 0.35, 0.09]);
        mesh(group, box, material(0xffd168, 0.45), [0, 0.13, 0.09], [0.09, 0.09, 0.2]);
      }
      this.entities.add(group);
      this.pickups.set(pickup.id, group);
    }
    this.gate.position.set(level.gate.x - 12, 0, level.gate.y - 7);
    for (let index = 0; index < 4; index++) {
      mesh(this.gate, box, material(0xdbc389, 0.08), [0, 0.46, (index - 1.5) * 0.23], [0.11, 0.9, 0.085]);
    }
    mesh(this.gate, box, material(0x7c5b39), [0, 0.8, 0], [0.14, 0.14, 0.94]);
    this.entities.add(this.gate);
    this.water = mesh(this.entities, box, material(0x35aab7, 0.25), [level.water.x - 12, 0.025, level.water.y - 7], [0.98, 0.055, 0.97]);
    this.bridge.position.set(level.water.x - 12, 0, level.water.y - 7);
    for (let index = 0; index < 3; index++) {
      mesh(this.bridge, stone, material(0xd8e2ca), [(index - 1) * 0.29, 0.08, 0], [0.26, 0.15, 0.44]);
    }
    this.entities.add(this.bridge);
    this.exit = mesh(this.entities, new THREE.TorusGeometry(0.36, 0.055, 8, 40), material(0x8dffbc, 0.9), [level.exit.x - 12, 0.12, level.exit.y - 7], [1, 1, 1]);
    this.exit.rotation.x = -Math.PI / 2;
    for (const hazard of level.hazards) {
      const grate = mesh(this.entities, cylinder, material(0x3b5950), [hazard.x - 12, 0.045, hazard.y - 7], [0.43, 0.07, 0.43]);
      for (let index = 0; index < 3; index++) {
        const vent = mesh(this.entities, new THREE.ConeGeometry(0.1, 0.4, 5), material(0xc6dc80, 0.3), [hazard.x - 12 + (index - 1) * 0.23, 0.2, hazard.y - 7], [1, 1, 1]);
        grate.userData.vents ??= [];
        grate.userData.vents.push(vent);
      }
      this.hazardMeshes.push(grate);
    }
    for (const enemy of game.enemies) {
      const model = insect(true);
      model.position.set(enemy.x - 12, 0, enemy.y - 7);
      this.entities.add(model);
      this.scorpions.push(model);
    }
    if (game.levelIndex === 7) {
      this.queen.position.set(level.exit.x - 12, 0, level.exit.y - 7);
      this.entities.add(this.queen);
    }
  }

  private plant(x: number, y: number, z: number, seed: number) {
    const height = 0.65 + seed * 0.5;
    limb(this.terrain, [x, y, z], [x, y + height, z], 0.035, 0x375a35);
    for (let index = 0; index < 5; index++) {
      for (const side of [-1, 1]) {
        const leaf = mesh(this.terrain, sphere, material(index % 2 ? 0xa6c65c : 0x5c9a50), [x + side * (0.14 + index * 0.025), y + 0.15 + index * 0.16, z], [0.25 - index * 0.02, 0.035, 0.085]);
        leaf.rotation.z = side * 0.4;
        leaf.rotation.y = seed * 2;
      }
    }
  }

  private mushroom(x: number, y: number, z: number, seed: number) {
    for (let index = 0; index < 2; index++) {
      const offset = index * 0.27;
      mesh(this.terrain, cylinder, material(0xd9d5bb), [x + offset, y + 0.17, z], [0.035, 0.34, 0.035]);
      mesh(this.terrain, sphere, material(seed < 0.055 ? 0xe58e67 : 0x99d5c2), [x + offset, y + 0.35, z], [0.2, 0.09, 0.2]);
    }
  }

  render(game: Game, elapsed: number, now: number) {
    if (this.loaded !== game.levelIndex || this.scorpions.length !== game.enemies.length) this.load(game);
    const motion = this.reducedMotion ? 0 : now;
    const running = game.mode === 'playing';
    this.ant.position.set(game.player.x - 12, 0, game.player.y - 7);
    this.ant.rotation.y = game.angle;
    this.ant.visible = game.invulnerable === 0 || !running || Math.sin(now * 24) > -0.35;
    const animate = (model: THREE.Group, speed: number) => {
      (model.userData.legs as THREE.Group[]).forEach((leg, index) => { leg.rotation.y = Math.sin(motion * speed + index * Math.PI * 0.65) * 0.32; });
    };
    animate(this.ant, running && game.moving ? 18 : 2);
    this.marker.position.set(this.ant.position.x, 0.065, this.ant.position.z);
    this.playerLight.position.set(this.ant.position.x, 1.2, this.ant.position.z);
    this.pulse.position.set(this.ant.position.x, 0.15, this.ant.position.z);
    this.pulse.visible = game.pulseTime > 0;
    this.pulse.scale.setScalar((1 - game.pulseTime / 0.6) * 3.4 + 0.3);
    (this.pulse.material as THREE.MeshBasicMaterial).opacity = game.pulseTime;
    game.enemies.forEach((enemy, index) => {
      const model = this.scorpions[index];
      model.position.set(enemy.x - 12, 0, enemy.y - 7);
      model.rotation.y = enemy.angle;
      model.rotation.z = enemy.stun > 0 ? Math.sin(motion * 10) * 0.15 : 0;
      animate(model, enemy.stun > 0 || !running ? 1 : 10);
    });
    const present = new Set(game.pickups.map(pickup => pickup.id));
    this.pickups.forEach((model, id) => {
      model.visible = present.has(id);
      model.position.y = 0.08 + Math.sin(motion * 2.2 + model.position.x) * 0.07;
      model.rotation.y = motion * 0.55;
    });
    this.gate.position.y = THREE.MathUtils.damp(this.gate.position.y, game.hasKey ? -1.1 : 0, 8, elapsed);
    this.bridge.children.forEach((child, index) => { child.visible = index < game.filled; });
    this.water.scale.y = 0.055 + Math.sin(motion * 3) * 0.008;
    this.exit.scale.setScalar(game.exitReady ? 1 + Math.sin(motion * 4) * 0.1 : 0.85);
    this.exit.material = material(game.exitReady ? 0x8dffbc : 0x668d7c, game.exitReady ? 1.2 : 0.1);
    this.hazardMeshes.forEach((hazard, index) => {
      const active = game.hazardActive(game.level.hazards[index]);
      (hazard.userData.vents as THREE.Mesh[]).forEach(vent => { vent.scale.y = active ? 1 + Math.sin(motion * 12) * 0.25 : 0.05; });
    });
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const follow = aspect < 1.25 && game.mode !== 'ready' && !this.overview;
    const targetWidth = follow ? 12 : Math.max(28, 16.5 * aspect);
    this.cameraWidth = THREE.MathUtils.damp(this.cameraWidth, targetWidth, 5, elapsed);
    const target = new THREE.Vector3(follow ? this.ant.position.x : 0, 0, follow ? this.ant.position.z : 0);
    this.cameraTarget.lerp(target, 1 - Math.exp(-elapsed * 7));
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(0, 27, 21));
    this.camera.lookAt(this.cameraTarget);
    this.camera.left = -this.cameraWidth / 2;
    this.camera.right = this.cameraWidth / 2;
    this.camera.top = this.cameraWidth / aspect / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  reset() { this.loaded = -1; }

  playerScreenPosition() {
    const position = this.ant.position.clone().add(new THREE.Vector3(0, 1.1, 0)).project(this.camera);
    return { x: (position.x + 1) / 2 * this.host.clientWidth, y: (1 - position.y) / 2 * this.host.clientHeight };
  }
}
