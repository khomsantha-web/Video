#!/usr/bin/env python3
"""ประกอบวิดีโอแนวตั้ง 1080x1920 จากภาพที่คุณสร้างด้วย AI
   ใช้: python3 build_video.py shots.json ภาพ/ซับ.srt out.mp4 [--music เพลง.mp3]
   - ภาพแต่ละช็อตตั้งชื่อตาม "file" ใน shots.json (ถ้าไม่มีไฟล์ จะสร้างภาพแทนที่ชั่วคราวให้ดูจังหวะก่อน)
   - ใส่การเคลื่อนกล้อง (ซูม/แพน/เงย) + ครอสเฟด + ซับไทยฝังภาพ + เสียงบรรยากาศสังเคราะห์ (ไม่มีเสียงพูด) -> −14 LUFS
"""
import json, os, subprocess, sys, argparse, tempfile, shutil
import numpy as np, wave
HERE = os.path.dirname(os.path.abspath(__file__)); W, H, FPS, F = 1080, 1920, 30, 0.5
ap = argparse.ArgumentParser(); ap.add_argument('shots'); ap.add_argument('imgdir'); ap.add_argument('srt'); ap.add_argument('out')
ap.add_argument('--music'); ap.add_argument('--fonts', default=os.path.join(HERE, '..', '..', 'ep01', 'src', 'fonts')); a = ap.parse_args()
cfg = json.load(open(a.shots)); shots = cfg['shots']; total = sum(s['dur'] for s in shots)
tmp = tempfile.mkdtemp(); sh = lambda c: subprocess.run(c, check=True)
# 0) ภาพ placeholder ถ้ายังไม่มีไฟล์จริง
from PIL import Image, ImageDraw
for i, s in enumerate(shots):
    p = os.path.join(a.imgdir, s['file'])
    if not os.path.exists(p):
        im = Image.new('RGB', (W, H), (40 + i * 12 % 120, 60, 90)); d = ImageDraw.Draw(im); d.text((60, 60), f"PLACEHOLDER {s['id']} {s['file']}", fill='white'); os.makedirs(a.imgdir, exist_ok=True); im.save(p); print('placeholder:', s['file'])
# 1) ซับ
sub_dir = os.path.join(tmp, 'subs'); sh(['node', os.path.join(HERE, 'render_subs.cjs'), a.srt, sub_dir, a.fonts]); subs = json.load(open(os.path.join(sub_dir, 'subs.json')))
# 2) คลิปต่อช็อต
def zp(motion, n):
    z = {'zoom_in': f"z='1+0.14*on/{n}'", 'zoom_out': f"z='1.14-0.14*on/{n}'", 'still': "z='1.03'", 'pan_right': "z='1.15'", 'pan_left': "z='1.15'", 'tilt_up': "z='1.15'", 'tilt_down': "z='1.15'"}[motion]
    x = {'pan_right': f"x='(iw-iw/zoom)*on/{n}'", 'pan_left': f"x='(iw-iw/zoom)*(1-on/{n})'"}.get(motion, "x='iw/2-iw/zoom/2'")
    y = {'tilt_up': f"y='(ih-ih/zoom)*(1-on/{n})'", 'tilt_down': f"y='(ih-ih/zoom)*on/{n}'"}.get(motion, "y='ih/2-ih/zoom/2'")
    return f"{z}:{x}:{y}"
clips = []
for i, s in enumerate(shots):
    n = int((s['dur'] + F) * FPS); c = os.path.join(tmp, f'c{i}.mp4')
    vf = f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},zoompan={zp(s.get('motion','zoom_in'), n)}:d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
    sh(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(a.imgdir, s['file']), '-vf', vf, '-frames:v', str(n), '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', c]); clips.append(c)
# 3) ครอสเฟดทั้งหมด + ซับ + จบด้วยภาพดำถ้ากำหนด
inp = sum([['-i', c] for c in clips], []) + sum([['-i', os.path.join(sub_dir, x['file'])] for x in subs], [])
fc, last, start = [], '[0:v]', 0.0
for k in range(1, len(clips)):
    start += shots[k-1]['dur']; fc.append(f"{last}[{k}:v]xfade=transition=fade:duration={F}:offset={start:.3f}[x{k}]"); last = f'[x{k}]'
for j, x in enumerate(subs):
    idx = len(clips) + j; fc.append(f"{last}[{idx}:v]overlay=0:0:enable='between(t,{x['start']},{x['end']})'[o{j}]"); last = f'[o{j}]'
fo = cfg.get('fade_out', 0.8); fc.append(f"{last}fade=t=out:st={total-fo:.2f}:d={fo}[v]")
vid = os.path.join(tmp, 'v.mp4'); sh(['ffmpeg', '-y', '-loglevel', 'error'] + inp + ['-filter_complex', ';'.join(fc), '-map', '[v]', '-t', str(total), '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', vid])
# 4) เสียงสังเคราะห์: ลม + ป่า + เครื่องยนต์ตาม cues ใน shots.json
sr = 44100; n = int(sr * total); t = np.arange(n) / sr; rng = np.random.default_rng(1)
lp = lambda x, k: np.convolve(x, np.ones(k) / k, 'same'); E = lambda a0, b0, f=.4: np.clip((t - a0) / f, 0, 1) * np.clip((b0 - t) / f, 0, 1)
wind = lp(rng.standard_normal(n), 300); wind = wind / np.abs(wind).max() * .16 * (.6 + .4 * np.sin(2 * np.pi * .17 * t) ** 2)
x = wind + (rng.standard_normal(n) - lp(rng.standard_normal(n), 30)) * .01 * (t > 5) + np.sin(2 * np.pi * 4300 * t) * (np.sin(2 * np.pi * 14 * t) > .6) * np.sin(2 * np.pi * .7 * t + 1) ** 2 * .025 * (t > 5)
for c in cfg.get('cues', []):
    s0, s1 = c['start'], c['end']; k = c['type']
    if k == 'engine': x += (np.sin(2*np.pi*92*t) + .6*np.sin(2*np.pi*184*t+1) + .3*np.sin(2*np.pi*46*t)) * (1 + .25*np.sin(2*np.pi*6*t)) * E(s0, s1, (s1-s0)/2) * .2
    elif k == 'pad': x += sum(np.sin(2*np.pi*f*t+p) for f, p in [(110, 0), (130.8, 1), (164.8, 2), (220, 3)]) * .028 * E(s0, s1, (s1-s0)/3)
    elif k == 'low': x += np.sin(2*np.pi*55*t) * .06 * E(s0, s1, (s1-s0)/3)
    elif k == 'rustle': m = int((s1-s0)*sr); i0 = int(s0*sr); b = np.zeros(n); b[i0:i0+m] = (rng.standard_normal(m) - lp(rng.standard_normal(m), 20)) * np.hanning(m) * .09; x += b
x = x / np.abs(x).max() * .7; pcm = os.path.join(tmp, 'a.wav'); wf = wave.open(pcm, 'wb'); wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(sr); wf.writeframes((np.stack([x, x], 1) * 32767).astype('<i2').tobytes()); wf.close()
ain, amix = ['-i', pcm], '[1:a]'
if a.music: ain += ['-stream_loop', '-1', '-i', a.music]; amix = '[1:a][2:a]amix=inputs=2:weights=1 .8:normalize=0[am];[am]'
sh(['ffmpeg', '-y', '-loglevel', 'error', '-i', vid] + ain + ['-filter_complex', amix + f'afade=t=out:st={total-1.2:.2f}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', str(total), a.out])
shutil.rmtree(tmp); print('OK ->', a.out, f'({total:.0f}s)')
