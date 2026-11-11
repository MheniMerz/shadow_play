# Shadow Play trailer

A 63-second motion-graphics trailer: a moody, hand-drawn storybook look
(muted wallpaper greens, sepia paper, film grain, boiling outlines, iris
transitions) with a narrated voice-over. Everything is generated from code.

| File | What it does |
| --- | --- |
| `trailer.html` | The animation. `render(t)` draws the frame at time `t`; nine scenes on a 63 s timeline |
| `render.js` | Renders every frame in headless Chromium (Playwright) and pipes them to ffmpeg (24 fps, 1280×720) |
| `lines.json`, `tts.py` | Narration script, spoken by [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (voice `bm_george`, speed 0.88) |
| `soundtrack.py` | Synthesised music bed (drone, music-box waltz, crackle) and sound effects, timed to the scenes |
| `fell*.woff2` | IM Fell English typeface (SIL Open Font License), from `@fontsource/im-fell-english` |

## Rebuild

```bash
# 1. Voice-over (one-time model download, ~350 MB)
python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile
mkdir -p models && cd models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd .. && ./venv/bin/python tts.py bm_george 0.88      # writes vo_*.wav + durations.json

# 2. Music and effects
./venv/bin/python soundtrack.py                         # writes music.wav, sfx.wav

# 3. Picture (serve this folder so the fonts load)
python3 -m http.server 8765 &
node render.js full silent.mp4
```

Then mix the voice lines in at their start times (`lamp` 2.0 s, `hands` 8.8,
`three` 15.6, `alive` 21.6, `size` 27.6, `wolf` 34.6, `duck` 40.8, `moon` 46.8,
`title` 55.6, `tag` 57.4) with ffmpeg, duck the music under the voice, and mux
with `silent.mp4`. To change the timing, edit `SCENES` in `trailer.html` and
the start times together.

Rendered outputs (`*.mp4`, `*.wav`) are not committed; regenerate them with the steps above.
