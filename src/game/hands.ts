/**
 * Hand input for the game: reads the 25 WebXR joints of each tracked hand
 * into world space every frame, or produces a synthetic "debug hand" on the
 * desktop (keys 1/2/3, mouse to move, wheel for distance) so the whole game
 * loop can be played and tested without a headset.
 */
import { Matrix4, Quaternion, Vector3, type World } from '@iwsdk/core';
import type { Handedness } from '../hand/joints.js';
import { JOINT_NAMES } from '../hand/joints.js';
import { type HandPoseSpec, POSES, synthHand } from '../hand/synthetic.js';
import { LAMP_POS } from './config.js';
import type { Stage } from './stage.js';

export interface HandState {
  handedness: Handedness;
  tracked: boolean;
  source: 'xr' | 'debug';
  /** 25 joints × xyz, world metres. */
  joints: Float32Array;
  /** 25 joint radii, metres (from WebXR when available). */
  radii: Float32Array;
}

function makeState(handedness: Handedness): HandState {
  return { handedness, tracked: false, source: 'xr', joints: new Float32Array(75), radii: new Float32Array(25).fill(0.008) };
}

export type DebugPose = 'rabbit' | 'wolf' | 'duck' | 'relaxed' | 'openHand' | 'fist' | null;

/** Orientation of the debug hand in stage space so its shadow reads well. */
export function debugBasis(pose: DebugPose): Quaternion {
  const m = new Matrix4();
  // Columns: where the hand's local x (radial, mirrored for right), y (fingers), z (dorsal) point in stage space.
  if (pose === 'wolf' || pose === 'openHand' || pose === 'relaxed' || pose === 'fist') {
    m.makeBasis(new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1));
  } else if (pose === 'duck') {
    m.makeBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0));
  } else {
    // rabbit: fingers up, leaning a little to the right, back of the hand to the lamp
    m.makeRotationZ(-0.3);
  }
  return new Quaternion().setFromRotationMatrix(m);
}

export class HandInput {
  readonly hands: Record<Handedness, HandState> = { left: makeState('left'), right: makeState('right') };

  /** Desktop debug hand (right hand). */
  debugPose: DebugPose = null;
  /** Mouth/beak open amount for the debug wolf/duck, 0..1. */
  debugOpen = 0;
  /** Target shadow position on the paper (screen-local metres) and hand distance from the paper. */
  readonly debugTarget = { x: 0, y: 0, z: 0.2 };

  private readonly mats = new Float32Array(16 * 25);
  private readonly radiiBuf = new Float32Array(25);
  private readonly spaces: XRJointSpace[] = [];
  private readonly origin = new Matrix4();
  private readonly v = new Vector3();
  private readonly lampLocal = new Vector3(...LAMP_POS);
  private readonly q = new Quaternion();
  private readonly qStage = new Quaternion();

  update(world: World, stage: Stage): void {
    this.hands.left.tracked = false;
    this.hands.right.tracked = false;
    const frame = world.xrFrame;
    const ref = world.xrReferenceSpace;
    if (frame && ref) {
      world.player.updateMatrixWorld(true);
      this.origin.copy(world.player.matrixWorld);
      for (const src of frame.session.inputSources) {
        if (!src.hand || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
        this.readXRHand(frame, ref, src);
      }
    }
    if (this.debugPose) this.writeDebugHand(stage);
  }

  private readXRHand(frame: XRFrame, ref: XRReferenceSpace, src: XRInputSource): void {
    const hand = src.hand as XRHand;
    const state = this.hands[src.handedness as Handedness];
    this.spaces.length = 0;
    for (const name of JOINT_NAMES) {
      const s = hand.get(name as XRHandJoint);
      if (!s) return;
      this.spaces.push(s);
    }
    const f = frame as XRFrame & {
      fillPoses?: (spaces: XRSpace[], base: XRSpace, out: Float32Array) => boolean;
      fillJointRadii?: (spaces: XRJointSpace[], out: Float32Array) => boolean;
    };
    const ok = f.fillPoses?.(this.spaces, ref, this.mats) ?? false;
    if (!ok) return;
    f.fillJointRadii?.(this.spaces, this.radiiBuf);
    for (let i = 0; i < 25; i++) {
      this.v.set(this.mats[i * 16 + 12], this.mats[i * 16 + 13], this.mats[i * 16 + 14]).applyMatrix4(this.origin);
      state.joints[i * 3] = this.v.x;
      state.joints[i * 3 + 1] = this.v.y;
      state.joints[i * 3 + 2] = this.v.z;
      state.radii[i] = this.radiiBuf[i] || 0.008;
    }
    state.tracked = true;
    state.source = 'xr';
  }

  private writeDebugHand(stage: Stage): void {
    const pose = this.debugPose as DebugPose;
    let spec: HandPoseSpec;
    switch (pose) {
      case 'wolf':
        spec = POSES.wolf(this.debugOpen);
        break;
      case 'duck':
        spec = POSES.duck(this.debugOpen);
        break;
      case 'rabbit':
        spec = POSES.rabbit();
        break;
      case 'openHand':
        spec = POSES.openHand();
        break;
      case 'fist':
        spec = POSES.fist();
        break;
      default:
        spec = POSES.relaxed();
    }
    const qLocal = debugBasis(pose);
    const j = synthHand(spec, { handedness: 'right', rotation: [qLocal.x, qLocal.y, qLocal.z, qLocal.w] });
    // Centre the joints on their centroid, then place the centroid on the
    // lamp ray that hits the target screen point at the chosen distance.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < 25; i++) {
      cx += j[i * 3];
      cy += j[i * 3 + 1];
      cz += j[i * 3 + 2];
    }
    cx /= 25;
    cy /= 25;
    cz /= 25;
    const L = this.lampLocal;
    const { x, y, z } = this.debugTarget;
    const k = (L.z - z) / L.z; // fraction of the way from lamp to screen
    const px = L.x + (x - L.x) * k;
    const py = L.y + (y - L.y) * k;
    const state = this.hands.right;
    stage.root.getWorldQuaternion(this.qStage);
    for (let i = 0; i < 25; i++) {
      this.v.set(j[i * 3] - cx + px, j[i * 3 + 1] - cy + py, j[i * 3 + 2] - cz + z);
      stage.root.localToWorld(this.v);
      state.joints[i * 3] = this.v.x;
      state.joints[i * 3 + 1] = this.v.y;
      state.joints[i * 3 + 2] = this.v.z;
    }
    state.radii.fill(0.0085);
    state.tracked = true;
    state.source = 'debug';
    void this.q;
  }
}
