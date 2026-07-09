# FlyEnv Demo Video Retrospective

## Task Profile

- Source file: `docs/Kapture 2026-07-08 at 23.32.25.mp4`
- Source profile: `3840x2160`, `30fps`, `625s`, no audio track
- Final deliverable: English voiceover, burned English subtitles, intro card, thumbnail, and YouTube upload package

## Editing Decisions That Worked

### 1. Preserve continuity and compress with speed

The recording was not shortened through aggressive recuts. The better result came from keeping the workflow intact and speeding up long terminal sections.

Working pattern from this task:

- opening and browser walkthrough: `1.0x`
- setup and database sections: `1.25x` to `1.7x`
- long app-generation stretches: `1.9x` to `2.1x`

### 2. End before the broken tail

The recording drifted into an unwanted context switch near the end.

Useful checkpoints from this task:

- good browser page: around `09:20`, `09:50`, `09:54`
- bad transition starts: around `09:58`
- unrelated phpMyAdmin view: around `10:02`

The final cut used source end `592.5s` so the export fades out on the good site page.

### 3. Downscale 4K to 1080p for the publishable master

The source was 4K, but the release version was exported at `1920x1080`. This kept file size and encode time under control without hurting legibility for the terminal and browser UI.

## Voiceover Lessons

### First pass that was acceptable technically but weak stylistically

- Provider: macOS `say`
- Voice: `Eddy (English (US))`
- Result: understandable, but noticeably synthetic

### Better second pass

- Provider: `edge-tts`
- Voice: `en-US-BrianNeural`
- Rate: `-6%`
- Result: more natural and better suited to product-demo narration

### Practical fallback pattern

1. Prefer `edge-tts` in a local venv.
2. If system Python blocks package install with PEP 668, create `docs/task/<slug>/.venv`.
3. Rebuild only the voiceover and final mux when changing the voice.
4. Use macOS `say` only if neural TTS is not available.

## Render Pipeline Shape

The working task-local script followed this order:

1. Base 1080p edit with segment speed map
2. Subtitle TSV and SRT generation
3. Intro card and subtitle burn-in using `compose_demo_video.py`
4. TTS segment generation
5. Voiceover mix
6. Final mux
7. Upload package and thumbnail generation

This shape worked because each stage was independently replaceable. The most important separation was keeping audio regeneration independent from the base video render.

## Verification That Caught Real Problems

Run these checks before calling the video done:

- `ffprobe` on the final MP4
- `ffprobe` on the voiceover WAV
- extract opening frame
- extract middle subtitle frame
- extract final browser frame
- extract a tail frame near fade-out

The tail frame check mattered because it verified that the unrelated phpMyAdmin switch did not leak into the final export.

## Deliverables Produced In This Task

- final MP4
- voiceover WAV
- subtitle TSV
- subtitle SRT
- thumbnail PNG
- upload package Markdown
- task-local render script

## Reusable Defaults

- Keep all post-production artifacts inside `docs/task/<slug>/`
- Name the final video `*_en_final.mp4`
- Generate thumbnail text from the final successful browser page, not from the opening prompt page
- Prefer simple dark thumbnail overlays with short text
- When the user says the voice is too AI-sounding, change the TTS provider before rewriting the whole edit
