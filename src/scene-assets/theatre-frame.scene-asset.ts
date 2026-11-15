/** Desk theatre, metres; paper centre at origin, audience on +Z. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';
import { SCREEN_H, SCREEN_W } from '../game/config.js';

export function buildTheatreFrame(): Group {
  const root = new Group();
  root.name = 'storybook-theatre-frame';
  const wood = new MeshStandardMaterial({ color: 0x324441, roughness: 0.78 });
  const edge = new MeshStandardMaterial({ color: 0x182d2e, roughness: 0.9 });
  const brass = new MeshStandardMaterial({ color: 0xd6b778, metalness: 0.55, roughness: 0.45 });
  const block = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat = wood) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, z);
    root.add(m);
  };
  const x = SCREEN_W / 2 + 0.009;
  const y = SCREEN_H / 2 + 0.009;
  for (const side of [-1, 1]) {
    block('carved-upright', side * x, 0, -0.004, 0.018, SCREEN_H + 0.036, 0.026);
    block('brass-inlay', side * (x - 0.006), 0, 0.010, 0.0014, SCREEN_H + 0.012, 0.001);
    block('upright-shadow', side * (x + 0.006), 0, 0.01, 0.003, SCREEN_H + 0.025, 0.002, edge);
    block('top-and-bottom-rail', 0, side * y, -0.004, SCREEN_W + 0.036, 0.018, 0.026);
    block('rail-inlay', 0, side * (y - 0.006), 0.010, SCREEN_W + 0.012, 0.0014, 0.001, brass);
    block('foot', side * (SCREEN_W / 2 - 0.026), -y - 0.016, 0.003, 0.044, 0.014, 0.09);
    block('foot-trim', side * (SCREEN_W / 2 - 0.026), -y - 0.021, 0.01, 0.048, 0.004, 0.095, edge);
    for (const end of [-1, 1]) {
      const pin = new Mesh(new SphereGeometry(0.003, 8, 6), brass);
      pin.name = 'brass-corner-pin';
      pin.scale.z = 0.3;
      pin.position.set(side * x, end * y, 0.011);
      root.add(pin);
    }
  }
  // A narrow shelf makes the cut-paper screen feel seated inside the frame.
  block('stage-apron', 0, -y - 0.002, 0.014, SCREEN_W + 0.045, 0.009, 0.045, edge);
  const handleSocket = new Mesh(new CylinderGeometry(0.026, 0.026, 0.004, 32), brass);
  handleSocket.name = 'handle-socket';
  handleSocket.rotation.x = Math.PI / 2;
  handleSocket.position.set(0, -SCREEN_H / 2 - 0.045, -0.002);
  root.add(handleSocket);
  return root;
}

export const theatreFrame = buildTheatreFrame();
