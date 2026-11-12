"""Synthesise the trailer's music bed and sound effects (48 kHz stereo), timed to trailer.html."""
import numpy as np, soundfile as sf
SR = 48000; DUR = 60.4; N = int(SR * DUR)
rng = np.random.default_rng(7)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
t_all = np.arange(N) / SR

def place(buf, sig, t, pan=0.0, gain=1.0):
    i = int(t * SR); sig = sig[: max(0, N - i)]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l * 1.41; buf[i:i + len(sig), 1] += sig * gain * r * 1.41

def env(n, a=0.005, d=None, decay=None):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4))
    if decay: e *= np.exp(-t / decay)
    if d: e *= np.clip((n / SR - t) / d, 0, 1)
    return e

def lowpass(x, k):  # simple one-pole
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += k * (v - acc); y[i] = acc
    return y

def mtof(m): return 440 * 2 ** ((m - 69) / 12)

# --- warm drone: C major, slow breathing tremolo ---
dr = np.zeros(N)
for f, g in [(65.41, 0.45), (98.0, 0.25), (130.81, 0.2), (164.81, 0.08)]:
    dr += g * np.sin(2 * np.pi * f * t_all + 0.3 * np.sin(2 * np.pi * 0.07 * t_all))
dr *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t_all) ** 2
fade = np.clip(t_all / 3, 0, 1) * np.clip((DUR - t_all) / 2.5, 0, 1)
music[:, 0] += dr * 0.08 * fade; music[:, 1] += dr * 0.08 * fade
# wind: filtered noise
wind = np.convolve(rng.standard_normal(N), np.ones(400) / 400, mode='same') * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t_all))
music[:, 0] += wind * 0.15 * fade; music[:, 1] += np.roll(wind, 2000) * 0.15 * fade

# --- music box waltz in C major, gentle and a touch out of tune like an old toy ---
def mbox(m, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m) * (1 + rng.normal(0, 0.002))
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.15) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05)
    return s * env(n, 0.002, decay=0.55)
phrase = [72, 76, 79, 84, 81, 79, 77, 76, 74, 77, 81, 79, 76, 74, 72, None]
beat = 60 / 84
t = 1.0; i = 0
while t < 58.0:
    m = phrase[i % len(phrase)]
    if m is not None and not (31.2 < t < 36.8):  # let the wolf scene breathe
        place(music, mbox(m), t, pan=rng.uniform(-0.4, 0.4), gain=0.12)
        if i % 4 == 0: place(music, mbox(m - 24, 2.2), t, gain=0.07)
    t += beat; i += 1
# echo on the music box bed
d = int(0.31 * SR); music[d:] += music[:-d] * 0.28; music[:, 1] = np.roll(music[:, 1], 600)

# --- vinyl crackle ---
cr = np.zeros(N); idx = rng.integers(0, N, 900); cr[idx] = rng.uniform(-1, 1, 900)
cr = np.convolve(cr, np.exp(-np.arange(60) / 8), mode='same')
sfx[:, 0] += cr * 0.05; sfx[:, 1] += np.roll(cr, 333) * 0.05
hiss = rng.standard_normal(N) * 0.004; sfx[:, 0] += hiss; sfx[:, 1] += hiss

# --- sound effects ---
def click(): n = int(0.05 * SR); return rng.standard_normal(n) * env(n, 0.0005, decay=0.006) + np.sin(2 * np.pi * 1800 * np.arange(n) / SR) * env(n, 0.0005, decay=0.01) * 0.5
def thud(f=70, dur=0.5, g=1): n = int(dur * SR); t = np.arange(n) / SR; return np.sin(2 * np.pi * f * t * (1 - 0.3 * t)) * env(n, 0.002, decay=0.12) * g
def whoosh(dur=1.2): n = int(dur * SR); x = rng.standard_normal(n); x = np.convolve(x, np.ones(60) / 60, mode='same'); return x * np.sin(np.pi * np.arange(n) / n) ** 2 * 2.5
def tink(f=2400): n = int(0.8 * SR); t = np.arange(n) / SR; return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.7 * t)) * env(n, 0.001, decay=0.25)
def creak(dur=0.6): n = int(dur * SR); t = np.arange(n) / SR; f = 180 + 60 * np.sin(2 * np.pi * 3 * t); ph = np.cumsum(f) / SR; return np.sign(np.sin(2 * np.pi * ph)) * np.sin(np.pi * t / dur) * 0.15
def howl():
    n = int(2.2 * SR); t = np.arange(n) / SR
    f = np.interp(t, [0, 0.35, 1.3, 2.2], [300, 520, 500, 360]) + 8 * np.sin(2 * np.pi * 5.5 * t)
    ph = np.cumsum(f) / SR; s = np.sin(2 * np.pi * ph) + 0.5 * np.sin(4 * np.pi * ph) + 0.25 * np.sin(6 * np.pi * ph)
    s = lowpass(s, 0.12); return s * np.interp(t, [0, 0.25, 1.6, 2.2], [0, 1, 0.9, 0])
