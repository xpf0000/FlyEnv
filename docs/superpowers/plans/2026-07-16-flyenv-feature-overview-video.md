# FlyEnv Feature Overview Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a complete, uncompressed FlyEnv overview video with the supplied header, expanded English narration in `en-US-BrianNeural`, burned English subtitles, and a verified 1080p MP4.

**Architecture:** Keep the source recordings untouched and place every generated asset under `docs/task/flyenv-feature-overview/`. A task-local render script will normalize and concatenate the header plus the full source, generate timestamped TTS clips from a single narration manifest, build the subtitle TSV/SRT from measured clip durations, burn subtitle PNG bars with the shared `compose_demo_video.py` utility, and mux the narration with the header music.

**Tech Stack:** `ffmpeg`, `ffprobe`, ImageMagick, Python 3.12, task-local `edge-tts`, Microsoft `en-US-BrianNeural`, H.264/AAC MP4.

---

### Task 1: Create the task workspace and lock source properties

**Files:**
- Create: `docs/task/flyenv-feature-overview/.venv/`
- Create: `docs/task/flyenv-feature-overview/README.md`
- Create: `docs/task/flyenv-feature-overview/source-probe.json`
- Create: `docs/task/flyenv-feature-overview/header-probe.json`

- [ ] **Step 1: Create the isolated task directory and Python environment**

Run:

```bash
mkdir -p docs/task/flyenv-feature-overview/{tts,verification-frames}
python3 -m venv docs/task/flyenv-feature-overview/.venv
docs/task/flyenv-feature-overview/.venv/bin/python -m pip install --upgrade pip edge-tts
```

Expected: the venv contains an `edge-tts` executable and the repository-wide Python installation is unchanged.

- [ ] **Step 2: Probe both source videos and save the JSON output**

Run:

```bash
ffprobe -v error -show_entries format=filename,duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,pix_fmt -of json "docs/Kapture 2026-07-16 at 22.32.08.mp4" > docs/task/flyenv-feature-overview/source-probe.json
ffprobe -v error -show_entries format=filename,duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,pix_fmt -of json docs/flyenv-header.mp4 > docs/task/flyenv-feature-overview/header-probe.json
```

Expected: the source probe records a 3840×2160, 30fps H.264 video with no audio stream; the header probe records a 1920×1080 video with AAC audio and a duration of about 5.085 seconds.

- [ ] **Step 3: Record the agreed output contract in README.md**

Write these concrete values into `README.md`: full source duration 774.300 seconds, header duration 5.085011 seconds, expected final duration about 779.385 seconds, 1920×1080, 30fps, H.264, AAC, `+faststart`, no source speed changes, and `en-US-BrianNeural` at `-6%`.

- [ ] **Step 4: Confirm the task-local TTS voice before generating media**

Run:

```bash
docs/task/flyenv-feature-overview/.venv/bin/edge-tts --list-voices | rg '^en-US-(Brian|Andrew|Emma|Ava)Neural'
```

Expected: `en-US-BrianNeural` is listed. Stop before producing audio if that exact voice is unavailable.

### Task 2: Review the full timeline and write the expanded narration manifest

**Files:**
- Create: `docs/task/flyenv-feature-overview/review/source-10s-01.jpg`
- Create: `docs/task/flyenv-feature-overview/review/source-10s-02.jpg`
- Create: `docs/task/flyenv-feature-overview/review/source-10s-03.jpg`
- Create: `docs/task/flyenv-feature-overview/review/source-10s-04.jpg`
- Create: `docs/task/flyenv-feature-overview/narration_segments.json`
- Create: `docs/task/flyenv-feature-overview/narration-en.txt`

- [ ] **Step 1: Generate 10-second contact sheets with the source unchanged**

Run:

```bash
mkdir -p docs/task/flyenv-feature-overview/review
ffmpeg -hide_banner -loglevel error -i "docs/Kapture 2026-07-16 at 22.32.08.mp4" -vf "fps=1/10,scale=768:432,tile=5x5:padding=4:margin=4" -frames:v 4 docs/task/flyenv-feature-overview/review/source-10s-%02d.jpg
```

Expected: four sheets cover 0–774 seconds in order. Use them to mark the real screen transitions; do not infer a feature boundary from the user’s list when the recording shows a different order.

- [ ] **Step 2: Create the narration manifest with source-relative anchors**

Use this JSON shape for every spoken sentence:

```json
[
  {
    "source_start": 0.0,
    "chapter": "overview",
    "text": "FlyEnv brings the everyday pieces of a local development stack into one focused workspace."
  }
]
```

