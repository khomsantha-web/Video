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


# ---------------- ambience ----------------
amb = bus()
s1a, s1b, s2a, s2b, hit = C['silence1'][0], C['silence1'][1], C['silence2'][0], C['silence2'][1], C['hit']
# crickets: 4.6 kHz band, pulsed
cr = fband(rng.standard_normal(N), 4200, 5200, 4)
chirp = (np.sin(2 * np.pi * 28 * T) > .2) * (np.sin(2 * np.pi * .9 * T + 1) > -.2)
chirp = np.convolve(chirp.astype(float), np.ones(160) / 160, 'same')
crick = cr * chirp * env(T, [(0, .6), (31, .6), (32, .25), (s2a, .25), (s2a + .05, 0), (49.6, 0), (52, .15), (DUR, .1)])
amb[0] += crick * .05; amb[1] += np.roll(crick, 900) * .05
# canal water: slow lapping
wa = fband(rng.standard_normal(N), 150, 900) * (0.55 + .45 * np.sin(2 * np.pi * .23 * T) * np.sin(2 * np.pi * .37 * T + 1))
water = wa * env(T, [(0, .5), (5, .7), (31, .7), (34, .15), (s2a, .12), (s2a + .05, 0), (DUR, 0)])
amb[0] += water * .12; amb[1] += np.roll(water, 2400) * .12
# low wind
wind = fband(rng.standard_normal(N), 80, 400) * (0.6 + .4 * np.sin(2 * np.pi * .08 * T))
wind *= env(T, [(0, .5), (s2a, .5), (s2a + .05, 0), (hit + 1, 0), (49.6, .3), (52, 1), (DUR, .4)])
amb += wind * .09

# ---------------- music ----------------
mus = bus()
# drone: bowed A1 + E2 (saw stack, low-passed), with a slow swell
f0 = 55.0
vib = 1 + .003 * np.sin(2 * np.pi * 4.3 * T)
dr = np.zeros(N)
for h in range(1, 12):
    dr += np.sin(2 * np.pi * f0 * h * np.cumsum(vib) / SR) / h
    dr += .6 * np.sin(2 * np.pi * f0 * 1.5 * h * np.cumsum(vib * 1.0007) / SR) / h
dr = fband(dr, 40, 700)
dr /= np.abs(dr).max()
dr_env = env(T, [(0, 0), (1, .5), (5, .6), (15, .7), (26.6, .5), (s1a, 0), (s1b, 0), (32.5, .55), (s2a - .3, 1.0), (s2a, 0), (hit, 0), (hit + .05, .9),
                 (49.6, .5), (52.5, 0), (DUR, 0)])
mus += dr * dr_env * .22 * (1 + .25 * np.sin(2 * np.pi * .125 * T))

# music box: A minor-ish motif every 2 beats (60 bpm), 5–27 s
motif = [69, 72, 76, 77, 76, 72, 69, 68, 69, 72, 76, 79, 77, 76, 72, 68]
for i, t in enumerate(np.arange(5.0, 26.6, 2.0)):
    n = motif[i % len(motif)]
    add(mus, mbox(mtof(n), 3, det=(rng.random() - .5) * .012), t, .10, pan=(-.4 if i % 2 else .4))
    if i % 4 == 3: add(mus, mbox(mtof(n - 12), 3), t + 1.0, .06, pan=0)
# glass harmonics rising 31–44.6: tension
for i, t in enumerate(np.arange(32.0, 44.0, 1.5)):
    n = 81 + i
    add(mus, glass(mtof(n), min(3.0, s2a - t), att=1.0), t, .035 + i * .004, pan=(-.5 if i % 2 else .5))
# the hit: dissonant glass cluster
for n, p in [(81, -.5), (82, .5), (88, 0)]:
    add(mus, glass(mtof(n), 4.0, att=.02), hit, .06, pan=p)
# the closing note
add(mus, mbox(mtof(69), 4.5), C['endNote'] + .2, .14)
add(mus, mbox(mtof(81), 4.5, det=.004), C['endNote'] + .2, .05, pan=.3)
# thin the mids for a voice-over later (-4 dB around 300 Hz–3 kHz)
for ch in range(2):
    X = np.fft.rfft(mus[ch]); f = np.fft.rfftfreq(N, 1 / SR)
    dip = 1 - .37 * np.exp(-((np.log2(f + 1) - np.log2(1000)) / 1.6) ** 2)
    mus[ch] = np.fft.irfft(X * dip, N)

# ---------------- foley from events ----------------
fx = bus()
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'brush': add(fx, brush(e['d'], e['n']), t, .05, pan=rng.uniform(-.5, .5))
    elif ty == 'pencil': add(fx, pencil(e['d']), t, .035, pan=-.2)
    elif ty == 'drip': add(fx, drip(), t, .22 * e.get('g', 1), pan=rng.uniform(-.2, .2))
    elif ty == 'ignite': add(fx, ignite(), t, .35)
    elif ty == 'snuff': add(fx, hiss(1.2, 3), t, .12)
    elif ty == 'flare': add(fx, hiss(1.6, 1.2), t, .14); add(fx, ignite(), t + .15, .25)
    elif ty == 'hit':
        add(fx, thump(2.5, 60, 28), t, .9)
        add(fx, fband(noise(1.5), 40, 300) * np.exp(-np.arange(int(1.5 * SR)) / SR * 3), t, .5)
    elif ty == 'creak': add(fx, creak(1.6), t, .18, pan=.6)
    elif ty == 'mist': add(fx, swell(3.4), t, .14)
    elif ty == 'boat':
        for k in range(4): add(fx, creak(.5) * .6, t + .4 + k * 1.05, .10, pan=-.3 + k * .2)
        add(fx, fband(noise(e['d']), 100, 600) * np.sin(np.pi * np.linspace(0, 1, int(e['d'] * SR))), t, .10)

# ---------------- master ----------------
wet = bus()
for ch in range(2):
    wet[ch] = reverb(mus[ch] + fx[ch] * .8, 2.4, .35) + fx[ch] * .2
mix = amb + wet
# hard silence in the second gap (only room tone fades)
g = env(T, [(0, 1), (s2a - .05, 1), (s2a, .02), (s2b - .05, .02), (s2b, 1), (DUR - .6, 1), (DUR, 0)])
mix *= g
mix /= np.abs(mix).max() / .89
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(HERE, 'out', 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', DUR, 's')
