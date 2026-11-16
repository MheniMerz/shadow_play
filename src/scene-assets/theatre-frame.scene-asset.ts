/** Desk theatre, metres; paper centre at origin, audience on +Z. */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry } from '@iwsdk/core';
import { SCREEN_H, SCREEN_W } from '../game/config.js';
import { ellipse, inkMaterial, part, poly } from '../game/shapes2d.js';

export function buildTheatreFrame(): Group {
  const root = new Group();
  root.name = 'storybook-theatre-frame';
  const wood = new MeshStandardMaterial({ color: 0x1a2223, roughness: 0.88 });
  const edge = new MeshStandardMaterial({ color: 0x101618, roughness: 0.9 });
  const brass = new MeshStandardMaterial({ color: 0x857b60, metalness: 0.35, roughness: 0.65 });
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
  const paper = inkMaterial(0x11191b);
  const arch = new Shape();
  arch.moveTo(-0.22,0.16); arch.lineTo(0.22,0.16); arch.lineTo(0.22,0.105);
  arch.bezierCurveTo(0.17,0.15,0.08,0.143,0,0.148);
  arch.bezierCurveTo(-0.08,0.143,-0.17,0.15,-0.22,0.105);
  arch.closePath();
  for (let i=-5;i<=5;i++) arch.holes.push(ellipse(i*0.031,0.155,0.0016,0.0026,0,12));
  const canopy=part(arch,paper,'pierced-proscenium-arch');
  canopy.position.z=0.004;
  canopy.renderOrder=2;
  root.add(canopy);
  for (const side of [-1,1]) {
    const pts: [number,number][] = [[side*0.22,-0.16],[side*0.22,0.15],[side*0.205,0.13],[side*0.203,0.10],[side*0.211,0.065],[side*0.207,0.035],[side*0.214,-0.015],[side*0.209,-0.06],[side*0.214,-0.11],[side*0.205,-0.16]];
    const wing=part(poly(pts),paper,'torn-paper-stage-wing');
    wing.position.z=0.004; wing.renderOrder=2; root.add(wing);
  }
  block('pendant-stem',0,-y-0.02,-0.002,0.004,0.032,0.004,brass);
  const handleSocket = new Mesh(new CylinderGeometry(0.026, 0.026, 0.004, 32), brass);
  handleSocket.name = 'handle-socket';
  handleSocket.rotation.x = Math.PI / 2;
  handleSocket.position.set(0, -SCREEN_H / 2 - 0.045, -0.002);
  root.add(handleSocket);
  return root;
}

export const theatreFrame = buildTheatreFrame();
