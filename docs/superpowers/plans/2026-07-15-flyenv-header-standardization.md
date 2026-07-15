# FlyEnv Header Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a deterministic five-second FlyEnv header master with exact branding, constant 30 fps video, 48 kHz stereo audio, and a clean black tail while preserving the Dreamina source unchanged.

**Architecture:** A task-local shell script renders a deterministic SVG wordmark to PNG, overlays it during the source Logo hold, normalizes delivery timing and codecs, and extracts verification frames. A Node acceptance script validates the source checksum and final media contract before the master is committed.

**Tech Stack:** FFmpeg/FFprobe, ImageMagick, Bash, Node.js assertions, H.264/AAC MP4.

**Workspace constraint:** Execute directly in the current `master` workspace as requested. Preserve `docs/flyenv-header.mp4` and use exact-path `git commit --only` commands because unrelated user changes exist elsewhere.

---

## File map

- Preserve `docs/flyenv-header.mp4`: immutable Dreamina source.
- Create `docs/flyenv-header-master.mp4`: standardized delivery master.
- Create `docs/task/flyenv-header-standardization/flyenv-wordmark.svg`: deterministic exact wordmark source.
- Create `docs/task/flyenv-header-standardization/flyenv-wordmark.png`: transparent rendered overlay.
- Create `docs/task/flyenv-header-standardization/render-header.sh`: reproducible render pipeline.
- Create `docs/task/flyenv-header-standardization/verify-header.mjs`: automated source/output contract checks.
- Create `docs/task/flyenv-header-standardization/verification/*.png`: opening, wordmark, fade, and black-tail frames.

### Task 1: Build the failing media-contract verifier

**Files:**

- Create: `docs/task/flyenv-header-standardization/verify-header.mjs`

- [ ] **Step 1: Write the acceptance script before creating the master**

Create `verify-header.mjs` with this complete content:

```js
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const taskDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(taskDir, '../../..')
const source = path.join(root, 'docs/flyenv-header.mp4')
const output = path.join(root, 'docs/flyenv-header-master.mp4')
const expectedSourceSha = 'e355298039326367e072b9d467e851eee3ed9a635adf43994d8f1eeb134c1c02'

function sha256(filename) {
  const result = execFileSync('openssl', ['dgst', '-sha256', filename], { encoding: 'utf8' })
  return result.trim().split('= ').at(-1)
}

function probe(filename) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,sample_rate,channels',
        '-of',
        'json',
        filename
      ],
      { encoding: 'utf8' }
    )
  )
}

assert.equal(sha256(source), expectedSourceSha, 'source checksum changed')
assert.equal(existsSync(output), true, 'standardized master is missing')

const metadata = probe(output)
const video = metadata.streams.find((stream) => stream.codec_type === 'video')
const audio = metadata.streams.find((stream) => stream.codec_type === 'audio')
const duration = Number(metadata.format.duration)

assert.ok(duration >= 4.95 && duration <= 5.05, `duration=${duration}`)
assert.ok(video)
assert.equal(video.codec_name, 'h264')
assert.equal(video.profile, 'High')
assert.equal(video.width, 1920)
assert.equal(video.height, 1080)
assert.equal(video.pix_fmt, 'yuv420p')
assert.equal(video.r_frame_rate, '30/1')
assert.equal(video.avg_frame_rate, '30/1')
assert.ok(audio)
assert.equal(audio.codec_name, 'aac')
assert.equal(audio.sample_rate, '48000')
assert.equal(audio.channels, 2)

for (const filename of ['opening.png', 'wordmark.png', 'fade.png', 'tail.png']) {
  assert.equal(
    existsSync(path.join(taskDir, 'verification', filename)),
    true,
    `missing verification/${filename}`
  )
}

console.log('FlyEnv header master contract verified')
```

- [ ] **Step 2: Run the verifier and confirm the expected red state**

```bash
node docs/task/flyenv-header-standardization/verify-header.mjs
```

Expected: assertion failure `standardized master is missing`; the source checksum assertion passes first.

### Task 2: Create the deterministic wordmark and render pipeline

**Files:**

