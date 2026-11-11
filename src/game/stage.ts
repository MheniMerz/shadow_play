/**
 * The paper theatre: a paper screen on the desk, a virtual lamp beside the
 * player's shoulder, and a grab handle under the screen to move it.
 * The lamp is a real shadow-casting spot light, so the tracked hand casts a
 * true shadow on the paper every frame.
 */
import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SpotLight,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { paperTexture, TextCanvas } from './canvas.js';
import { LAMP_COLOR, LAMP_POS, LAMP_VISUAL_POS, SCREEN_H, SCREEN_W, STAGE_DISTANCE, STAGE_DROP } from './config.js';

const HANDLE_OFFSET = new Vector3(0, -SCREEN_H / 2 - 0.045, 0.05);

export class Stage {
  readonly root = new Group();
  /** 2D content drawn on the paper (scenery, creatures, outlines). z = 0 is the paper surface. */
  readonly content = new Group();
  readonly screen: Mesh;
  readonly lamp: SpotLight;
  readonly lampVisual = new Group();
  readonly handle: Mesh;
  readonly caption: TextCanvas;
  readonly captionMesh: Mesh;
  private readonly bulbMat: MeshBasicMaterial;
  private readonly screenMat: MeshStandardMaterial;
  private readonly lampWorld = new Vector3();
  private readonly planeOrigin = new Vector3();
  private readonly planeNormal = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly q = new Quaternion();
  /** Stage scale: 1 on the desk, larger when the screen is on a far wall. */
  k = 1;
  /** Size ratio for a hand at a comfortable distance; creature scale 1 maps to this. */
  referenceRatio = 1.4;

  constructor() {
    this.root.name = 'shadow-stage';

    // Paper screen
    this.screenMat = new MeshStandardMaterial({ map: paperTexture(), roughness: 1, metalness: 0 });
    this.screen = new Mesh(new PlaneGeometry(SCREEN_W, SCREEN_H), this.screenMat);
    this.screen.name = 'paper-screen';
    this.screen.receiveShadow = true;
    this.root.add(this.screen);

    // Thin wooden frame and two little feet
    const wood = new MeshStandardMaterial({ color: 0x5b3b24, roughness: 0.8 });
    const t = 0.012;
    const bars: [number, number, number, number][] = [
      [0, SCREEN_H / 2 + t / 2, SCREEN_W + 2 * t, t],
      [0, -SCREEN_H / 2 - t / 2, SCREEN_W + 2 * t, t],
      [-SCREEN_W / 2 - t / 2, 0, t, SCREEN_H],
      [SCREEN_W / 2 + t / 2, 0, t, SCREEN_H],
    ];
    for (const [x, y, w, h] of bars) {
      const bar = new Mesh(new BoxGeometry(w, h, 0.01), wood);
      bar.position.set(x, y, 0);
      this.root.add(bar);
    }
    for (const sx of [-1, 1]) {
      const foot = new Mesh(new BoxGeometry(0.02, 0.012, 0.09), wood);
      foot.position.set(sx * (SCREEN_W / 2 - 0.03), -SCREEN_H / 2 - t - 0.006, 0.0);
      this.root.add(foot);
    }

    this.content.name = 'screen-content';
    this.content.position.z = 0.001;
    this.root.add(this.content);

    // Caption strip above the screen: one line of instructions, never more.
    this.caption = new TextCanvas(1024, 96, { font: 'italic 600 46px Georgia, serif', color: '#3a2a1e', background: '#ead8b8' });
    this.captionMesh = new Mesh(
      new PlaneGeometry(SCREEN_W, (SCREEN_W * 96) / 1024),
      new MeshBasicMaterial({ map: this.caption.texture, transparent: true, depthWrite: false }),
    );
    this.captionMesh.name = 'caption';
    this.captionMesh.position.set(0, SCREEN_H / 2 + 0.032, 0.002);
    this.root.add(this.captionMesh);

    // Lamp: a warm spot light beside the player's right shoulder.
    this.lamp = new SpotLight(LAMP_COLOR, 6, 2.5, 0.62, 0.35, 1.2);
    this.lamp.name = 'lamp-light';
    this.lamp.position.set(...LAMP_POS);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.camera.near = 0.05;
    this.lamp.shadow.camera.far = 1.3;
    this.lamp.shadow.bias = -0.0004;
    this.lamp.shadow.normalBias = 0.002;
    this.lamp.shadow.radius = 2;
    const target = new Object3D();
    this.root.add(target);
    this.lamp.target = target;
    this.root.add(this.lamp);
    this.root.add(new AmbientLight(0xfff1e0, 0.35));

    // Small paper lamp visual at the light's position (kept low so it stays out of the way).
    this.bulbMat = new MeshBasicMaterial({ color: new Color(LAMP_COLOR) });
    const shade = new Mesh(
      new ConeGeometry(0.035, 0.04, 20, 1, true),
      new MeshStandardMaterial({ color: 0xe9d3a8, roughness: 1, side: 2, emissive: 0x6a4a20, emissiveIntensity: 0.6 }),
    );
    shade.rotation.x = Math.PI / 2; // opening faces the screen
    const bulb = new Mesh(new SphereGeometry(0.012, 12, 8), this.bulbMat);
    const stem = new Mesh(new CylinderGeometry(0.003, 0.003, 0.08), wood);
    stem.position.set(0, -0.05, 0.01);
    this.lampVisual.add(shade, bulb, stem);
    this.lampVisual.position.set(...LAMP_VISUAL_POS);
    this.lampVisual.lookAt(0, 0, 0);
    this.lampVisual.name = 'lamp-visual';
    this.root.add(this.lampVisual);

    // Grab handle: a paper tab under the screen. It is a separate root object;
    // the stage follows it each frame (see follow()).
    this.handle = new Mesh(
      new CircleGeometry(0.022, 24),
      new MeshStandardMaterial({ color: 0xc9a574, roughness: 0.9, emissive: 0x3a2610, emissiveIntensity: 0.3 }),
    );
    this.handle.name = 'stage-handle';
    const grip = new Mesh(new BoxGeometry(0.026, 0.004, 0.003), new MeshBasicMaterial({ color: 0x5b3b24 }));
    for (const dy of [-0.006, 0, 0.006]) {
      const g = grip.clone();
      g.position.set(0, dy, 0.002);
      this.handle.add(g);
    }
  }

