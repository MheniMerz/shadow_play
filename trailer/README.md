# Shadow Play trailer

A 60-second motion-graphics trailer in a warm, hand-drawn storybook style
(honey wallpaper, cream paper, amber lamplight, gentle film grain, boiling
outlines, iris transitions) with a narrated voice-over. It opens on the hook:
a hand shadow opening its eye and hopping away. Everything is generated from
code.

| File | What it does |
| --- | --- |
| `trailer.html` | The animation. `render(t)` draws the frame at time `t`; nine scenes on a 60.4 s timeline |
| `render.js` | Renders every frame in headless Chromium (Playwright) and pipes them to ffmpeg (24 fps, 1280×720) |
| `lines.json`, `tts.py` | Narration script, spoken by [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (voice `bm_george`, speed 0.9) |
| `mix.py` | Places the voice lines on the timeline, ducks the music under them, normalises to −16 LUFS, writes subtitles |
| `soundtrack.py` | Synthesised music bed (C-major music-box waltz, soft drone, crackle) and sound effects, timed to the scenes |
| `fell*.woff2` | IM Fell English typeface (SIL Open Font License), from `@fontsource/im-fell-english` |

## Rebuild

```bash
# 1. Voice-over (one-time model download, ~350 MB)
python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile
mkdir -p models && cd models
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
cd .. && ./venv/bin/python tts.py bm_george 0.9       # writes vo_*.wav + durations.json

# 2. Music and effects
./venv/bin/python soundtrack.py                         # writes music.wav, sfx.wav

# 3. Picture (serve this folder so the fonts load)
python3 -m http.server 8765 &
node render.js full silent.mp4
```

Then mix and mux (`mix.py` expects the `vo_*.wav` files in `../tts/`; adjust
the path if you generated them here):

```bash
python3 mix.py                                          # writes mix-warm.wav + shadow-play-trailer.srt
ffmpeg -i silent.mp4 -i mix-warm.wav -i shadow-play-trailer.srt -map 0:v -map 1:a -map 2:s \
  -c:v copy -c:a aac -b:a 192k -c:s mov_text -t 60.4 -movflags +faststart shadow-play-trailer.mp4
```

To change the timing, edit `SCENES` in `trailer.html`, the voice start times
in `mix.py` and the effect times in `soundtrack.py` together.

Rendered outputs (`*.mp4`, `*.wav`) are not committed; regenerate them with the steps above.