Populate the manifest in the actual visual order with complete English sentences. Cover the opening orientation, module visibility, version browsing and downloading, service management, startup groups, site demonstration, built-in tools, language and theme settings, and the final summary. Each sentence must explain at least one of: what is on screen, why the design exists, or the practical benefit for a developer. Keep one idea per sentence and leave enough silent space for the UI to be understood.

- [ ] **Step 3: Self-check narration against the seven requested feature blocks**

Run:

```bash
rg -n "module|version|service|startup|site|tool|language|theme|benefit|project|focus|switch" docs/task/flyenv-feature-overview/narration-en.txt
```

Expected: every requested block has at least one explanatory sentence and no sentence claims a feature not visible in the source recording.

- [ ] **Step 4: Write narration-en.txt from the manifest**

Write one timestamp-free sentence per line, in the exact same order as `narration_segments.json`. This is the human-review copy; the JSON remains the timing source of truth.

### Task 3: Generate and measure Brian Neural TTS

**Files:**
- Create: `docs/task/flyenv-feature-overview/build_narration.py`
- Create: `docs/task/flyenv-feature-overview/tts/segment-001.mp3` through the final segment file
- Create: `docs/task/flyenv-feature-overview/tts/segment-durations.json`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_voiceover.wav`

- [ ] **Step 1: Generate one MP3 per narration sentence**

For each manifest entry, run the task-local executable with the exact voice and rate:

```bash
docs/task/flyenv-feature-overview/.venv/bin/edge-tts --voice en-US-BrianNeural --rate=-6% --text "FlyEnv brings the everyday pieces of a local development stack into one focused workspace." --write-media docs/task/flyenv-feature-overview/tts/segment-001.mp3
```

Implement `build_narration.py` to read each `text` value directly from `narration_segments.json`, invoke the task-local `edge-tts` executable as a subprocess argument list, and name files sequentially. The command above is the exact first-segment equivalent used to verify the CLI.

- [ ] **Step 2: Convert each clip to a consistent WAV format and measure it**

Run for every generated MP3:

```bash
ffmpeg -y -i docs/task/flyenv-feature-overview/tts/segment-001.mp3 -ar 48000 -ac 2 -c:a pcm_s16le docs/task/flyenv-feature-overview/tts/segment-001.wav
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 docs/task/flyenv-feature-overview/tts/segment-001.wav
```

Write the measured durations to `segment-durations.json` and fail the render if any clip extends beyond the next planned sentence anchor. A sentence that does not fit must be shortened or moved, not silently overlapped.

- [ ] **Step 3: Build the full voiceover WAV on the 779.385-second timeline**

Create a 48 kHz stereo silent bed and place each measured segment at `5.085011 + source_start` seconds. Use `adelay` for placement and `amix` with `normalize=0`; keep the header’s original music separate for the final mux. Export 16-bit PCM WAV as `flyenv_feature_overview_en_voiceover.wav`.

- [ ] **Step 4: Listen to the first, middle, and last narration clips**

Extract or play `segment-001.wav`, one segment from the startup-group chapter, and the final summary segment. Expected: the voice is clearly American English, calm, not clipped, and not noticeably rushed.

### Task 4: Normalize and concatenate the header plus the complete source

**Files:**
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_base_edited_1080p.mp4`
- Create: `docs/task/flyenv-feature-overview/render-video.sh`

- [ ] **Step 1: Normalize both video inputs to the release format**

In `render-video.sh`, use `ffmpeg` filters equivalent to:

```text
scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p
```

Use the header’s AAC audio as-is after resampling to 48 kHz stereo, and generate exactly 774.300 seconds of silent 48 kHz stereo audio for the source recording.

- [ ] **Step 2: Concatenate header and source without changing their order**

Use the FFmpeg concat filter with two video/audio pairs, then encode H.264/AAC with `-movflags +faststart`. The output duration must be approximately 779.385 seconds and must contain the header music only in the first 5.085 seconds.

- [ ] **Step 3: Probe the base output before adding subtitles**

Run:

```bash
ffprobe -v error -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,duration -show_entries format=duration -of json docs/task/flyenv-feature-overview/flyenv_feature_overview_base_edited_1080p.mp4
```

Expected: 1920×1080, 30fps video; AAC audio; duration within 0.1 seconds of 779.385 seconds.

### Task 5: Generate synchronized subtitles and burn them into the video

