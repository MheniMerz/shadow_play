import { defineAssets } from '@iwsdk/core';
import { buildDuck, buildRabbit, buildWolf } from './game/creatures.js';
import { theatreFrame } from './scene-assets/theatre-frame.scene-asset.js';

// Deterministic prototypes are also available for isolated editor inspection.
export default defineAssets({
  theatreFrame,
  paperRabbit: buildRabbit().root,
  paperWolf: buildWolf().root,
  paperDuck: buildDuck().root,
});