def flaps(dur=1.2):
    n = int(dur * SR); out = np.zeros(n)
    for k in range(int(dur * 14)):
        i = int(k / 14 * SR + rng.integers(0, 600)); m = int(0.04 * SR)
        if i + m < n: out[i:i + m] += rng.standard_normal(m) * env(m, 0.002, decay=0.012)
    return out
def splash(): n = int(0.35 * SR); x = np.convolve(rng.standard_normal(n), np.ones(12) / 12, mode='same'); return x * env(n, 0.005, decay=0.09) * 2
def swell(freqs, dur=3.0):
    n = int(dur * SR); t = np.arange(n) / SR; s = sum(np.sin(2 * np.pi * f * t + 0.2 * np.sin(2 * np.pi * 0.3 * t)) for f in freqs)
    return s / len(freqs) * np.sin(np.pi * t / dur) ** 2

# cold open: the shadow wakes (1.6 s) and hops away (3.7 s)
place(sfx, tink(2600), 1.65, 0, 0.12); place(sfx, tink(3300), 1.8, 0.2, 0.08)
for k in range(3): place(sfx, thud(150, 0.25), 3.7 + 0.7 * k + 0.62, 0.3, 0.25)
place(sfx, click(), 6.5, -0.5, 0.6); place(sfx, click(), 6.58, -0.5, 0.35); place(sfx, click(), 6.7, -0.5, 0.5)
place(sfx, whoosh(1.6), 13.0, 0.3, 0.1)
for k, tt in enumerate([19.29, 20.05, 20.95]):
    place(sfx, creak(0.5), tt - 0.25, [-0.5, 0, 0.5][k], 0.15); place(sfx, thud(110, 0.35), tt + 0.25, [-0.5, 0, 0.5][k], 0.3); place(sfx, tink([2093, 2637, 3136][k]), tt + 0.3, [-0.5, 0, 0.5][k], 0.06)
n = int(1.4 * SR); tt = np.arange(n) / SR
place(sfx, np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, 1.4], [262, 523])) / SR) * np.sin(np.pi * tt / 1.4) ** 2, 26.4, 0, 0.05)
place(sfx, np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, 1.4], [523, 262])) / SR) * np.sin(np.pi * tt / 1.4) ** 2, 28.7, 0, 0.05)
place(sfx, howl(), 33.85, -0.4, 0.2)
place(sfx, flaps(1.4), 34.25, 0.4, 0.26)
for k in range(10): place(sfx, splash(), 38.8 + 0.55 * k, 0, 0.14)
place(sfx, swell([261.6, 329.6, 392.0, 523.3], 4.0), 46.8, 0, 0.1)
for k, f in enumerate([1568, 2093, 2637, 3136]): place(sfx, tink(f), 49.6 + 0.09 * k, -0.3 + 0.2 * k, 0.07)
place(sfx, swell([130.8, 196.0, 261.6, 329.6], 3.0), 52.6, 0, 0.18); place(sfx, thud(65, 1.5), 52.7, 0, 0.25)
place(sfx, mbox(84, 3), 57.4, 0, 0.12); place(sfx, mbox(79, 3), 58.0, 0, 0.1); place(sfx, mbox(72, 4), 58.6, 0, 0.12)

sf.write('music.wav', music.astype(np.float32), SR)
sf.write('sfx.wav', sfx.astype(np.float32), SR)
print('music peak', np.abs(music).max().round(2), 'sfx peak', np.abs(sfx).max().round(2))
