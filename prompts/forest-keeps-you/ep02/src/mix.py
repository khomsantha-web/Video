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


def breath(d, f0=500):
    """breathy whisper-like noise (not words): formant-filtered noise with a slow in/out"""
    m = int(d * SR); t = np.arange(m) / SR
    s = fband(noise(d), f0, f0 * 3.2) * np.sin(np.pi * t / d) ** 1.5
    s += .5 * fband(noise(d), 1800, 3200) * np.sin(np.pi * t / d) ** 3
    return s


def call(g=1.0):
    """'ni..ran..' as three breathy syllables, pitched like a distant man's voice"""
    out = np.zeros(int(3.2 * SR))
    for k, (st, d, f) in enumerate([(0, .55, 260), (.95, .5, 240), (1.85, .9, 210)]):
        m = int(d * SR); t = np.arange(m) / SR
        hum = sum(np.sin(2 * np.pi * f * h * t * (1 - .05 * t)) / h ** 1.6 for h in range(1, 7))
        v = fband(hum, 150, 1400) * .25 + breath(d, 420) * .9
        v *= np.sin(np.pi * t / d) ** 1.2
        i = int(st * SR); out[i:i + m] += v
    return out * g


cue = TL['cues']
amb, mus, fx = bus(), bus(), bus()
BLACK = cue['black']; ins_stop = cue['insectsStop']
# ambience
wind = fband(rng.standard_normal(N), 70, 700) * (0.6 + .4 * np.sin(2 * np.pi * .07 * T) + .2 * np.sin(2 * np.pi * .31 * T))
amb += wind * .09 * env(T, [(0, .8), (ins_stop - .05, .8), (ins_stop + .1, .05), (37, .05), (41, .35), (51, .45), (55.0, .3), (56.6, .1), (BLACK, .05), (BLACK + .3, 0), (DUR, 0)])
leaves = fband(rng.standard_normal(N), 2000, 7000) * (0.5 + .5 * np.sin(2 * np.pi * .19 * T) ** 2)
amb += leaves * .02 * env(T, [(0, 2), (3, .8), (ins_stop - .05, .8), (ins_stop + .1, 0), (41, .3), (55, .3), (56.6, 0), (DUR, 0)])
ins = fband(rng.standard_normal(N), 3800, 4600, 4) * (np.sin(2 * np.pi * 22 * T) > .3)
amb += ins * .014 * env(T, [(0, .6), (4, 1), (ins_stop - .02, 1), (ins_stop, 0), (DUR, 0)])   # insects stop dead

# the phantom plane fading out over the first seconds (continues EP01)
d = 6.0; m = int(d * SR); tt = np.arange(m) / SR
ph = reverb(engine(d, 50, .7) * np.interp(tt, [0, .3, 5.5, 6], [.55, .5, 0, 0]), 2.8, .5)
add(fx, ph, 0, .45, pan=.5)

# music: same drone family as EP01, tighter; silence at the grab; pressure in S6
f0 = 73.4
vib = 1 + .003 * np.sin(2 * np.pi * 4.1 * T)
dr = sum(np.sin(2 * np.pi * f0 * h * np.cumsum(vib) / SR) / h for h in range(1, 10)) + .6 * sum(np.sin(2 * np.pi * f0 * 1.06 * h * np.cumsum(vib) / SR) / h for h in range(1, 6))
dr = fband(dr, 40, 600); dr /= np.abs(dr).max()
mus += dr * .2 * env(T, [(0, .2), (5, .35), (14, .4), (21, .55), (ins_stop - .1, .6), (ins_stop, 0), (34, 0), (37, .5), (41, .9), (46.4, .9), (47, .4), (55, .5), (55.15, 0), (DUR, 0)])
motif = [62, 65, 61, 62, 65, 68, 67, 62]
for k, t in enumerate(np.arange(7.5, 20.5, 2.5)): add(mus, mbox(mtof(motif[k % len(motif)]), 3, det=(rng.random() - .5) * .02), t, .065, pan=(-.4 if k % 2 else .4))
for k, t in enumerate(np.arange(37.5, 46.0, 1.2)): add(mus, glass(mtof(76 + k), 2.4, att=.8), t, .035 + k * .004, pan=(-.5 if k % 2 else .5))
for ch in range(2):
    X = np.fft.rfft(mus[ch]); f = np.fft.rfftfreq(N, 1 / SR)
    mus[ch] = np.fft.irfft(X * (1 - .37 * np.exp(-((np.log2(f + 1) - np.log2(1000)) / 1.6) ** 2)), N)

# foley
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'step': add(fx, step_leaves(e['g']), t, .11, pan=e.get('pan', 0))
    elif ty == 'step6':   # the sixth set: heavier, closer, a little wrong (lower, longer)
        s = step_leaves(1.0); s = np.interp(np.arange(int(len(s) * 1.35)) / 1.35, np.arange(len(s)), s)
        add(fx, s, t, .2 * e['g'], pan=0)
    elif ty == 'radio':
        d = e['d']; m = int(d * SR); tt = np.arange(m) / SR
        st = fband(noise(d), 700, 4200) * (0.4 + .6 * (np.sin(2 * np.pi * 3.1 * tt) > -.2)) * np.interp(tt, [0, .2, d - .4, d], [0, 1, 1, 0])
        add(fx, st, t, .06, pan=-.1)
        add(fx, breath(1.6, 380), t + 2.6, .07, pan=-.1); add(fx, breath(1.4, 360), t + 4.4, .06, pan=-.1)
    elif ty == 'call':
        c = call(e['g'])
        if e.get('behind'): c = reverb(c, 1.4, .25)
        else: c = reverb(fband(c, 200, 2500), 2.6, .55)
        add(fx, c, t, .3 * e['g'], pan=e.get('pan', 0))
    elif ty == 'grab': add(fx, fband(noise(.25), 200, 1800) * np.exp(-np.arange(int(.25 * SR)) / SR * 14), t, .16)
    elif ty == 'whoosh': add(fx, swell(1.6), t, .05)
add(fx, hiss(1.2, 1.5), 7.4, .02)

wet = bus()
for ch in range(2): wet[ch] = reverb(mus[ch] + fx[ch] * .6, 2.4, .3) + fx[ch] * .4
mix = amb + wet
g = env(T, [(0, 1), (56.6, 1), (56.9, .3), (BLACK, .2), (BLACK + .4, 0), (DUR, 0)])
mix *= g
mix /= np.abs(mix).max() / .89
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(HERE, 'out', 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', DUR, 's')
