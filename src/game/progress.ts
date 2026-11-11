/** Progress and settings saved on the device (localStorage, guarded). */
import type { CalibrationData } from '../hand/calibration.js';

export interface SaveData {
  version: 1;
  /** Best stars per level id (0 = not cleared). */
  stars: Record<number, number>;
  calibration: CalibrationData;
  settings: { summon: boolean; largeText: boolean; highContrast: boolean; wallMode: boolean; muted: boolean };
}

const KEY = 'shadow-play.save.v1';

export function defaultSave(): SaveData {
  return { version: 1, stars: {}, calibration: {}, settings: { summon: false, largeText: false, highContrast: false, wallMode: false, muted: false } };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) }, stars: d.stars ?? {}, calibration: d.calibration ?? {} };
  } catch {
    return defaultSave();
  }
}

export function storeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // private window or storage blocked: progress lives for this session only
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
