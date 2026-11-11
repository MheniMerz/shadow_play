"""Synthesise the trailer's music bed and sound effects (48 kHz stereo), timed to trailer.html."""
import numpy as np, soundfile as sf
SR = 48000; DUR = 63.0; N = int(SR * DUR)
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

# --- drone: A minor, slow breathing tremolo ---
dr = np.zeros(N)
for f, g in [(55, 0.5), (82.41, 0.28), (110, 0.22), (130.81, 0.08)]:
    dr += g * np.sin(2 * np.pi * f * t_all + 0.3 * np.sin(2 * np.pi * 0.07 * t_all))
dr *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t_all) ** 2
fade = np.clip(t_all / 3, 0, 1) * np.clip((DUR - t_all) / 2.5, 0, 1)
music[:, 0] += dr * 0.10 * fade; music[:, 1] += dr * 0.10 * fade
# wind: filtered noise
wind = np.convolve(rng.standard_normal(N), np.ones(400) / 400, mode='same') * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t_all))
music[:, 0] += wind * 0.35 * fade; music[:, 1] += np.roll(wind, 2000) * 0.35 * fade

# --- music box waltz (A harmonic minor), sparse and slightly out of tune ---
def mbox(m, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m) * (1 + rng.normal(0, 0.002))
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.15) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05)
    return s * env(n, 0.002, decay=0.55)
phrase = [81, 84, 88, 83, 81, 80, 76, 77, 76, 72, 74, 76, 81, 80, 76, None]
beat = 60 / 76
t = 2.4; i = 0
while t < 60.5:
    m = phrase[i % len(phrase)]
    if m is not None and not (33.8 < t < 39.5):  # let the wolf scene breathe
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

place(sfx, click(), 1.2, -0.5, 0.6); place(sfx, click(), 1.28, -0.5, 0.35); place(sfx, click(), 1.42, -0.5, 0.5)
place(sfx, whoosh(1.6), 8.8, 0.3, 0.12)
for k, tt in enumerate([15.7, 16.4, 17.35]):
    place(sfx, creak(0.5), tt - 0.25, [-0.5, 0, 0.5][k], 0.25); place(sfx, thud(90, 0.4), tt + 0.25, [-0.5, 0, 0.5][k], 0.35)
place(sfx, tink(2600), 22.1, 0, 0.12)
for tt in [24.4 + 0.7 * k for k in range(3)]: place(sfx, thud(140, 0.25), tt + 0.62, 0.3, 0.25)
n = int(1.4 * SR); tt = np.arange(n) / SR
place(sfx, np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, 1.4], [200, 420])) / SR) * np.sin(np.pi * tt / 1.4) ** 2, 29.0, 0, 0.05)
place(sfx, np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, 1.4], [420, 200])) / SR) * np.sin(np.pi * tt / 1.4) ** 2, 31.3, 0, 0.05)
place(sfx, howl(), 36.45, -0.4, 0.22)
place(sfx, flaps(1.4), 36.9, 0.4, 0.28)
for k in range(10): place(sfx, splash(), 41.0 + 0.55 * k + 0.4, 0, 0.15)
place(sfx, swell([220, 261.6, 329.6, 415.3], 4.0), 49.6, 0, 0.12)
place(sfx, swell([233.1, 349.2], 1.6), 52.4, 0.2, 0.1)
place(sfx, thud(48, 2.5) + 0.3 * swell([110, 164.8], 2.5), 55.4, 0, 0.5)
place(sfx, mbox(81, 3), 60.3, 0, 0.12); place(sfx, mbox(76, 3), 60.9, 0, 0.1); place(sfx, mbox(69, 4), 61.5, 0, 0.12)

sf.write('music.wav', music.astype(np.float32), SR)
sf.write('sfx.wav', sfx.astype(np.float32), SR)
print('music peak', np.abs(music).max().round(2), 'sfx peak', np.abs(sfx).max().round(2))
