#!/bin/sh
# EP01 liminal test (before the forest, 10 s). Needs the lemo-opuscar library for the renderer (LIB), ffmpeg, python3 + numpy.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}
mkdir -p "$HERE/out"
(cd "$LIB" && node core/render/video.mjs "$HERE" --fps 30 --workers ${WORKERS:-3} --size 1080x1920 --out "$HERE/out/video.mp4")
python3 "$HERE/mix.py"
J=$(ffmpeg -hide_banner -i "$HERE/out/mix.wav" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
v() { echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -loglevel error -i "$HERE/out/video.mp4" -i "$HERE/out/mix.wav" -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true,aresample=48000" \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$HERE/out/liminal-test.mp4"
echo "done: $HERE/out/liminal-test.mp4"
