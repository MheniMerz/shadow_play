/**
 * Paper-card buttons drawn on or around the screen. Every button is an ECS
 * entity with RayInteractable, so it works with hand ray + pinch on Quest,
 * gaze + pinch where gaze is enabled, and mouse clicks on the desktop.
 */
import { type Entity, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, RayInteractable, type World } from '@iwsdk/core';
import { TextCanvas } from './canvas.js';

export interface Button {
  id: string;
  mesh: Mesh;
  entity: Entity;
  text: TextCanvas;
  onPress: () => void;
  enabled: boolean;
  hovered: boolean;
}

export interface ButtonStyle {
  w: number;
  h: number;
  px?: number;
  font?: string;
  background?: string;
  color?: string;
}

export class ButtonSet {
  readonly buttons = new Map<number, Button>();
  readonly byId = new Map<string, Button>();

  constructor(private readonly world: World) {}

  create(id: string, parent: Entity, label: string, style: ButtonStyle, onPress: () => void): Button {
    const px = style.px ?? 512;
    const text = new TextCanvas(px, Math.round((px * style.h) / style.w), {
      font: style.font ?? '600 40px Georgia, serif',
      background: style.background ?? '#ead8b8',
      color: style.color ?? '#2a211b',
    });
    text.set(label);
    const mesh = new Mesh(new PlaneGeometry(style.w, style.h), new MeshBasicMaterial({ map: text.texture, transparent: true, depthWrite: false }));
    mesh.name = `btn-${id}`;
    mesh.renderOrder = 3;
    const entity = this.world.createTransformEntity(mesh, { parent, persistent: true });
    entity.addComponent(RayInteractable);
    const b: Button = { id, mesh, entity, text, onPress, enabled: true, hovered: false };
    this.buttons.set(entity.index, b);
    this.byId.set(id, b);
    return b;
  }

  press(entity: Entity): void {
    const b = this.buttons.get(entity.index);
    if (b && b.enabled && b.mesh.visible && isVisible(b.mesh)) b.onPress();
  }

  setVisible(id: string, v: boolean): void {
    const b = this.byId.get(id);
    if (b) b.mesh.visible = v;
  }

  setHovered(entity: Entity, h: boolean): void {
    const b = this.buttons.get(entity.index);
    if (!b) return;
    b.hovered = h;
    b.mesh.scale.setScalar(h ? 1.06 : 1);
  }
}

function isVisible(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Draw a level-map card: number, name, stars, lock. */
export function drawLevelCard(t: TextCanvas, id: number, name: string, stars: number, locked: boolean, highContrast: boolean): void {
  const g = t.ctx;
  const { width: w, height: h } = t.canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = locked ? (highContrast ? '#555' : '#cdbb9c') : highContrast ? '#fff' : '#efe0c4';
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 12, 22);
  g.fill();
  g.strokeStyle = highContrast ? '#000' : '#6b4f35';
  g.lineWidth = highContrast ? 8 : 4;
  g.stroke();
  g.fillStyle = highContrast ? '#000' : '#2a211b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px Georgia, serif';
  g.fillText(locked ? '·' : String(id), w / 2, h * 0.36);
  g.font = 'italic 600 34px Georgia, serif';
  g.fillText(locked ? 'locked' : name, w / 2, h * 0.64, w - 30);
  g.font = '40px serif';
  g.fillStyle = highContrast ? '#b36b00' : '#c98a1c';
  g.fillText(locked ? '' : '★'.repeat(stars) + '☆'.repeat(3 - stars), w / 2, h * 0.85);
  t.commit();
}
