"""timeline.json subs -> .srt (the '/' line breaks become real line breaks)"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
tl = json.load(open(os.path.join(HERE, 'timeline.json')))
def ts(t):
    ms = round(t * 1000); return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
out = []
for i, s in enumerate(tl['subs'], 1):
    out.append(f"{i}\n{ts(s['t0'])} --> {ts(s['t1'])}\n" + s['text'].replace('/', '\n') + "\n")
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(out))
