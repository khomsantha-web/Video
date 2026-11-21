"""Score + foley + ambience for ep01, synthesized with numpy only. Reads out/events.json and timeline.json.
Writes out/mix.wav (48 kHz stereo). No voice: the mids are kept thin so a voice-over can sit on top later."""
import json, wave, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
EV = json.load(open(os.path.join(HERE, 'out', 'events.json')))['events']
C = TL['cues']
SR = 48000
DUR = TL['dur'] + 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
T = np.arange(N) / SR


def bus():
    return np.zeros((2, N))


def fband(x, lo=None, hi=None, order=2):
    """soft FFT band-pass (Butterworth-like magnitude)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-9
    m = np.ones_like(f)
    if lo: m *= 1 / np.sqrt(1 + (lo / f) ** (2 * order))
    if hi: m *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(X * m, len(x))


def env(t, pts):
    """piecewise-linear envelope over absolute time"""
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


def add(b, s, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    s = s[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    b[0, i:i + len(s)] += s * gain * l * 1.414
    b[1, i:i + len(s)] += s * gain * r * 1.414


def noise(d):
    return rng.standard_normal(int(d * SR))


def adsr(n, a, rel, sus=1.0):
    e = np.ones(n) * sus
    na, nr = max(1, int(a * SR)), max(1, int(rel * SR))
    e[:na] = np.linspace(0, 1, na)[: len(e[:na])]
    if nr < n: e[-nr:] *= np.linspace(1, 0, nr)
    return e


# ---------------- sounds ----------------
def brush(d, n):
    out = np.zeros(int(d * SR) + SR // 2)
    for k in range(n):
        dd = d / n * (1.1 + 0.3 * rng.random())
        m = int(dd * SR); t = np.arange(m) / SR
        s = fband(noise(dd), 1400, 5200) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t + rng.random() * 6))
        s *= np.sin(np.pi * np.linspace(0, 1, m)) ** 1.5
        i = int(k * d / n * SR); out[i:i + m] += s
    return out


def pencil(d):
    m = int(d * SR)
    s = fband(noise(d), 2500, 9000)
    gate = np.repeat(rng.random(int(d * 30) + 1) > 0.35, SR // 30 + 1)[:m]
    gate = np.convolve(gate.astype(float), np.ones(200) / 200, 'same')
    return s * gate * adsr(m, .02, .1)


def drip(g=1.0):
    d = .25; m = int(d * SR); t = np.arange(m) / SR
    f = 900 + 1500 * (1 - np.exp(-t * 60))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 28) * g
    s[:200] *= np.linspace(0, 1, 200)
    return s


def thump(d=1.2, f0=55, f1=30):
    m = int(d * SR); t = np.arange(m) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 3)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    s += 0.5 * np.sin(2 * 2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4)
    return s


def ignite():
    s = fband(noise(.5), 300, 3000) * np.exp(-np.arange(int(.5 * SR)) / SR * 9)
    return s * .6 + np.pad(thump(.5, 90, 50) * .4, (0, 0))[: len(s)]


def hiss(d, decay):
    m = int(d * SR)
    return fband(noise(d), 2000, 8000) * np.exp(-np.arange(m) / SR * decay) * adsr(m, .05, .2)


def creak(d=1.4):
    m = int(d * SR); t = np.arange(m) / SR
    rate = 35 + 25 * np.sin(2 * np.pi * .7 * t) + 15 * rng.random()
    ph = np.cumsum(rate) / SR
    pulses = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    s = fband(np.convolve(pulses, np.exp(-np.arange(400) / 60), 'same'), 250, 1600)
    return s * np.sin(np.pi * np.linspace(0, 1, m)) / (np.abs(s).max() + 1e-9)


def swell(d):
    m = int(d * SR)
    s = fband(noise(d), 200, 1800)
    return s * np.sin(np.pi * np.linspace(0, 1, m)) ** 2


def mbox(freq, d=3.0, det=0.0):
    """music-box / kalimba-like tine, slightly detuned"""
    m = int(d * SR); t = np.arange(m) / SR
    f = freq * (1 + det)
    s = (np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + .15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12))
    s *= np.exp(-t * 1.6); s[:120] *= np.linspace(0, 1, 120)
    return s


def glass(freq, d, att=1.0):
    m = int(d * SR); t = np.arange(m) / SR
    vib = 1 + .002 * np.sin(2 * np.pi * 5 * t)
    s = np.sin(2 * np.pi * freq * vib * t) + .3 * np.sin(2 * np.pi * freq * 2.01 * t)
    return s * adsr(m, att, min(d * .5, 1.5))


def mtof(n): return 440 * 2 ** ((n - 69) / 12)


def reverb(x, secs=2.2, wet=.3):
    m = int(secs * SR)
    ir = rng.standard_normal(m) * np.exp(-np.arange(m) / SR * 3.2)
    ir = fband(ir, 200, 6000); ir /= np.sqrt((ir ** 2).sum())
    L = len(x) + m
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return x * (1 - wet) + y * wet * 1.5


# ---------------- EP01 additions ----------------
def step_leaves(g=1.0):
    d = .14; m = int(d * SR); t = np.arange(m) / SR
    s = fband(noise(d), 900, 5500) * np.exp(-t * 32) * (1 + .6 * (rng.random(m) > .93))
    s += .5 * fband(noise(d), 80, 400) * np.exp(-t * 45)
    return s * g


def engine(d, f0, bright=1.0):
    """propeller drone: low harmonic buzz + blade-rate flutter + air noise"""
    m = int(d * SR); t = np.arange(m) / SR
    ph = 2 * np.pi * f0 * t
    s = sum(np.sin(h * ph + h) / h ** 1.1 for h in range(1, 14))
    s *= 1 + .35 * np.sin(2 * np.pi * f0 * 2.5 * t)
    s = fband(s, 50, 900 * bright) + .5 * fband(noise(d), 100, 1200 * bright)
    return s / (np.abs(s).max() + 1e-9)


def flutter(d):
    m = int(d * SR); t = np.arange(m) / SR
    s = fband(noise(d), 300, 2500) * (np.abs(np.sin(2 * np.pi * 6.5 * t + 3 * np.sin(2 * np.pi * .7 * t))) ** 3)
    return s


def bird(f0=2600):
    d = .35; m = int(d * SR); t = np.arange(m) / SR
    f = f0 * (1 + .25 * np.sin(2 * np.pi * 9 * t)) * (1 - .3 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2


def static(d):
    m = int(d * SR)
    return fband(noise(d), 800, 4000) * (rng.random(m) > .5) * adsr(m, .01, .1)


cue = TL['cues']
amb, mus, fx = bus(), bus(), bus()
e0, e1 = cue['engine']; s0, s1 = cue['silence']; BLACK = cue['black']

# ambience: wind through trees (stronger inside), leaves; birds only outside the forest
wind = fband(rng.standard_normal(N), 70, 700) * (0.6 + .4 * np.sin(2 * np.pi * .07 * T) + .2 * np.sin(2 * np.pi * .31 * T))
amb += wind * .10 * env(T, [(0, .9), (5.9, 1.0), (13, .8), (18.5, 1.3), (31, 1.0), (44.5, .7), (s0, .6), (s0 + .3, .12), (s1, .12), (s1 + .5, .35), (BLACK, .3), (BLACK + .3, 0), (DUR, 0)])
leaves = fband(rng.standard_normal(N), 2000, 7000) * (0.5 + .5 * np.sin(2 * np.pi * .19 * T) ** 2)
amb += leaves * .018 * env(T, [(0, .3), (6, 1), (44, 1), (45, .7), (47, .7), (48, 2.2), (52, 2.2), (s0, .3), (BLACK, .2), (BLACK + .2, 0), (DUR, 0)])
for t in np.arange(6.5, 43.5, 1.7):
    if rng.random() < .55: add(amb, bird(2200 + rng.random() * 1400), t + rng.random(), .025 * (1 if t < 38 else .5), pan=rng.uniform(-.8, .8))
ins = fband(rng.standard_normal(N), 3800, 4600, 4) * (np.sin(2 * np.pi * 22 * T) > .3)
amb += ins * .012 * env(T, [(0, 0), (44.5, 0), (45, 1), (s0, 1), (s0 + .2, 0), (DUR, 0)])

# the real plane (0–6 s), left to right
d = 6.0; en = engine(d, 58, 1.0) * np.sin(np.pi * np.clip(np.arange(int(d * SR)) / SR / d * 1.15, 0, 1)) ** 1.5
pan = np.linspace(-.8, .9, len(en))
i = 0; fx[0, :len(en)] += en * .32 * np.cos((pan + 1) * np.pi / 4) * 1.4; fx[1, :len(en)] += en * .32 * np.sin((pan + 1) * np.pi / 4) * 1.4
# the phantom plane (45–52.6 s): heavier, overhead, pitch falling, gone into silence
d = e1 - e0; m = int(d * SR); tt = np.arange(m) / SR
ph = engine(d, 52, .8)
envp = np.interp(tt, [0, 2.5, 4.2, d - 1.2, d], [0, .7, 1.0, .35, 0])
ph *= envp
ph = reverb(ph, 2.8, .45)
pan = np.interp(tt, [0, d], [-.5, .6])
i0 = int(e0 * SR); fx[0, i0:i0 + m] += ph * .55 * np.cos((pan + 1) * np.pi / 4) * 1.4; fx[1, i0:i0 + m] += ph * .55 * np.sin((pan + 1) * np.pi / 4) * 1.4

# music: low bowed drone (D), sparse detuned kalimba, tension glass
f0 = 73.4
vib = 1 + .003 * np.sin(2 * np.pi * 4.1 * T)
dr = sum(np.sin(2 * np.pi * f0 * h * np.cumsum(vib) / SR) / h for h in range(1, 10)) + .5 * sum(np.sin(2 * np.pi * f0 * 1.5 * h * np.cumsum(vib) / SR) / h for h in range(1, 8))
dr = fband(dr, 40, 600); dr /= np.abs(dr).max()
mus += dr * .2 * env(T, [(0, 0), (1.5, .45), (6, .5), (13, .4), (18.5, .3), (28, .7), (31, .6), (38, .8), (44.5, .4), (45, .25), (50, .5), (s0, 0), (s1, 0), (DUR, 0)])
motif = [62, 65, 69, 70, 69, 65, 62, 61]
for k, t in enumerate(np.arange(1.0, 30.0, 2.5)):
    add(mus, mbox(mtof(motif[k % len(motif)]), 3, det=(rng.random() - .5) * .015), t, .07, pan=(-.4 if k % 2 else .4))
for k, t in enumerate(np.arange(31.0, 44.0, 1.6)):
    add(mus, glass(mtof(74 + k), 2.6, att=.9), t, .03 + k * .003, pan=(-.5 if k % 2 else .5))
low = thump(3.0, 46, 30); add(mus, low, cue['low'], .7)
add(mus, glass(mtof(62), 3.0, att=.3), cue['low'], .05)
add(mus, glass(mtof(63), 3.0, att=.3), cue['low'], .04, pan=.3)
for ch in range(2):   # leave the mids for a voice-over later
    X = np.fft.rfft(mus[ch]); f = np.fft.rfftfreq(N, 1 / SR)
    mus[ch] = np.fft.irfft(X * (1 - .37 * np.exp(-((np.log2(f + 1) - np.log2(1000)) / 1.6) ** 2)), N)

# foley from the page's events
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'brush': add(fx, brush(e['d'], e['n']), t, .04, pan=rng.uniform(-.5, .5))
    elif ty == 'step': add(fx, step_leaves(e['g']), t, .16, pan=e.get('pan', 0))
    elif ty == 'map': add(fx, brush(.6, 2), t, .08, pan=-.4)
    elif ty == 'radio': add(fx, static(.5), t, .05, pan=.3)
    elif ty == 'creak': add(fx, creak(1.2), t, .12, pan=.4)
add(fx, flutter(12.0) * np.sin(np.pi * np.linspace(0, 1, int(12 * SR))) ** .5, 18.8, .05, pan=.4)
add(fx, hiss(1.4, 1.5), 13.4, .03)   # lantern

wet = bus()
for ch in range(2): wet[ch] = reverb(mus[ch] + fx[ch] * .7, 2.4, .32) + fx[ch] * .3
mix = amb + wet
g = env(T, [(0, 1), (s0 - .05, 1), (s0 + .25, .35), (s1, .35), (s1 + .05, 1), (BLACK - .1, 1), (BLACK + .4, 0), (DUR, 0)])
mix *= g
mix /= np.abs(mix).max() / .89
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(HERE, 'out', 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', DUR, 's')
