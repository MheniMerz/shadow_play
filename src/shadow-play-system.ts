/**
 * Shadow Play's main system. Each frame:
 *   tracked hand joints → features → shape stabilizer (per hand)
 *   → the hand's shadow position and size on the paper (via the lamp)
 *   → level logic (creatures, objectives) → captions, sound, overlays.
 * The real shadow is rendered by the lamp's shadow map from the hand mesh;
 * recognition only decides when that shadow turns into a creature.
 */
import {
  Color,
  createSystem,
  type Entity,
  Group,
  Hovered,
  OneHandGrabbable,
  PCFShadowMap,
  Plane,
  Pressed,
  Quaternion,
  Raycaster,
  RayInteractable,
  Vector2,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { calibratedShapes, calibrateShape, relaxShape } from './hand/calibration.js';
import { computeFeatures, emptyFeatures, type Features, handCentroid } from './hand/features.js';
import type { Handedness } from './hand/joints.js';
import { GESTURES, SHAPE_IDS, SHAPES, type ShapeDef, type ShapeId, scoreShape } from './hand/shapes.js';
import { OpenCloseTracker, type ShapeEvent, ShapeStabilizer } from './hand/stabilizer.js';
import { SoundBoard } from './game/audio.js';
import { SCREEN_H, SCREEN_W } from './game/config.js';
import { DebugOverlay, saveClip } from './game/debug.js';
import { GhostHand } from './game/ghost-hand.js';
import { type DebugPose, HandInput } from './game/hands.js';
import { LEVELS } from './game/levels.js';
import { type LevelResult, Play, type PlayInput } from './game/play.js';
import { loadSave, type SaveData, storeSave } from './game/progress.js';
import { HandShadows } from './game/shadow-casters.js';
import { Stage } from './game/stage.js';
import { type Button, ButtonSet, drawLevelCard } from './game/ui.js';

type Mode = 'play' | 'map' | 'settings' | 'result';

interface PerHand {
  stab: ShapeStabilizer;
  features: Features;
  mouth: OpenCloseTracker;
  beak: OpenCloseTracker;
  events: ShapeEvent[];
  recent: Features[];
}

const params = new URLSearchParams(location.search);
const DEBUG_ALLOWED = params.has('debug') || import.meta.env.DEV;
/** Farthest wall (m) that wall mode will use; `?wallmax=` overrides for testing. */
const WALL_MAX = Number(params.get('wallmax')) || 2.5;

export class ShadowPlaySystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
  hovered: { required: [RayInteractable, Hovered] },
  planes: { required: [XRPlane] },
}) {
  private stage!: Stage;
  private stageEntity!: Entity;
  private handleEntity!: Entity;
  private uiEntity!: Entity;
  private game!: Play;
  private ghost!: GhostHand;
  private hands!: HandInput;
  private shadows!: HandShadows;
  private sound!: SoundBoard;
  private buttons!: ButtonSet;
  private debug!: DebugOverlay;
  private save!: SaveData;
  private shapes!: Record<ShapeId, ShapeDef>;
  private relaxed!: Record<ShapeId, ShapeDef>;
  private per!: Record<Handedness, PerHand>;

  private mode: Mode = 'play';
  private currentLevel = 1;
  private mapGroup!: Group;
  private mapEntity!: Entity;
  private settingsGroup!: Group;
  private settingsEntity!: Entity;
  private mapCards: Button[] = [];
  private mapUnroll = 1;
  private resultTimer = 0;
  private resultText = '';
  private summonShape: ShapeId | null = null;
  private calib = { shape: null as ShapeId | null, hold: 0, samples: [] as Features[] };
  private shadowK = 1;
  private placePending = 0;
  private wasImmersive = false;
  private recordCountdown = 0;
  private debugVisible = false;
  private notice: { text: string; t: number } | null = null;

  // scratch
  private readonly shadow2d = new Vector2();
  private readonly centroid = new Vector3();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly headPos = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly ray = new Raycaster();
  private readonly plane = new Plane();
  private readonly ndc = new Vector2();
  private readonly playInput: PlayInput = {
    dt: 0,
    time: 0,
    tracked: false,
    shadow: new Vector2(),
    ratio: 1.4,
    active: null,
    progress: { rabbit: 0, wolf: 0, duck: 0 },
    mouthEdge: null,
    mouthAmount: 0,
    beakEdge: null,
    beakAmount: 0,
  };
  private readonly emptyF = emptyFeatures();
  private readonly c3: [number, number, number] = [0, 0, 0];
  private readonly allowAll = new Set<ShapeId>(SHAPE_IDS);
  private readonly allowSets: Record<ShapeId, Set<ShapeId>> = { rabbit: new Set(['rabbit']), wolf: new Set(['wolf']), duck: new Set(['duck']) };

  init(): void {
    const renderer = this.renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;

    this.save = loadSave();
    this.rebuildShapes();
    const mk = (): PerHand => ({
      stab: new ShapeStabilizer({}, this.shapes),
      features: emptyFeatures(),
      mouth: new OpenCloseTracker(GESTURES.wolfMouth.open, GESTURES.wolfMouth.closed),
      beak: new OpenCloseTracker(GESTURES.duckBeak.open, GESTURES.duckBeak.closed),
      events: [],
      recent: [],
    });
    this.per = { left: mk(), right: mk() };

    // Stage and its grab handle
    this.stage = new Stage();
    this.stageEntity = this.world.createTransformEntity(this.stage.root, { persistent: true });
    this.handleEntity = this.world.createTransformEntity(this.stage.handle, { persistent: true });
    this.handleEntity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    this.uiEntity = this.world.createTransformEntity(new Group(), { parent: this.stageEntity, persistent: true });
    this.placeForDesktop();

    this.game = new Play({
      sfx: (s) => this.sound.play(s),
      complete: (r) => this.onLevelComplete(r),
    });
    this.stage.content.add(this.game.root);
    this.ghost = new GhostHand();
    this.stage.root.add(this.ghost.group);

    this.hands = new HandInput();
    this.shadows = new HandShadows(this.scene, params.get('shadow') === 'debug');
    this.shadows.forceProxy = params.get('shadow') === 'proxy';
    this.sound = new SoundBoard();
    this.sound.muted = this.save.settings.muted;
    this.buttons = new ButtonSet(this.world);
    this.debug = new DebugOverlay();
    this.debug.mesh.position.set(-SCREEN_W / 2 - 0.12, 0.0, 0.03);
    this.debug.mesh.rotation.y = 0.35;
    this.stage.root.add(this.debug.mesh);
    this.debugVisible = params.has('debug');

    this.buildUI();
    this.applyTextSettings();

    // Interaction plumbing
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        this.sound.resume();
        this.buttons.press(e);
      }),
      this.queries.hovered.subscribe('qualify', (e) => this.buttons.setHovered(e, true)),
      this.queries.hovered.subscribe('disqualify', (e) => this.buttons.setHovered(e, false)),
      this.world.visibilityState.subscribe((v) => {
        const immersive = v !== VisibilityState.NonImmersive;
        if (immersive && !this.wasImmersive) {
          this.placePending = this.save.settings.wallMode ? 1.2 : 0.4;
          this.sound.resume();
          this.sound.setHum(true);
        }
        if (!immersive && this.wasImmersive) {
          this.stage.setScale(1, 0.55);
          this.placeForDesktop();
        }
        this.wasImmersive = immersive;
        this.scene.background = immersive ? null : new Color(0x241c17);
      }),
    );
    this.scene.background = new Color(0x241c17);
    this.installDesktopControls();

    // Opening: straight onto the stage. Level 1 is the menu the first time.
    if (this.save.stars[1]) this.showMap(false);
    else this.startLevel(1);
  }

  // ------------------------------------------------------------- placement

  private placeForDesktop(): void {
    this.stage.setPose(new Vector3(0, 1.05, -0.55), new Quaternion());
  }

  private placeInFrontOfHead(): void {
    this.player.head.getWorldPosition(this.headPos);
    this.player.head.getWorldQuaternion(this.headQuat);
    if (this.save.settings.wallMode && this.placeOnWall()) return;
    this.stage.placeInFront(this.headPos, this.headQuat);
  }

  /**
   * Wall mode: find the detected vertical plane the player is looking at and
   * hang the (scaled-up) paper screen on it. Returns false if none is found.
   */
  private placeOnWall(): boolean {
    const head = this.headPos;
    const fwd = new Vector3(0, 0, -1).applyQuaternion(this.headQuat);
    fwd.y = 0;
    fwd.normalize();
    let bestT = Infinity;
    const bestPos = new Vector3();
    const bestN = new Vector3();
    const n = new Vector3();
    const p0 = new Vector3();
    const local = new Vector3();
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as globalThis.XRPlane | undefined;
      const obj = e.object3D;
      if (!plane || !obj || plane.orientation !== 'vertical') continue;
      obj.updateMatrixWorld(true);
      obj.getWorldPosition(p0);
      n.set(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(this.q)).normalize();
      const denom = fwd.dot(n);
      if (Math.abs(denom) < 0.3) continue; // too oblique
      const t = p0.clone().sub(head).dot(n) / denom;
      if (t < 0.4 || t > WALL_MAX || t >= bestT) continue;
      const hit = head.clone().addScaledVector(fwd, t);
      // inside the plane polygon's bounds (plane space x/z)?
      local.copy(hit);
      obj.worldToLocal(local);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const pt of plane.polygon) {
        minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
        minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z);
      }
      if (local.x < minX - 0.2 || local.x > maxX + 0.2 || local.z < minZ - 0.2 || local.z > maxZ + 0.2) continue;
      bestT = t;
      bestPos.copy(hit);
      bestN.copy(n);
    }
    if (!Number.isFinite(bestT)) {
      this.notice = { text: 'No wall found: face a wall within 2.5 m and try again', t: 3 };
      return false;
    }
    if (bestN.dot(head.clone().sub(bestPos)) < 0) bestN.negate();
    bestN.y = 0;
    bestN.normalize();
    // Scale so the lamp (0.68 m × k from the screen) always sits behind the player's head.
    const k = Math.max(1.5, bestT / 0.55);
    this.stage.setScale(k, bestT);
    // Screen centre at about eye height minus a little, 1 cm off the wall.
    const pos = bestPos.clone().addScaledVector(bestN, 0.01);
    pos.y = Math.max(head.y - 0.06 * k, 0.3 + 0.2 * k);
    const yaw = Math.atan2(bestN.x, bestN.z);
    this.stage.setPose(pos, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
    return true;
  }

  // -------------------------------------------------------------------- UI

  private buildUI(): void {
    const ui = this.uiEntity;
    const tab = { w: 0.06, h: 0.022, px: 256, font: '600 64px Georgia, serif' };
    const mapTab = this.buttons.create('tab-map', ui, 'Map', tab, () => this.showMap(false));
    mapTab.mesh.position.set(-SCREEN_W / 2 + 0.03, SCREEN_H / 2 + 0.07, 0.003);
    const setTab = this.buttons.create('tab-settings', ui, 'Settings', tab, () => this.showSettings());
    setTab.mesh.position.set(SCREEN_W / 2 - 0.03, SCREEN_H / 2 + 0.07, 0.003);

    // Level map: 4 × 2 paper cards on the screen
    this.mapGroup = new Group();
    this.mapGroup.name = 'level-map';
    this.mapEntity = this.world.createTransformEntity(this.mapGroup, { parent: ui, persistent: true });
    this.mapGroup.position.z = 0.004;
    LEVELS.forEach((lv, i) => {
      const b = this.buttons.create(`level-${lv.id}`, this.mapEntity, '', { w: 0.092, h: 0.11, px: 320 }, () => {
        if (this.isUnlocked(lv.id)) this.startLevel(lv.id);
      });
      b.mesh.position.set(-0.15 + (i % 4) * 0.1, 0.055 - Math.floor(i / 4) * 0.125, 0);
      this.mapCards.push(b);
    });

    // Settings: a column of toggles on the screen
    this.settingsGroup = new Group();
    this.settingsGroup.name = 'settings';
    this.settingsEntity = this.world.createTransformEntity(this.settingsGroup, { parent: ui, persistent: true });
    this.settingsGroup.position.z = 0.004;
    const s = this.save.settings;
    const rows: [string, () => string, () => void][] = [
      ['summon', () => `Creature cards: ${s.summon ? 'on' : 'off'}`, () => { s.summon = !s.summon; this.summonShape = null; }],
      ['large', () => `Large text: ${s.largeText ? 'on' : 'off'}`, () => { s.largeText = !s.largeText; this.applyTextSettings(); }],
      ['contrast', () => `High contrast: ${s.highContrast ? 'on' : 'off'}`, () => { s.highContrast = !s.highContrast; this.applyTextSettings(); }],
      ['sound', () => `Sound: ${s.muted ? 'off' : 'on'}`, () => { s.muted = !s.muted; this.sound.muted = s.muted; this.sound.setHum(!s.muted && this.wasImmersive); }],
      ['wall', () => `Stage on a real wall: ${s.wallMode ? 'on' : 'off'}`, () => { s.wallMode = !s.wallMode; if (this.wasImmersive) this.placeInFrontOfHead(); }],
      ['recenter', () => 'Move stage in front of me', () => { if (this.wasImmersive) this.placeInFrontOfHead(); else this.placeForDesktop(); }],
      ['recalibrate', () => 'Recalibrate my hand', () => { this.save.calibration = {}; this.rebuildShapes(); }],
      ['back', () => 'Back', () => this.showMap(false)],
    ];
    rows.forEach(([id, label, act], i) => {
      const col = i < 4 ? 0 : 1;
      const row = i % 4;
      const b = this.buttons.create(`set-${id}`, this.settingsEntity, label(), { w: 0.19, h: 0.05, px: 512 }, () => {
        act();
        b.text.set(label());
        storeSave(this.save);
      });
      b.mesh.position.set(-0.1 + col * 0.205, 0.09 - row * 0.062, 0);
    });

    // Summon cards (accessibility): look + pinch a card to call that creature
    (['rabbit', 'wolf', 'duck'] as const).forEach((id, i) => {
      const b = this.buttons.create(`summon-${id}`, ui, SHAPES[id].name, { w: 0.07, h: 0.03, px: 256, font: '600 60px Georgia, serif' }, () => {
        this.summonShape = this.summonShape === id ? null : id;
      });
      b.mesh.position.set(-0.085 + i * 0.085, -SCREEN_H / 2 - 0.085, 0.07);
      b.mesh.rotation.x = -0.6;
    });

    // Debug controls next to the overlay
    const recBtn = this.buttons.create('debug-rec', ui, 'Record 3 s', { w: 0.09, h: 0.025, px: 256, font: '600 48px sans-serif' }, () => {
      if (!this.debug.isRecording && this.recordCountdown <= 0) this.recordCountdown = 1;
    });
    recBtn.mesh.position.set(-SCREEN_W / 2 - 0.17, -0.14, 0.05);
    const lblBtn = this.buttons.create('debug-label', ui, 'Next label', { w: 0.09, h: 0.025, px: 256, font: '600 48px sans-serif' }, () => this.debug.cycleLabel());
    lblBtn.mesh.position.set(-SCREEN_W / 2 - 0.07, -0.14, 0.05);
  }

  private applyTextSettings(): void {
    const s = this.save.settings;
    this.stage.caption.setOptions({
      font: `italic 600 ${s.largeText ? 60 : 46}px Georgia, serif`,
      color: s.highContrast ? '#000000' : '#3a2a1e',
      background: s.highContrast ? '#ffffff' : '#ead8b8',
    });
    this.stage.captionMesh.scale.setScalar(s.largeText ? 1.2 : 1);
    this.refreshMap();
  }

  private isUnlocked(id: number): boolean {
    return id === 1 || (this.save.stars[id - 1] ?? 0) > 0 || (this.save.stars[id] ?? 0) > 0;
  }

  private refreshMap(): void {
    if (!this.mapCards.length) return;
    LEVELS.forEach((lv, i) => drawLevelCard(this.mapCards[i].text, lv.id, lv.name, this.save.stars[lv.id] ?? 0, !this.isUnlocked(lv.id), this.save.settings.highContrast));
  }

  private showMap(unroll: boolean): void {
    this.game.clear();
    this.mode = 'map';
    this.refreshMap();
    this.mapUnroll = unroll ? 0 : 1;
    this.sound.play('paper');
  }

  private showSettings(): void {
    this.game.clear();
    this.mode = 'settings';
  }

  private startLevel(id: number): void {
    const lv = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
    this.currentLevel = lv.id;
    this.mode = 'play';
    this.summonShape = null;
    for (const h of ['left', 'right'] as const) this.per[h].stab.reset();
    this.game.start(lv);
  }

  private onLevelComplete(r: LevelResult): void {
    const firstClear = !this.save.stars[r.level];
    this.save.stars[r.level] = Math.max(this.save.stars[r.level] ?? 0, r.stars);
    storeSave(this.save);
    this.mode = 'result';
    this.resultTimer = r.level === 1 && firstClear ? 1.2 : 2.5;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    this.resultText = r.level === LEVELS.length ? `The moon is up. Thank you for playing  ${stars}` : `${LEVELS[r.level - 1].name} cleared  ${stars}`;
  }

  // ----------------------------------------------------------- recognition

  private rebuildShapes(): void {
    this.shapes = calibratedShapes(this.save.calibration);
    this.relaxed = { rabbit: relaxShape(this.shapes.rabbit), wolf: relaxShape(this.shapes.wolf), duck: relaxShape(this.shapes.duck) };
    if (this.per) for (const h of ['left', 'right'] as const) this.per[h].stab.shapes = this.shapes;
  }

  /** Implicit calibration: the first time a shape is needed, learn from the player's own "close enough" pose. */
  private updateCalibration(hand: PerHand | null, need: ShapeId | null, dt: number): boolean {
    if (!need || this.save.calibration[need] || !hand?.stab.smoothed) {
      this.calib.shape = null;
      return false;
    }
    const f = hand.stab.smoothed;
    if (hand.stab.active === need) {
      // Comfortable already: remember that, using the recent frames.
      const good = hand.recent.filter((r) => scoreShape(SHAPES[need], r).score > 0.8);
      this.save.calibration[need] = calibrateShape(SHAPES[need], good.length ? good : [f]);
      storeSave(this.save);
      this.rebuildShapes();
      this.calib.shape = null;
      return false;
    }
    const close = scoreShape(this.relaxed[need], f).score > 0.6;
    if (!close) {
      this.calib = { shape: null, hold: 0, samples: [] };
      return false;
    }
    this.calib.shape = need;
    this.calib.hold += dt;
    this.calib.samples.push({ ...f });
    if (this.calib.hold >= 1.0) {
      this.save.calibration[need] = calibrateShape(SHAPES[need], this.calib.samples);
      storeSave(this.save);
      this.rebuildShapes();
      this.calib = { shape: null, hold: 0, samples: [] };
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- update

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.1);
    const now = performance.now();

    if (this.placePending > 0) {
      this.placePending -= dt;
      if (this.placePending <= 0) this.placeInFrontOfHead();
    }
    this.stage.follow();
    this.hands.update(this.world, this.stage);

    // Recognition per hand
    const need = this.mode === 'play' ? this.game.needed : null;
    let player: Handedness | null = null;
    let best = -1;
    for (const side of ['left', 'right'] as const) {
      const st = this.hands.hands[side];
      const ph = this.per[side];
      ph.events.length = 0;
      if (st.tracked) computeFeatures(st.joints, side, ph.features);
      ph.stab.allowed = need ? this.allowSets[need] : this.allowAll;
      ph.stab.update(st.tracked ? ph.features : null, now, ph.events);
      if (ph.stab.smoothed && st.tracked) {
        ph.recent.push({ ...ph.stab.smoothed });
        if (ph.recent.length > 30) ph.recent.shift();
      }
      if (!st.tracked) continue;
      const score = (need && ph.stab.active === need ? 10 : 0) + (need ? ph.stab.progress(need, now) : 0) + (side === 'right' ? 0.01 : 0);
      if (score > best) {
        best = score;
        player = side;
      }
    }
    const ph = player ? this.per[player] : null;
    const calibrating = this.updateCalibration(ph, need, dt);

    // Shadow position and size
    const inp = this.playInput;
    inp.dt = dt;
    inp.time = time;
    inp.tracked = false;
    if (player) {
      const c = handCentroid(this.hands.hands[player].joints, this.c3);
      this.v.set(c[0], c[1], c[2]);
      const ratio = this.stage.projectShadow(this.v, this.shadow2d);
      if (ratio > 0) {
        inp.tracked = true;
        inp.shadow.copy(this.shadow2d);
        inp.ratio = ratio * (1.4 / this.stage.referenceRatio);
      }
    }
    for (const id of SHAPE_IDS) inp.progress[id] = ph ? ph.stab.progress(id, now) : 0;
    inp.active = ph?.stab.active ?? null;
    inp.mouthEdge = null;
    inp.beakEdge = null;
    const sm = ph?.stab.smoothed;
    if (sm && inp.active === 'wolf') {
      inp.mouthEdge = ph.mouth.update(sm[GESTURES.wolfMouth.feature]);
      inp.mouthAmount = ph.mouth.amount(sm[GESTURES.wolfMouth.feature]);
    } else {
      ph?.mouth.reset();
      inp.mouthAmount = 0;
    }
    if (sm && inp.active === 'duck') {
      inp.beakEdge = ph.beak.update(sm[GESTURES.duckBeak.feature]);
      inp.beakAmount = ph.beak.amount(sm[GESTURES.duckBeak.feature]);
    } else {
      ph?.beak.reset();
      inp.beakAmount = 0;
    }
    this.applySummon(inp);

    // Modes
    this.mapGroup.visible = this.mode === 'map';
    this.settingsGroup.visible = this.mode === 'settings';
    for (const id of ['rabbit', 'wolf', 'duck']) this.buttons.setVisible(`summon-${id}`, this.save.settings.summon && this.mode === 'play');
    this.buttons.setVisible('tab-map', this.mode === 'play' || this.mode === 'settings');
    this.buttons.setVisible('tab-settings', this.mode !== 'settings');
    this.buttons.setVisible('debug-rec', this.debugVisible);
    this.buttons.setVisible('debug-label', this.debugVisible);

    let caption = '';
    if (this.mode === 'play') {
      this.game.update(inp);
      caption = calibrating ? 'Hold it… learning your hand' : this.game.displayCaption;
    } else if (this.mode === 'map') {
      this.mapUnroll = Math.min(1, this.mapUnroll + dt * 1.6);
      const k = this.mapUnroll;
      this.mapGroup.scale.set(1, k * k * (3 - 2 * k), 1);
      this.mapGroup.position.y = (1 - k) * 0.12;
      caption = 'Choose a scene: look at it and pinch';
    } else if (this.mode === 'settings') {
      caption = 'Settings';
    }
    if (this.notice) {
      this.notice.t -= dt;
      caption = this.notice.text;
      if (this.notice.t <= 0) this.notice = null;
    } else if (this.mode === 'result') {
      caption = this.resultText;
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.showMap(this.currentLevel === 1);
    }
    this.stage.caption.set(caption);

    // Ghost hand, lamp and shadow strength
    this.ghost.show = this.mode === 'play' && (this.game.wantGhostHand || calibrating);
    if (need) this.ghost.setShape(need);
    this.ghost.update(dt);
    this.shadowK += ((this.game.creatureAlive ? 0.3 : 1) - this.shadowK) * Math.min(1, dt * 6);
    this.stage.setShadowStrength(this.shadowK);
    this.stage.setLampWarmth(need ? inp.progress[need] : 0);
    this.shadows.update(this.world, this.hands.hands);

    // Debug overlay and clip recording
    this.debug.mesh.visible = this.debugVisible;
    if (this.debugVisible) {
      this.debug.draw({
        dt,
        source: player ? this.hands.hands[player].source : '-',
        handedness: player,
        features: sm ?? null,
        shapes: this.shapes,
        active: inp.active,
        needed: need,
        ratio: inp.ratio,
        calibrated: SHAPE_IDS.filter((s) => this.save.calibration[s]).map((s) => s[0]).join('') || '-',
      });
    }
    if (this.recordCountdown > 0) {
      this.recordCountdown -= dt;
      this.debug.setStatus(`get ready… ${Math.ceil(this.recordCountdown)}`);
      if (this.recordCountdown <= 0) this.debug.startRecording(now, player ?? 'right');
    }
    if (this.debug.isRecording) {
      const side = player ?? 'right';
      const st = this.hands.hands[side];
      const clip = this.debug.record(now, st.tracked ? st.joints : null);
      if (clip) {
        this.debug.setStatus('saving…');
        saveClip(clip).then((msg) => this.debug.setStatus(msg));
      }
    }
    void this.emptyF;
  }

  /** Accessibility: a summoned creature acts as if its shape were held; pinch opens mouth/beak. */
  private applySummon(inp: PlayInput): void {
    if (!this.save.settings.summon || !this.summonShape || this.mode !== 'play') return;
    inp.active = this.summonShape;
    inp.progress[this.summonShape] = 1;
    const pinch = this.input.xr.getSelectState('right').active || this.input.xr.getSelectState('left').active || this.hands.debugOpen > 0.5;
    const tracker = this.summonShape === 'wolf' ? this.per.right.mouth : this.per.right.beak;
    const edge = tracker.update(pinch ? 1e3 : -1e3);
    if (this.summonShape === 'wolf') {
      inp.mouthEdge = edge;
      inp.mouthAmount = pinch ? 1 : 0;
    } else if (this.summonShape === 'duck') {
      inp.beakEdge = edge;
      inp.beakAmount = pinch ? 1 : 0;
    }
    if (!inp.tracked) {
      inp.tracked = true;
      inp.shadow.set(0, 0);
      inp.ratio = 1.4;
    }
  }

  // ------------------------------------------------------- desktop controls

  private installDesktopControls(): void {
    const keys: Record<string, DebugPose> = { Digit1: 'rabbit', Digit2: 'wolf', Digit3: 'duck', Digit4: 'openHand', Digit5: 'fist', Digit0: 'relaxed', Digit9: null };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code in keys) this.hands.debugPose = keys[e.code];
      const t = this.hands.debugTarget;
      if (e.code === 'ArrowLeft') t.x -= 0.02;
      if (e.code === 'ArrowRight') t.x += 0.02;
      if (e.code === 'ArrowUp') t.y += 0.02;
      if (e.code === 'ArrowDown') t.y -= 0.02;
      if (e.code === 'KeyW') t.z = Math.min(0.42, t.z + 0.02);
      if (e.code === 'KeyS') t.z = Math.max(0.06, t.z - 0.02);
      if (e.code === 'Space') this.hands.debugOpen = 1;
      if (e.code === 'Backquote' && DEBUG_ALLOWED) this.debugVisible = !this.debugVisible;
      if (e.code === 'KeyR' && this.debugVisible && this.recordCountdown <= 0) this.recordCountdown = 1;
      if (e.code === 'KeyM') this.showMap(false);
      this.sound.resume();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.hands.debugOpen = 0;
    };
    const canvas = this.renderer.domElement;
    const onMove = (e: PointerEvent) => {
      if (!this.hands.debugPose || this.wasImmersive) return;
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(this.ndc, this.camera);
      this.stage.root.getWorldQuaternion(this.q);
      const n = this.v.set(0, 0, 1).applyQuaternion(this.q);
      this.plane.setFromNormalAndCoplanarPoint(n, this.stage.root.getWorldPosition(this.headPos));
      const hit = this.ray.ray.intersectPlane(this.plane, this.centroid);
      if (hit) {
        this.stage.root.worldToLocal(hit);
        this.hands.debugTarget.x = Math.max(-0.2, Math.min(0.2, hit.x));
        this.hands.debugTarget.y = Math.max(-0.14, Math.min(0.14, hit.y));
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!this.hands.debugPose) return;
      const t = this.hands.debugTarget;
      t.z = Math.max(0.06, Math.min(0.42, t.z - Math.sign(e.deltaY) * 0.015));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('keyup', onKeyUp),
      () => canvas.removeEventListener('pointermove', onMove),
      () => canvas.removeEventListener('wheel', onWheel),
    );

    // Automation hook for tests and the emulator (window.shadowPlay).
    (window as unknown as { shadowPlay: unknown }).shadowPlay = {
      pose: (pose: DebugPose, x = 0, y = 0, z = 0.2, open = 0) => {
        this.hands.debugPose = pose;
        Object.assign(this.hands.debugTarget, { x, y, z });
        this.hands.debugOpen = open;
      },
      startLevel: (id: number) => this.startLevel(id),
      showMap: () => this.showMap(false),
      state: () => ({
        mode: this.mode,
        level: this.currentLevel,
        stage: this.game.stageIndex,
        needed: this.game.needed,
        alive: this.game.creatureAlive,
        caption: this.stage.caption.canvas ? this.game.displayCaption : '',
        active: { left: this.per.left.stab.active, right: this.per.right.stab.active },
        scores: { ...this.per.right.stab.scores },
        shadow: [+this.playInput.shadow.x.toFixed(3), +this.playInput.shadow.y.toFixed(3)],
        ratio: +this.playInput.ratio.toFixed(2),
        creature: this.game.creatureInfo,
        stars: { ...this.save.stars },
        calibration: this.save.calibration,
      }),
      debug: (on: boolean) => (this.debugVisible = on),
      enterXR: () => this.world.launchXR(),
      buttonScreenPos: (id: string) => {
        const b = this.buttons.byId.get(id);
        if (!b) return null;
        const v = b.mesh.getWorldPosition(new Vector3()).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      wallMode: (on: boolean) => {
        this.save.settings.wallMode = on;
        if (this.wasImmersive) this.placeInFrontOfHead();
        return { k: this.stage.k, ref: +this.stage.referenceRatio.toFixed(2), planes: this.queries.planes.entities.size };
      },
      xrInfo: () => ({
        immersive: this.wasImmersive,
        hands: (['left', 'right'] as const).map((h) => ({ h, tracked: this.hands.hands[h].tracked, source: this.hands.hands[h].source, wrist: Array.from(this.hands.hands[h].joints.slice(0, 3)).map((n) => +n.toFixed(3)) })),
        shadowCasters: this.shadows.describe(this.world),
        stage: this.stage.root.position.toArray().map((n) => +n.toFixed(3)),
        head: this.player.head.getWorldPosition(new Vector3()).toArray().map((n) => +n.toFixed(3)),
      }),
      resetSave: () => {
        localStorage.clear();
        location.reload();
      },
    };
  }
}
