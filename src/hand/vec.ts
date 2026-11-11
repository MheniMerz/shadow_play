/**
 * Tiny allocation-light vector helpers over flat Float32Array joint buffers.
 * Kept dependency-free so the recognition code runs unchanged in Node tests
 * and in the headset.
 */

export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];

export function readJoint(buf: ArrayLike<number>, i: number, out: V3): V3 {
  out[0] = buf[i * 3];
  out[1] = buf[i * 3 + 1];
  out[2] = buf[i * 3 + 2];
  return out;
}

export function sub(a: V3, b: V3, out: V3 = v3()): V3 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

export function add(a: V3, b: V3, out: V3 = v3()): V3 {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

export function scale(a: V3, s: number, out: V3 = v3()): V3 {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
  return out;
}

export const dot = (a: V3, b: V3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function cross(a: V3, b: V3, out: V3 = v3()): V3 {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export const length = (a: V3): number => Math.sqrt(dot(a, a));

export function normalize(a: V3, out: V3 = v3()): V3 {
  const l = length(a) || 1;
  return scale(a, 1 / l, out);
}

export function distance(a: V3, b: V3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Unsigned angle between two vectors, in degrees. */
export function angleDeg(a: V3, b: V3): number {
  const la = length(a);
  const lb = length(b);
  if (la === 0 || lb === 0) return 0;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Rotate vector v around a unit axis by angle (radians), Rodrigues formula. */
export function rotateAxis(v: V3, axis: V3, angle: number, out: V3 = v3()): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = axis;
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  out[0] = v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c);
  out[1] = v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c);
  out[2] = v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c);
  return out;
}