**Files:**
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitles.tsv`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitles.srt`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitled_silent.mp4`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitled.mp4`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4`

- [ ] **Step 1: Convert measured TTS durations into final-timeline subtitle rows**

For each segment, write a TSV row with final-timeline start, final-timeline end, and the exact narration text. Start times are `5.085011 + source_start`; end times are `start + measured_wav_duration`, shortened by 0.05 seconds if necessary to avoid an overlap. Use the same rows to generate standard SRT timestamps.

- [ ] **Step 2: Burn subtitle bars with the shared composition utility**

Run:

```bash
python /Users/x/.codex/skills/demo-video-pipeline/scripts/compose_demo_video.py \
  --input docs/task/flyenv-feature-overview/flyenv_feature_overview_base_edited_1080p.mp4 \
  --output docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitled_silent.mp4 \
  --intro-title "" \
  --intro-subtitle "" \
  --intro-bg none \
  --subtitles docs/task/flyenv-feature-overview/flyenv_feature_overview_en_subtitles.tsv \
  --duration 779.385 \
  --font Arial \
  --crf 18 \
  --preset veryfast
```

The empty transparent intro overlay preserves the supplied header instead of replacing it with a generated title card. The subtitle bar is scaled for the 1080p master and positioned in the lower safe area.

- [ ] **Step 3: Mux the burned video with header music and the full voiceover**

Use the burned silent video, the base output’s header-plus-silence audio, and `flyenv_feature_overview_en_voiceover.wav`; mix the two audio streams without changing video timestamps. Export `flyenv_feature_overview_en_final.mp4` as H.264/AAC with `+faststart`.

- [ ] **Step 4: Produce the named subtitle deliverable**

Copy or remux the burned-and-narrated output to `flyenv_feature_overview_en_subtitled.mp4` so the task directory contains both the intermediate subtitle render and the complete subtitle deliverable. Keep the silent intermediate named `*_en_subtitled_silent.mp4` for debugging.

### Task 6: Verify the final package before reporting completion

**Files:**
- Create: `docs/task/flyenv-feature-overview/verification-frames/opening.png`
- Create: `docs/task/flyenv-feature-overview/verification-frames/early-subtitle.png`
- Create: `docs/task/flyenv-feature-overview/verification-frames/middle-subtitle.png`
- Create: `docs/task/flyenv-feature-overview/verification-frames/late-subtitle.png`
- Create: `docs/task/flyenv-feature-overview/verification-frames/ending.png`
- Create: `docs/task/flyenv-feature-overview/final-probe.json`

- [ ] **Step 1: Probe the final video and voiceover**

Run:

```bash
ffprobe -v error -show_entries stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,duration -show_entries format=duration,bit_rate -of json docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 > docs/task/flyenv-feature-overview/final-probe.json
ffprobe -v error -show_entries format=duration,sample_rate,channels -of default=nw=1 docs/task/flyenv-feature-overview/flyenv_feature_overview_en_voiceover.wav
```

Expected: 1920×1080, 30fps, H.264 video, AAC audio, approximately 779.385 seconds, and a 48 kHz stereo voiceover WAV.

- [ ] **Step 2: Extract verification frames**

Run:

```bash
ffmpeg -y -ss 1 -i docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 -frames:v 1 docs/task/flyenv-feature-overview/verification-frames/opening.png
ffmpeg -y -ss 18 -i docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 -frames:v 1 docs/task/flyenv-feature-overview/verification-frames/early-subtitle.png
ffmpeg -y -ss 360 -i docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 -frames:v 1 docs/task/flyenv-feature-overview/verification-frames/middle-subtitle.png
ffmpeg -y -ss 650 -i docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 -frames:v 1 docs/task/flyenv-feature-overview/verification-frames/late-subtitle.png
ffmpeg -y -ss 777 -i docs/task/flyenv-feature-overview/flyenv_feature_overview_en_final.mp4 -frames:v 1 docs/task/flyenv-feature-overview/verification-frames/ending.png
```

Inspect all five frames. The opening must show the supplied header, subtitle frames must show readable English text without covering important controls, and the ending must remain on a valid FlyEnv screen rather than a black or unrelated frame.

- [ ] **Step 3: Check subtitle and audio continuity**

Verify that every SRT row has `end > start`, rows are ordered, narration clips do not overlap, and the first spoken sentence starts after the header transition. Listen through the first 30 seconds and the last 30 seconds for abrupt music, voice, or silence changes.

- [ ] **Step 4: Record the final artifact list**

Append the final filenames, measured duration, codec summary, voice ID, and verification result to `docs/task/flyenv-feature-overview/README.md`.
