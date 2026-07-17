# FlyEnv Feature Overview Video

This task preserves the complete source recording at its original 1.0x speed and prepends the supplied FlyEnv header. The source media files remain untouched in `docs/`.

## Production settings

- Source: `docs/Kapture 2026-07-16 at 22.32.08.mp4`
- Header: `docs/flyenv-header.mp4`
- Source duration: 774.300 seconds
- Header duration: 5.085011 seconds
- Final duration: 779.400 seconds (approximately 12 minutes 59 seconds)
- Video: H.264, 1920x1080, 30fps, `yuv420p`, `+faststart`
- Audio: AAC, 48kHz, stereo
- Narration: Microsoft Edge Neural TTS through `edge-tts`
- Voice: `en-US-BrianNeural`, rate `-6%`
- Subtitles: 62 expanded English captions, burned into the video and also supplied as SRT/TSV

The narration explains both the visible actions and the design benefits of modular visibility, parallel version management, service controls, startup groups, sites, built-in tools, languages, and themes.

## Deliverables

- `flyenv_feature_overview_en_final.mp4` — publishable video with header music, English narration, and burned English subtitles
- `flyenv_feature_overview_en_subtitled.mp4` — copy of the final subtitled/narrated master
- `flyenv_feature_overview_en_subtitled_silent.mp4` — subtitle-burned intermediate without the final audio mix
- `flyenv_feature_overview_en_voiceover.wav` — full-length stereo narration timeline
- `flyenv_feature_overview_en_subtitles.srt` — standard English subtitles
- `flyenv_feature_overview_en_subtitles.tsv` — subtitle timing input used by the renderer
- `narration-en.txt` and `narration_segments.json` — narration script and chapter/timing manifest
- `build_narration.py` — Edge TTS, subtitle, and voiceover builder
- `compose_subtitles_only.py` — task-local subtitle compositor without an extra title overlay
- `render-video.sh` — reproducible base, subtitle, and final-mux stages
- `final-probe.json` — final media stream probe
- `verification-frames/` — representative frames extracted from the latest final master

## Publishing assets

- `publishing-package.md` — ready-to-paste YouTube and Bilibili metadata
- `flyenv_feature_overview_youtube_thumbnail.jpg` — English 1280x720 YouTube thumbnail
- `flyenv_feature_overview_bilibili_cover.jpg` — Chinese 1280x720 Bilibili cover
- `render-publishing-assets.sh` — rebuilds both covers from real subtitle-free video frames
- `validate_publishing_assets.py` — checks required metadata, chapters, source-frame timing, dimensions, formats, and sizes

Rebuild and verify:

```bash
docs/task/flyenv-feature-overview/render-publishing-assets.sh
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

## Verification

Fresh verification was run against `flyenv_feature_overview_en_final.mp4`:

- Full-file FFmpeg decode completed with no reported errors.
- Final container duration: 779.400 seconds.
- Video stream: H.264, 1920x1080, 30fps, 779.400 seconds.
- Audio stream: AAC, 48kHz, stereo, 779.392 seconds.
- Voiceover WAV: PCM 16-bit, 48kHz, stereo, 779.385 seconds.
- All 62 subtitle blocks have valid, increasing timecodes with no overlaps.
- `opening.png` at 1 second confirms the real FlyEnv header animation is visible rather than a black overlay.
- `early-subtitle.png` at 18 seconds confirms the first feature-overview subtitles are burned in and legible.
- `middle-subtitle.png` at 360 seconds confirms startup-group narration matches the setup wizard.
- `late-subtitle.png` at 650 seconds confirms the built-in tools section and subtitle placement.
- `ending.png` at 777 seconds confirms a valid final FlyEnv startup-groups frame with no broken or black tail.

The task-local `compose_subtitles_only.py` intentionally avoids adding a separate transparent intro layer. In this environment that layer rendered as an opaque black cover, so the supplied `flyenv-header.mp4` is now used directly as the only visual intro.
