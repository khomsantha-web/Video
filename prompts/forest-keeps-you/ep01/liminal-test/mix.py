"""Sound for the 10 s liminal test: a camcorder recording of a forest edge. numpy only. Writes out/mix.wav (48 kHz stereo)."""
import os, wave
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); SR = 48000; DUR = 10.3; N = int(DUR * SR)
rng = np.random.default_rng(3); T = np.arange(N) / SR

def fband(x, lo=None, hi=None, order=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-9; m = np.ones_like(f)
    if lo: m *= 1 / np.sqrt(1 + (lo / f) ** (2 * order))
    if hi: m *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(X * m, len(x))
def env(t, pts): xs, ys = zip(*pts); return np.interp(t, xs, ys)
def noise(n): return rng.standard_normal(n)
L = np.zeros(N); R = np.zeros(N)
def add(buf_l, buf_r, s, at, g=1.0, pan=0.0):
    i = int(at * SR); s = s[: N - i] if i < N else s[:0]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf_l[i:i + len(s)] += s * g * l * 1.414; buf_r[i:i + len(s)] += s * g * r * 1.414
# tape: hiss, camcorder motor hum (always there), slight wobble
hiss = fband(noise(N), 4000, 14000) * .03
hum = (np.sin(2 * np.pi * 120 * T) + .5 * np.sin(2 * np.pi * 240 * T) + .25 * np.sin(2 * np.pi * 360 * T)) * .012 * (1 + .1 * np.sin(2 * np.pi * .7 * T))
# a forest at dusk: wind through the canopy, leaves, far insects
wind = fband(noise(N), 80, 700) * (.6 + .4 * np.sin(2 * np.pi * .13 * T) + .25 * np.sin(2 * np.pi * .37 * T)) * .12 * env(T, [(0, .8), (5, 1.0), (10.3, .7)])
leaves = fband(noise(N), 2200, 7000) * (.5 + .5 * np.sin(2 * np.pi * .21 * T) ** 2) * .02
ins = fband(noise(N), 4200, 5000, 4) * (np.sin(2 * np.pi * 21 * T) > .3) * .012
for ch in (L, R): ch += hiss + hum + wind + leaves + ins
R += np.roll(wind, 2400) * .05; L += np.roll(leaves, 1800) * .01
# the lantern: tiny pops and a thin hiss near the middle
pops = np.zeros(N)
for t in rng.uniform(.3, 9.8, 22): i = int(t * SR); k = int(.004 * SR); pops[i:i + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / (SR * .001)) * .05
lh = fband(noise(N), 1500, 7000) * .01 * env(T, [(0, .3), (1.3, .5), (2.3, 1.0), (10.3, .9)])
for ch in (L, R): ch += pops + lh
# cloth as the hunter lifts his hand (1.3 to 2.3 s)
m = int(1.2 * SR); cl = fband(noise(m), 400, 3200) * np.sin(np.pi * np.linspace(0, 1, m)) ** 1.5 * .06; add(L, R, cl, 1.3, 1.0, 0.0)
# the camera is bumped (3.9 s, 7.2 s): a thump in the body of the camcorder
for tb, g in [(3.9, .22), (7.2, .3)]:
    m = int(.5 * SR); t = np.arange(m) / SR; th = np.sin(2 * np.pi * (70 - 25 * t) * t) * np.exp(-t * 9) + .4 * fband(noise(m), 200, 1800) * np.exp(-t * 30)
    add(L, R, th, tb, g, 0.0)
# tracking tears: a short buzz when the tape loses lock
for tb, d, g in [(4.78, .15, .09), (8.5, .12, .07)]:
    m = int(d * SR); buzz = np.sign(np.sin(2 * np.pi * 180 * np.arange(m) / SR)) * .5 + fband(noise(m), 300, 5000); add(L, R, buzz * np.sin(np.pi * np.linspace(0, 1, m)), tb, g, 0.0)
# focus motor hunting (6.0 to 6.8 s)
m = int(.8 * SR); tt = np.arange(m) / SR; mot = np.sin(2 * np.pi * (900 + 600 * np.sin(2 * np.pi * 3 * tt)) * tt) * .02 * np.sin(np.pi * tt / .8); add(L, R, mot, 6.0, 1.0, .1)
# dread: a low bowed drone that grows after the second warning begins (5 s on); an almost-silence just before it
dr = sum(np.sin(2 * np.pi * 73.4 * h * T * (1 + .002 * np.sin(2 * np.pi * 4 * T))) / h for h in range(1, 7)); dr = fband(dr, 40, 500); dr /= np.abs(dr).max()
dreg = env(T, [(0, 0), (4.6, 0), (5.2, .5), (10.3, 1.0)]) * .09
for ch in (L, R): ch += dr * dreg
quiet = env(T, [(0, 1), (4.4, 1), (4.6, .55), (4.95, .55), (5.2, 1), (10.3, 1)])   # the room tone drops for half a second
L *= quiet; R *= quiet
mix = np.stack([L, R]); mix /= np.abs(mix).max() / .89
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(HERE, 'out', 'mix.wav'), 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', DUR, 's')
