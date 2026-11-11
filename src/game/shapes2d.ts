/** Small helpers for flat paper cut-out shapes. */
import { Color, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from '@iwsdk/core';

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, seg = 32): Shape {
  const s = new Shape();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    const px = cx + x * Math.cos(rot) - y * Math.sin(rot);
    const py = cy + x * Math.sin(rot) + y * Math.cos(rot);
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  return s;
}

export function poly(points: [number, number][]): Shape {
  const s = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Smooth closed curve through points (Catmull-Rom style via quadratic midpoints). */
export function blob(points: [number, number][]): Shape {
  const s = new Shape();
  const n = points.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(points[n - 1], points[0]);
  s.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const m = mid(p, points[(i + 1) % n]);
    s.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  return s;
}

export function inkMaterial(color: number | Color = 0x1d1714, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

export function part(shape: Shape | Shape[], mat: MeshBasicMaterial, name = ''): Mesh {
  const m = new Mesh(new ShapeGeometry(shape, 12), mat);
  m.name = name;
  return m;
}

/** A pivoted sub-group, so a part can rotate around a joint. */
export function pivot(x: number, y: number, ...children: Mesh[]): Group {
  const g = new Group();
  g.position.set(x, y, 0);
  for (const c of children) {
    c.position.x -= x;
    c.position.y -= y;
    g.add(c);
  }
  return g;
}
