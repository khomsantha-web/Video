#!/bin/sh
# One command: picture (with and without subtitles) -> mix -> mux + loudness -14 LUFS -> srt.
# Needs: Node 20+ with Playwright + Chromium, ffmpeg, python3 + numpy.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"
mkdir -p out
node render.mjs events
python3 mix.py
node render.mjs video --out out/video.mp4 --workers ${WORKERS:-3}
node render.mjs video --out out/video-nosubs.mp4 --subs 0 --workers ${WORKERS:-3}
mux() {   # video, out — two-pass loudnorm to -14 LUFS / -1 dBTP, no grain (paper texture is in the picture)
  J=$(ffmpeg -hide_banner -i out/mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  v() { echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -y -loglevel error -i "$1" -i out/mix.wav \
    -filter_complex "[1:a]loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true,aresample=48000[a]" \
    -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "$2"
}
mux out/video.mp4 out/ep02.mp4
mux out/video-nosubs.mp4 out/ep02-no-subs.mp4
python3 srt.py out/ep02.srt
cp out/ep02.srt ../ep02.srt
ffmpeg -ss 47 -i out/ep02.mp4 -frames:v 1 -q:v 3 -y -loglevel error out/poster.jpg
echo "done: out/ep02.mp4 out/ep02-no-subs.mp4 out/ep02.srt"
