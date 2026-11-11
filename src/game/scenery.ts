/** Paper-theatre scenery: hills, ponds, walls and props cut from dark paper. */
import { Group, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';
import { SCREEN_H, SCREEN_W } from './config.js';
import type { Prop, SceneDef } from './levels.js';
import { blob, ellipse, inkMaterial, part, poly } from './shapes2d.js';

const BOTTOM = -SCREEN_H / 2;
const TOP = SCREEN_H / 2;
const LEFT = -SCREEN_W / 2;
const RIGHT = SCREEN_W / 2;

const HILL = 0x4a3a2e;
const WATER = 0x34465a;
const PROP = 0x3f3027;

function clampX(x: number) {
  return Math.max(LEFT, Math.min(RIGHT, x));
}

function hill(x0: number, x1: number, y: number, seed: number): Mesh {
  x0 = clampX(x0);
  x1 = clampX(x1);
  const pts: [number, number][] = [[x0, BOTTOM]];
  const n = Math.max(2, Math.round((x1 - x0) / 0.03));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const bump = i === 0 || i === n ? 0 : Math.sin(seed * 3.1 + i * 1.7) * 0.003;
    pts.push([x, y + bump]);
  }
  pts.push([x1, BOTTOM]);
  return part(poly(pts), inkMaterial(HILL, 0.92), 'hill');
}

function pond(x0: number, x1: number, y: number): Group {
  const g = new Group();
  g.name = 'pond';
  g.add(part(poly([[x0, BOTTOM], [x0, y], [x1, y], [x1, BOTTOM]]), inkMaterial(WATER, 0.75), 'water'));
  // ripple lines
  for (let k = 0; k < 3; k++) {
    const yy = y - 0.012 - k * 0.012;
    for (let x = x0 + 0.01 + k * 0.008; x < x1 - 0.02; x += 0.04) {
      const r = part(ellipse(x + 0.01, yy, 0.012, 0.0015), inkMaterial(0xb8c4cc, 0.35), 'ripple');
      r.position.z = 0.0002;
      g.add(r);
    }
  }
  return g;
}

function propMesh(p: Prop): Group {
  const g = new Group();
  g.name = `prop-${p.kind}`;
  const s = p.s ?? 1;
  const m = inkMaterial(PROP, 0.95);
  switch (p.kind) {
    case 'grass':
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.008 * s;
        const h = (0.025 + ((i * 7) % 3) * 0.008) * s;
        g.add(part(poly([[x - 0.003 * s, 0], [x + (i - 2) * 0.004 * s, h], [x + 0.003 * s, 0]]), m));
      }
      break;
    case 'lantern': {
      g.add(part(poly([[-0.002, 0], [-0.002, 0.06], [0.002, 0.06], [0.002, 0]]), m));
      g.add(part(poly([[0.002, 0.058], [0.02, 0.058], [0.02, 0.055], [0.002, 0.055]]), m));
      const glow = part(ellipse(0.02, 0.044, 0.016, 0.016), inkMaterial(0xffc46b, 0.35), 'lantern-glow');
      glow.position.z = -0.0002;
      g.add(glow);
      g.add(part(blob([[0.012, 0.05], [0.028, 0.05], [0.026, 0.036], [0.014, 0.036]]), inkMaterial(0xffa53a, 0.9), 'lantern-paper'));
      break;
    }
    case 'carrot':
      g.add(part(poly([[-0.005, 0.0], [0.005, 0.0], [0.0, 0.028]]), inkMaterial(0xc4631f, 0.95)));
      g.add(part(poly([[-0.005, 0.0], [-0.008, -0.01], [0, -0.004], [0.008, -0.01], [0.005, 0.0]]), m));
      g.rotation.z = Math.PI; // leaves up
      g.position.y = 0.028;
      break;
    case 'flag':
      g.add(part(poly([[-0.0015, 0], [-0.0015, 0.06], [0.0015, 0.06], [0.0015, 0]]), m));
      g.add(part(poly([[0.0015, 0.06], [0.025, 0.05], [0.0015, 0.04]]), inkMaterial(0xa8342a, 0.9)));
      break;
    case 'fence':
      for (let x = -0.2; x <= 0.2; x += 0.04) g.add(part(poly([[x - 0.003, 0], [x - 0.003, 0.06], [x, 0.066], [x + 0.003, 0.06], [x + 0.003, 0]]), m));
      g.add(part(poly([[-0.21, 0.04], [0.21, 0.04], [0.21, 0.047], [-0.21, 0.047]]), m));
      g.add(part(poly([[-0.21, 0.015], [0.21, 0.015], [0.21, 0.022], [-0.21, 0.022]]), m));
      break;
    case 'tree':
      g.add(part(poly([[-0.006, 0], [-0.004, 0.1], [0.004, 0.1], [0.006, 0]]), m));
      g.add(part(poly([[0, 0.09], [0.035, 0.13], [0.038, 0.127], [0.003, 0.085]]), m));
      g.add(part(poly([[0, 0.07], [-0.03, 0.1], [-0.033, 0.097], [-0.002, 0.065]]), m));
      g.add(part(poly([[0, 0.11], [0.02, 0.15], [0.023, 0.148], [0.002, 0.105]]), m));
      break;
    case 'stars':
      for (const [x, y, r] of [[-0.15, 0.03, 1], [-0.07, 0.06, 0.7], [0.02, 0.02, 0.8], [0.15, 0.04, 0.6], [-0.18, 0.07, 0.5]] as const) {
        const st = part(ellipse(x, y, 0.003 * r, 0.003 * r), inkMaterial(0xffe2a0, 0.8), 'star');
        g.add(st);
      }
      break;
  }
  g.position.set(p.x, p.y + g.position.y, 0);
  return g;
}

