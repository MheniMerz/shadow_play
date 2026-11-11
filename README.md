# Shadow Play

Make hand shadows on your real wall and watch them come alive. A mixed-reality
puzzle game for Meta Quest 3 / 3S, built with the
[Immersive Web SDK (IWSDK)](https://iwsdk.dev) for the Meta VR Start Developer
Competition (Gaming track, New Experience division).

A paper screen stands on your desk with a lamp beside you. Your tracked hand
casts a **real shadow** on the paper. Form a rabbit, wolf or duck and hold
it: the shadow turns into a living creature that follows your hand. Bring
your hand toward the lamp to make it bigger, or toward the paper to make it
smaller. Let go and it acts: the rabbit hops, the wolf howls when you drop your
pinky, and the duck paddles when you open and close its beak.

## Run it

```bash
npm install
npm run dev          # IWSDK-managed dev server on https://localhost:8081
npm test             # hand-recognition tests (synthetic poses + recorded clips)
npm run typecheck
npm run build        # production build in dist/
```

### On the headset (do this every day)

1. Run `npm run dev`. Then run `npx @iwsdk/cli dev status` and copy a URL from
   `runtimeUrls.network` (for example `https://192.168.1.20:8081/`).
2. On the Quest (same Wi-Fi), open that URL in the browser and accept the
   certificate warning. You can also forward the port over USB from
   `chrome://inspect`.
3. Press **Enter XR**. Put the controllers down: the game uses hands only.
   The stage appears about 55 cm in front of you at desk height. To move it,
   pinch the round tab under the screen and drag.
4. Add `?debug` to the URL for the dev overlay, which shows live features,
   shape scores and the weakest rule.

### On the desktop (no headset)

The page runs in IWSDK's emulator (IWER) and also as a flat page. A synthetic
"debug hand" lets you play the whole game:

| Key | Action |
| --- | --- |
| `1` / `2` / `3` | Rabbit / wolf / duck hand |
| `4` / `5` / `0` / `9` | Open hand / fist / relaxed hand / hide the hand |
| Mouse | Move the hand's shadow on the paper |
| Wheel, `W` / `S` | Hand toward the lamp (bigger) / toward the paper (smaller) |
| `Space` (hold) | Open the wolf's mouth / the duck's beak |
| `M` | Level map |
| `` ` `` | Debug overlay (dev builds or `?debug`) |
| `R` | Record a 3 s hand clip (with the overlay on) |

`window.shadowPlay` exposes `pose()`, `startLevel()`, `state()` and more for
scripted tests.

## Tuning hand recognition (the make-or-break part)

Recognition is a pure TypeScript module (`src/hand/`), so it runs in Node tests
and on the headset:

1. `features.ts` turns the 25 WebXR hand joints into about 15 numbers: finger
   curls, fingertip distances, finger spread, and thumb direction.
2. `shapes.ts` defines each creature as soft rules. Every rule maps one feature
   to a 0–1 score between two thresholds, and the shape's score is the lowest
   rule score. **These thresholds are starting guesses: tune them with real
   hands.**
3. `stabilizer.ts` smooths over 5 frames. It enters a shape after its score
   stays above 0.8 for 250 ms and leaves after the score stays below 0.6 for
   300 ms. The wolf's howl and the duck's paddle are open/close edges, so each
   fires once per gesture.
4. `calibration.ts` handles first use: the game learns from the player's own
   "close enough" pose. It only makes rules easier, and only by a bounded
   amount.

**Record real clips:** open `?debug` on the headset, use **Next label** to
pick what you are about to do (`rabbit`, `wolf-howl`, `near-miss-rabbit`,
…), then press **Record 3 s** and hold the pose. On the dev server the clip is
saved straight to `recordings/`; elsewhere it downloads. `npm test` replays
every clip. A correct clip must be recognised in time, and a wrong clip must
never trigger a creature. Aim for about 10 clips per shape: correct poses,
near misses, and other shapes. Small, large and less flexible hands help most.

Useful tools: `npx vite-node scripts/pose-report.ts` (features and scores for
every synthetic pose) and `npx vite-node scripts/noise-report.ts` (robustness
to joint jitter).

## How it works

```
XR hand joints ──► features ──► shape rules ──► stabilizer ──► creature alive / act
       │                                                         ▲
       └──► hand mesh casts a real shadow from the lamp ─────────┘ (position + size on the paper)
```

- **Real shadows.** The IWSDK hand visual's skinned mesh casts a shadow from
  one spot light (the lamp) onto the paper, with a 1024 px shadow map. The
  desktop debug hand casts through an invisible capsule "proxy hand".
  `?shadow=proxy` forces the proxy on the headset.
- **Position and size.** The hand's centre is projected from the lamp onto the
  paper. The size ratio (lamp-to-screen ÷ lamp-to-hand) sets the creature's
  scale.
- **Levels** are data (`src/game/levels.ts`): platforms, ponds, walls, props
  and a list of stage objectives (`form`, `reach`, `scare`, `paddle`).
- **No assets.** Paper textures, creatures and scenery are drawn in code.
  Sounds are synthesised with WebAudio.
- **Progress** (stars, calibration, settings) is saved in `localStorage`.

| Path | What |
| --- | --- |
| `src/shadow-play-system.ts` | Main system: hands → recognition → level → UI |
| `src/hand/` | Recognition core (pure, tested) |
| `src/game/stage.ts` | Paper screen, lamp, grab handle, shadow projection |
| `src/game/play.ts` | Level runner: creatures, hop physics, howls, paddling, goals |
| `src/game/levels.ts` | The 8 levels |
| `src/game/creatures.ts`, `scenery.ts` | Paper cut-out silhouettes |
| `src/game/hands.ts`, `shadow-casters.ts` | Joint input and shadow casters |
| `src/game/debug.ts` | Dev overlay and clip recorder |
| `tests/` | Vitest suites |

## Levels

1. **First light**: form the rabbit (tutorial; the level map unrolls afterwards)
2. **The gap**: walk to the edge and hop across
3. **Tall grass**: grow the rabbit to reach a ledge
4. **Crows**: the wolf; howl near each crow
5. **Pond**: the duck; paddle across
6. **Small door**: shrink to fit through, then grow to reach the carrot
7. **Relay**: the duck ferries the rabbit, then the wolf clears the crows
8. **Moonrise**: all three, ending with a big howl that wakes the moon

Stars: one for finishing, one for beating the par time, one for the hidden
firefly.

## Accessibility

Settings (top-right tab) include:

- **Creature cards:** look at a card and pinch to summon a creature without
  forming the shape. Pinch again to howl or paddle.
- **Stage on a real wall:** uses plane detection to hang a scaled-up paper
  screen on the wall you face (up to 2.5 m away). The lamp moves behind you
  so your hands still cast the shadows.
- Large text and high contrast.
- Sound on/off.
- Recalibrate.
- Move the stage.

## Deploy

Push to `main` with the included workflow (`.github/workflows/deploy.yml`) and
set **Settings → Pages → Source: GitHub Actions**. The build uses relative
paths (`base: './'`), so it works from a sub-path. Check that the public URL
opens in the Quest browser without logging in.
