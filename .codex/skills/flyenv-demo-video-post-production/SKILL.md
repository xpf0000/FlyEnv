---
name: flyenv-demo-video-post-production
description: Use when editing recorded FlyEnv screen demos into publishable videos, especially when a raw capture needs continuity-first speed ramping, a clean end cut, burned English subtitles, AI voiceover, thumbnail art, and YouTube or Bilibili upload assets.
---

# FlyEnv Demo Video Post Production

## Overview

Turn a raw FlyEnv screen recording into a publishable demo package without rebuilding the story from scratch.
Favor continuity, speed changes, and targeted trims over aggressive recuts.

## Workflow

1. Inspect the source video first.
   - Run `ffprobe` for duration, resolution, frame rate, codec, and audio presence.
   - If there is no audio, write step captions and narration from the workflow itself. Do not pretend to transcribe speech.
2. Review frames before editing.
   - Sample the opening, several middle checkpoints, the browser walkthrough, and the final 30 to 60 seconds.
   - Find the last good product frame before any blank transition, unrelated app, or mistake. End the cut there.
3. Create a task workspace under `docs/task/<slug>/`.
   - Keep the source untouched.
   - Save the render script, subtitles, voiceover, verification frames, thumbnail, and upload notes in the same folder.
4. Build a task-local render script.
   - Structure it as: base edit -> subtitles -> title card and subtitle burn-in -> voiceover mix -> final mux -> upload assets.
   - Reuse `/Users/x/.codex/skills/demo-video-pipeline/scripts/compose_demo_video.py` for intro and subtitle overlays.
5. Edit for continuity first.
   - Keep the opening and browser walkthrough at `1.0x`.
   - Use `1.25x` to `2.1x` for long terminal or waiting sections.
   - Hard-cut only obvious dead air or a broken tail.
6. Prefer neural English TTS.
   - First choices: `en-US-BrianNeural`, `en-US-AndrewNeural`, `en-US-EmmaNeural`, `en-US-AvaNeural`.
   - Start around `--rate=-6%` and adjust only if the read feels rushed.
   - If `pip` is blocked by PEP 668, create a task-local venv under `docs/task/<slug>/.venv`.
   - Use macOS `say` only as a fallback.
7. Keep narration short and spoken.
   - Use direct sentences that describe what is happening now.
   - Remove abstract filler and “AI summary” phrasing.
8. Separate video rebuilds from audio rebuilds.
   - If the pacing and cut are already correct, regenerate only the narration and remux the final MP4.
   - Do not re-encode the full video just to change the voice.
9. Package the publishing assets.
   - Use a real product frame for the thumbnail.
   - Keep thumbnail copy short and large.
   - Write a Markdown upload package with title, description, chapters, tags, and file list.

## Project Defaults

- Export `1920x1080`, `30fps`, H.264 video, AAC audio, `+faststart`.
- Keep source recordings in place and write outputs into `docs/task/<slug>/`.
- Name artifacts consistently:
  - `*_base_edited_1080p.mp4`
  - `*_en_subtitled.mp4`
  - `*_en_voiceover.wav`
  - `*_en_final.mp4`
  - `*_en_subtitles.srt`
  - `*_youtube_thumbnail.png`
  - `youtube_upload_package.md`
- Use `ffmpeg`, `ffprobe`, and `magick` as the default toolchain.

## What Worked For FlyEnv

- Preserve the full workflow and compress mainly with speed ramps.
- Downscale 4K screen recordings to a 1080p publishable master.
- Keep terminal-heavy steps faster and browser interaction slower.
- End on the working product page and cut before any unrelated screen.
- Switch from `say` to Edge neural TTS when the voice sounds too synthetic.
- Add an audio-only rebuild path so voice improvements stay cheap.

## Avoid

- Aggressive cuts that make the demo hard to follow.
- Leaving a broken tail after the final successful browser view.
- Re-encoding the whole video when only narration changed.
- Overlong thumbnail text blocks.
- Creating extra planning or review docs for straightforward post-production passes.

## References

- Read [references/retrospective.md](references/retrospective.md) for the concrete lessons from the July 2026 FlyEnv demo edit.
- If a task-specific render script already exists in the task folder, patch it instead of rewriting it.
