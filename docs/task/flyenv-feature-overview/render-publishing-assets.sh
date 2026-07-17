#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$ROOT/../../.." && pwd)"
BASE="$ROOT/flyenv_feature_overview_base_edited_1080p.mp4"
ASSETS="$ROOT/publishing-assets"
SERVICE_FRAME="$ASSETS/service-frame.png"
STARTUP_FRAME="$ASSETS/startup-group-frame.png"
ICON="$PROJECT_ROOT/build/icons/512x512.png"
WORDMARK="$PROJECT_ROOT/docs/task/flyenv-header-standardization/flyenv-wordmark.png"
YOUTUBE="$ROOT/flyenv_feature_overview_youtube_thumbnail.jpg"
BILIBILI="$ROOT/flyenv_feature_overview_bilibili_cover.jpg"
EN_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ZH_FONT="/System/Library/Fonts/Hiragino Sans GB.ttc"
HEADER_DURATION="5.085011"
SERVICE_SOURCE_TIME="280"
STARTUP_SOURCE_TIME="350"
SERVICE_TIMESTAMP="$(awk "BEGIN { printf \"%.6f\", $HEADER_DURATION + $SERVICE_SOURCE_TIME }")"
STARTUP_TIMESTAMP="$(awk "BEGIN { printf \"%.6f\", $HEADER_DURATION + $STARTUP_SOURCE_TIME }")"

mkdir -p "$ASSETS"

ffmpeg -y -hide_banner -loglevel error -ss "$SERVICE_TIMESTAMP" -i "$BASE" -frames:v 1 "$SERVICE_FRAME"
ffmpeg -y -hide_banner -loglevel error -ss "$STARTUP_TIMESTAMP" -i "$BASE" -frames:v 1 "$STARTUP_FRAME"

render_cover() {
  local output="$1"
  local font="$2"
  local line_one="$3"
  local line_two="$4"
  local badge="$5"

  magick "$SERVICE_FRAME" \
    -resize '1280x720^' -gravity center -extent 1280x720 \
    -fill 'rgba(3,7,18,0.86)' -draw 'rectangle 0,0 620,720' \
    -fill 'rgba(3,7,18,0.24)' -draw 'rectangle 620,0 1280,720' \
    \( "$ICON" -resize 78x78 \) -gravity northwest -geometry +70+54 -composite \
    \( "$WORDMARK" -resize 190x \) -gravity northwest -geometry +170+62 -composite \
    \( "$STARTUP_FRAME" -resize '470x264^' -gravity center -extent 470x264 \
       -bordercolor '#52b7ff' -border 3x3 \) \
       -gravity northwest -geometry +748+386 -composite \
    -gravity northwest -font "$font" -fill white -pointsize 66 \
    -annotate +70+225 "$line_one" \
    -fill '#52b7ff' -annotate +70+310 "$line_two" \
    -fill 'rgba(22,45,78,0.96)' -draw 'roundrectangle 70,440 540,505 16,16' \
    -font "$font" -fill white -pointsize 27 -annotate +94+484 "$badge" \
    -strip -quality 90 "$output"
}

render_cover "$YOUTUBE" "$EN_FONT" 'LOCAL DEV.' 'SIMPLIFIED' 'NATIVE · NO DOCKER'
render_cover "$BILIBILI" "$ZH_FONT" '本地开发' '一个应用' '原生运行 · 无需 Docker'

magick "$YOUTUBE" -resize 320x180 -quality 86 "$ASSETS/youtube-preview.jpg"
magick "$BILIBILI" -resize 320x180 -quality 86 "$ASSETS/bilibili-preview.jpg"

magick identify -format '%f %wx%h %m %b\n' "$YOUTUBE" "$BILIBILI"
