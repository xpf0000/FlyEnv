#!/usr/bin/env zsh
set -euo pipefail

root="${0:A:h}"
prompt="$(<"$root/prompt-zh.txt")"

kling image_to_video \
  --model kling-video-v3_0_omni \
  --image "$root/references/modules-a.png" \
  --image "$root/references/modules-b.png" \
  --image "$root/references/modules-c.png" \
  --image "$root/references/flyenv-logo.png" \
  --image "$root/references/spatial-style.png" \
  --image "$root/references/end-card.png" \
  --duration 8 \
  --aspect_ratio 16:9 \
  --resolution 1080p \
  --prefer_multi_shots false \
  --enable_audio true \
  --task-trace-id 019f5be3-2843-711a-a95c-3d8a7a1a5f59 \
  --rationale "User approved a single-shot eight-second FlyEnv brand intro with six official reference boards, native synchronized audio, 1080p output, and no post-generation repairs." \
  --skill-name kling-cli \
  --skill-version 0.1.3 \
  "$prompt" | tee "$root/generation-submit.json"