/** Build the scenery for one scene. Walls are drawn floor-to-ceiling with a door gap. */
export function buildScenery(scene: SceneDef): Group {
  const root = new Group();
  root.name = 'scenery';
  scene.platforms.forEach((p, i) => root.add(hill(p.x0, p.x1, p.y, i + 1)));
  for (const pd of scene.ponds ?? []) root.add(pond(pd.x0, pd.x1, pd.y));
  for (const w of scene.walls ?? []) {
    const doorTop = w.doorTop ?? BOTTOM;
    const groundY = scene.platforms.find((p) => w.x >= p.x0 && w.x <= p.x1)?.y ?? BOTTOM;
    root.add(part(poly([[w.x - w.w / 2, doorTop], [w.x - w.w / 2, TOP], [w.x + w.w / 2, TOP], [w.x + w.w / 2, doorTop]]), inkMaterial(HILL, 0.95), 'wall'));
    // door frame arch
    if (w.doorTop != null) {
      root.add(part(ellipse(w.x, doorTop, w.w * 0.9, 0.006), inkMaterial(PROP, 1), 'door-lintel'));
      void groundY;
    }
  }
  for (const p of scene.props ?? []) root.add(propMesh(p));
  root.traverse((o) => (o.renderOrder = 1));
  return root;
}

export function buildCrow(): Group {
  const g = new Group();
  g.name = 'crow';
  const m = inkMaterial(0x15110f, 1);
  g.add(part(blob([[-0.016, 0.004], [-0.004, -0.006], [0.012, -0.004], [0.016, 0.006], [0.006, 0.012], [-0.01, 0.01]]), m));
  g.add(part(ellipse(0.014, 0.014, 0.006, 0.006), m));
  g.add(part(poly([[0.019, 0.016], [0.028, 0.013], [0.019, 0.011]]), m));
  g.add(part(poly([[-0.016, 0.004], [-0.026, 0.0], [-0.024, 0.008]]), m));
  const wing = new Group();
  wing.name = 'wing';
  wing.add(part(poly([[0, 0], [-0.02, 0.016], [-0.006, 0.002]]), m));
  wing.position.set(0.002, 0.006, 0.0003);
  g.add(wing);
  const eye = part(ellipse(0.016, 0.016, 0.0015, 0.0015), inkMaterial(0xf3e7d3, 1));
  eye.position.z = 0.0004;
  g.add(eye);
  return g;
}

export function buildMoon(): Group {
  const g = new Group();
  g.name = 'moon';
  const face = part(ellipse(0, 0, 0.03, 0.03), inkMaterial(0xfff1c8, 0.95), 'moon-face');
  g.add(face);
  const lid = inkMaterial(0x6b5a40, 0.9);
  for (const sx of [-1, 1]) {
    const e = part(ellipse(sx * 0.01, 0.004, 0.006, 0.0015), lid, 'moon-eye');
    e.position.z = 0.0003;
    g.add(e);
  }
  const mouth = part(ellipse(0, -0.01, 0.006, 0.002), lid, 'moon-mouth');
  mouth.position.z = 0.0003;
  g.add(mouth);
  return g;
}

export function buildFirefly(): Group {
  const g = new Group();
  g.name = 'firefly';
  const glow = part(ellipse(0, 0, 0.01, 0.01), inkMaterial(0xffe27a, 0.25), 'firefly-glow');
  const dot = part(ellipse(0, 0, 0.0025, 0.0025), inkMaterial(0xfff4b0, 0.95), 'firefly-dot');
  dot.position.z = 0.0002;
  g.add(glow, dot);
  return g;
}

export function setOpacity(g: Group, k: number): void {
  g.traverse((o) => {
    const m = (o as Mesh).material as MeshBasicMaterial | undefined;
    if (m && 'opacity' in m) {
      m.userData.baseOpacity ??= m.opacity;
      m.opacity = (m.userData.baseOpacity as number) * k;
    }
  });
}
