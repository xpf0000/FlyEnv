# FlyEnv Search and Storage Demo Post-production Design

## Scope

Produce publish-ready demo packages for the existing raw screen recordings:

- `docs/FlyEnv-Meilisearch.mp4`
- `docs/FlyEnv-Minio.mp4`
- `docs/FlyEnv-RustFS.mp4`
- `docs/FlyEnv-Typesense.mp4`
- `docs/FlyEnv-ZincSearch.mp4`

Each package will live under `docs/task/<module>-demo/`. Source recordings and
`docs/flyenv-header.mp4` remain unchanged.

## Editorial treatment

- Prepend the existing shared FlyEnv header, including its existing audio.
- Keep each demonstration at its original speed and preserve the complete
  product workflow. Do not speed-ramp normal interaction, installation, or
  waiting steps.
- Remove only a clearly unrelated, blank, or mistaken tail when present, then
  fade out on the final healthy FlyEnv or product-browser view.
- Produce concise English captions that describe the on-screen operation; the
  raw recordings have no speech and captions must not claim to be transcripts.
- Generate matching English neural narration using `en-US-BrianNeural` at
  `-6%`, timed from the actual generated audio so that burned subtitles and
  speech remain synchronized.

## Deliverables per module

- `flyenv-<module>_base_edited_1080p.mp4`: original-speed 1080p edit.
- `flyenv-<module>_en_subtitled.mp4`: header plus burned English captions.
- `flyenv-<module>_en_voiceover.wav`: full-length English voiceover mix.
- `flyenv-<module>_en_final.mp4`: upload master with header audio and
  narration.
- English caption source (`.tsv`) and closed-caption file (`.srt`).
- English 16:9 YouTube thumbnail from a real product frame and Chinese 16:10
  Bilibili cover from a real product frame.
- `youtube_upload_package.md` with YouTube and Bilibili titles, descriptions,
  chapters, tags, upload settings, and cover paths.
- A task-local `render.py` that can rebuild stages independently.

## Technical design

- Normalize final video to 1920x1080, 30fps, H.264 High, yuv420p, AAC 192k,
  with `+faststart`.
- Normalize the 1920x1080 60fps header to the same 30fps profile before
  concatenation. Retain its audio separately for the final audio mix.
- Use ImageMagick-rendered caption bars and ffmpeg overlays, following the
  existing Temporal and ClickHouse render scripts. Caption overlays are placed
  low enough to avoid the main FlyEnv controls and use a dark translucent bar.
- Preserve a separate base-video, subtitle-video, and audio path. A narration
  revision must rebuild only TTS, captions, and final mux rather than the base
  edit.
- Verify each master with `ffprobe` and opening, middle-caption, final, and
  tail frames. Confirm the last frame remains within the intended product
  walkthrough.

## Publishing treatment

- YouTube: English title, description, chapters, tags, subtitles, and an
  English 16:9 cover.
- Bilibili: Chinese title, description, chapters, tags, and a Chinese 16:10
  cover. The video itself remains English voiceover with English captions.
- Both packages use the existing FlyEnv positioning: native local development
  services, official versions, no Docker, and one-click browser access where
  shown by the recording.

## Failure handling

- If Edge neural TTS is unavailable, create a task-local Python virtual
  environment and install `edge-tts`; use macOS `say` only as a last resort.
- If a source tail is ambiguous, preserve it rather than making a speculative
  cut, unless the frame review shows an unrelated desktop or application.
- Re-run only the affected independent stage on failures, then repeat the
  final media and frame checks.
