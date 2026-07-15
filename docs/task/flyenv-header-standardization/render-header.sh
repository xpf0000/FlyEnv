#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SOURCE="$ROOT/docs/flyenv-header.mp4"
OUTPUT="$ROOT/docs/flyenv-header-master.mp4"
TASK_DIR="$ROOT/docs/task/flyenv-header-standardization"
WORDMARK_SVG="$TASK_DIR/flyenv-wordmark.svg"
WORDMARK_PNG="$TASK_DIR/flyenv-wordmark.png"
VERIFY_DIR="$TASK_DIR/verification"

mkdir -p "$VERIFY_DIR"

magick -background none "$WORDMARK_SVG" "$WORDMARK_PNG"

ffmpeg -y \
  -i "$SOURCE" \
  -loop 1 -framerate 30 -i "$WORDMARK_PNG" \
  -filter_complex "[0:v]trim=duration=5,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[base];[1:v]trim=duration=5,setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=4.00:d=0.15:alpha=1,fade=t=out:st=4.55:d=0.15:alpha=1[wordmark];[base][wordmark]overlay=680:800:shortest=0:eof_action=pass,fade=t=out:st=4.70:d=0.23,format=yuv420p[video];[0:a]atrim=duration=5,asetpts=PTS-STARTPTS,aresample=48000,afade=t=out:st=4.70:d=0.23[audio]" \
  -map "[video]" -map "[audio]" \
  -map_metadata 0 \
  -metadata title="FlyEnv Standard Header Master" \
  -c:v libx264 -profile:v high -level:v 4.1 -preset slow -crf 18 \
  -pix_fmt yuv420p -r 30 -fps_mode cfr -g 60 \
  -c:a aac -ar 48000 -ac 2 -b:a 192k \
  -movflags +faststart \
  -t 5 \
  "$OUTPUT"

ffmpeg -y -hide_banner -loglevel error -ss 0.50 -i "$OUTPUT" -frames:v 1 "$VERIFY_DIR/opening.png"
ffmpeg -y -hide_banner -loglevel error -ss 4.20 -i "$OUTPUT" -frames:v 1 "$VERIFY_DIR/wordmark.png"
ffmpeg -y -hide_banner -loglevel error -ss 4.85 -i "$OUTPUT" -frames:v 1 "$VERIFY_DIR/fade.png"
ffmpeg -y -hide_banner -loglevel error -ss 4.96 -i "$OUTPUT" -frames:v 1 "$VERIFY_DIR/tail.png"