  /** Put the stage in front of a head pose (seated, desk height). */
  placeInFront(headPos: Vector3, headQuat: Quaternion): void {
    this.setScale(1, STAGE_DISTANCE);
    const fwd = this.tmp.set(0, 0, -1).applyQuaternion(headQuat);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const pos = this.tmp2.copy(headPos).addScaledVector(fwd, STAGE_DISTANCE);
    pos.y = headPos.y - STAGE_DROP;
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    this.q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    this.setPose(pos, this.q);
  }

  /**
   * Scale the whole theatre (wall mode). The lamp keeps its place relative to
   * the screen, so it ends up just behind the player; its light range and
   * shadow camera scale with it.
   */
  setScale(k: number, headToScreen: number): void {
    this.k = k;
    this.root.scale.setScalar(k);
    this.lamp.distance = 2.5 * k;
    this.lamp.shadow.camera.near = 0.05 * k;
    this.lamp.shadow.camera.far = 1.3 * k;
    this.lamp.shadow.camera.updateProjectionMatrix();
    this.lampVisual.visible = k < 1.2;
    // A hand held ~35 cm in front of the eyes should give creature scale 1.
    const lampToScreen = LAMP_POS[2] * k;
    const handToScreen = Math.max(0.1, headToScreen - 0.35);
    this.referenceRatio = k === 1 ? 1.4 : lampToScreen / Math.max(0.05, lampToScreen - handToScreen);
  }

  /** Set the stage pose directly (handle follows). */
  setPose(pos: Vector3, quat: Quaternion): void {
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.root.updateMatrixWorld(true);
    this.handle.position.copy(HANDLE_OFFSET).multiplyScalar(this.k).applyQuaternion(quat).add(pos);
    this.handle.quaternion.copy(quat);
    this.handle.updateMatrixWorld(true);
  }

  /** Make the stage follow the (possibly grabbed) handle. */
  follow(): void {
    this.root.quaternion.copy(this.handle.quaternion);
    this.root.position.copy(HANDLE_OFFSET).multiplyScalar(this.k).applyQuaternion(this.handle.quaternion).negate().add(this.handle.position);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Project a world point through the lamp onto the paper.
   * Returns false if the point is not between lamp and screen.
   * `out2d` receives screen-local x,y (metres); the return value is the size
   * ratio (lamp→screen / lamp→point), i.e. how much bigger the shadow is.
   */
  projectShadow(world: Vector3, out2d: Vector2): number {
    this.lamp.getWorldPosition(this.lampWorld);
    this.screen.getWorldPosition(this.planeOrigin);
    this.planeNormal.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(this.q));
    const dir = this.tmp.copy(world).sub(this.lampWorld);
    const denom = dir.dot(this.planeNormal);
    if (Math.abs(denom) < 1e-6) return 0;
    const t = this.tmp2.copy(this.planeOrigin).sub(this.lampWorld).dot(this.planeNormal) / denom;
    if (t < 1) return 0; // point is behind the screen or behind the lamp
    const hit = this.tmp2.copy(this.lampWorld).addScaledVector(dir, t);
    this.root.worldToLocal(hit);
    out2d.set(hit.x, hit.y);
    return t;
  }

  /** Screen-local (x, y) to world, on the paper surface. */
  screenToWorld(x: number, y: number, out: Vector3): Vector3 {
    return this.root.localToWorld(out.set(x, y, 0.001));
  }

  setLampWarmth(w: number): void {
    this.lamp.intensity = (4.5 + 2.5 * w) * this.k ** 1.2;
  }

  /** Dim the real hand shadow while a creature is alive (0..1). */
  setShadowStrength(s: number): void {
    this.lamp.shadow.intensity = s;
  }
}