- Create: `docs/task/flyenv-header-standardization/flyenv-wordmark.svg`
- Create: `docs/task/flyenv-header-standardization/render-header.sh`
- Generate: `docs/task/flyenv-header-standardization/flyenv-wordmark.png`
- Generate: `docs/flyenv-header-master.mp4`
- Generate: `docs/task/flyenv-header-standardization/verification/*.png`

- [ ] **Step 1: Create the exact FlyEnv wordmark SVG**

Create `flyenv-wordmark.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="560" height="150" viewBox="0 0 560 150">
  <defs>
    <filter id="glow" x="-30%" y="-50%" width="160%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feFlood flood-color="#57dcff" flood-opacity="0.5"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <text x="280" y="108" text-anchor="middle" font-family="Arial" font-size="96" font-weight="700" letter-spacing="1" fill="#ffffff" filter="url(#glow)">FlyEnv</text>
</svg>
```

- [ ] **Step 2: Create the reproducible render script**

Create `render-header.sh` with:

```bash
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
  -filter_complex "[0:v]trim=duration=5,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[base];[1:v]trim=duration=5,setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=4.00:d=0.15:alpha=1,fade=t=out:st=4.55:d=0.15:alpha=1[wordmark];[base][wordmark]overlay=680:700:shortest=0:eof_action=pass,fade=t=out:st=4.70:d=0.23,format=yuv420p[video];[0:a]atrim=duration=5,asetpts=PTS-STARTPTS,aresample=48000,afade=t=out:st=4.70:d=0.23[audio]" \
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
```

- [ ] **Step 3: Make the render script executable and render the master**

```bash
chmod +x docs/task/flyenv-header-standardization/render-header.sh
docs/task/flyenv-header-standardization/render-header.sh
```

Expected: ImageMagick creates a transparent 560×150 PNG; FFmpeg writes `docs/flyenv-header-master.mp4` and four verification frames without errors.

- [ ] **Step 4: Run the media-contract verifier and confirm green**

```bash
node docs/task/flyenv-header-standardization/verify-header.mjs
```

Expected: `FlyEnv header master contract verified`.

### Task 3: Verify visual treatment and audio delivery

**Files:**

- Verify: `docs/flyenv-header-master.mp4`
- Verify: `docs/task/flyenv-header-standardization/verification/*.png`

- [ ] **Step 1: Measure output loudness and peak**

```bash
ffmpeg -hide_banner -nostats -i docs/flyenv-header-master.mp4 -filter_complex ebur128=peak=true -f null -
```

Expected summary: integrated loudness from -16.3 to -13.3 LUFS and true peak below -1 dBFS.

- [ ] **Step 2: Verify the tail is black**

```bash
magick docs/task/flyenv-header-standardization/verification/tail.png -colorspace gray -format '%[fx:mean]\n' info:
```

Expected: mean luminance no greater than `0.01`.

- [ ] **Step 3: Inspect the four verification frames**

Open `opening.png`, `wordmark.png`, `fade.png`, and `tail.png` with the local image viewer.

Expected:

- opening: unchanged monitor scene and no wordmark;
- wordmark: exact `FlyEnv`, centered below the existing Logo, no overlap or clipping;
- fade: the frame is visibly fading toward black;
- tail: fully black.

- [ ] **Step 4: Re-run the source checksum and acceptance verifier**

```bash
openssl dgst -sha256 docs/flyenv-header.mp4
node docs/task/flyenv-header-standardization/verify-header.mjs
```

Expected checksum: `e355298039326367e072b9d467e851eee3ed9a635adf43994d8f1eeb134c1c02`; verifier passes.

- [ ] **Step 5: Check task-local diffs**

```bash
git diff --check -- docs/flyenv-header-master.mp4 docs/task/flyenv-header-standardization
git status --short -- docs/flyenv-header.mp4 docs/flyenv-header-master.mp4 docs/task/flyenv-header-standardization
```

Expected: the source is absent from status; only the new master and task-local assets appear.

- [ ] **Step 6: Commit the standardized master with path isolation**

```bash
git add docs/flyenv-header-master.mp4 docs/task/flyenv-header-standardization
git commit --only -m "feat: add standardized FlyEnv header master" -- docs/flyenv-header-master.mp4 docs/task/flyenv-header-standardization
```

Expected: one commit containing the master, render/verify scripts, wordmark assets, and verification frames; source remains unchanged.
