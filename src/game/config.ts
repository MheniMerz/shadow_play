/**
 * Stage layout, all in metres in stage-local space: origin at the centre of
 * the paper screen, +x to the player's right, +y up, +z toward the player.
 */
export const SCREEN_W = 0.44;
export const SCREEN_H = 0.32;

/** Where the stage sits relative to the player's head when placed. */
export const STAGE_DISTANCE = 0.55; // forward from the eyes
export const STAGE_DROP = 0.2; // below eye level

/**
 * The virtual lamp: beside the player's right shoulder, behind where the
 * hands go. Hands at ~0.2 m from the screen cast a shadow ~1.5x their size;
 * moving them toward the lamp makes it bigger, toward the screen smaller.
 */
export const LAMP_POS: [number, number, number] = [0.14, 0.02, 0.68];
/** Where the little lamp model sits: beside the player's right shoulder. */
export const LAMP_VISUAL_POS: [number, number, number] = [0.17, -0.03, 0.5];
export const LAMP_COLOR = 0xffd7a0;

/** Size ratio (lamp→screen / lamp→hand) that maps to creature scale 1. */
export const REFERENCE_RATIO = 1.4;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.2;

/** Seconds a correct shape must be held before the creature comes alive (on top of recognition). */
export const ALIVE_DELAY = 0.15;

/** Paper palette. */
export const INK = 0x1d1714;
export const PAPER = 0xf3e7d3;
export const GLOW_COLD = 0x8f8a84;
export const GLOW_WARM = 0xffb347;
