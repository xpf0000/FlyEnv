# FlyEnv Temporal CLI Demo Post-Production Design

## Goal

Produce a single English publish master from `docs/FlyEnv-Temporal-CLI.mp4` for both YouTube and Bilibili. The master will prepend the shared FlyEnv header, burn English step captions, and include an English neural voiceover.

## Source and edit

- Source demo: 102.1 seconds, 3840x2160, 30 fps, no audio track.
- Shared header: `docs/flyenv-header.mp4`, approximately 5.1 seconds with its own audio.
- Preserve the whole demonstrated Temporal CLI workflow at its original speed; do not apply speed ramps.
- Keep the source files unchanged. Render all new artifacts under `docs/task/temporal-cli-demo/`.
- Export a 1920x1080, 30 fps H.264/AAC MP4 with `+faststart`.

## Audio and captions

- Describe the visible steps rather than transcribing non-existent source audio.
- Use the previously validated Edge TTS setting: `en-US-BrianNeural` at `-6%`.
- Derive subtitle timings from generated speech durations so burned captions and the SRT remain synchronized.
- Retain the shared-header audio and mix the voiceover only over the demo section.

## Publishing package

- English upload master, SRT caption track, raw voiceover WAV, and subtitle TSV/SRT source.
- YouTube English thumbnail and Bilibili Chinese cover, both based on real product frames.
- One Markdown package with platform-specific titles, descriptions, chapters, tags, recommended categories, cover paths, and upload file list.

## Verification

- Probe the final MP4 for 1920x1080, 30 fps, H.264 video and AAC audio.
- Inspect frames for the header, an early caption, a mid-flow caption, the Web UI verification, and the final frame.
- Confirm that captions fit without obscuring key controls and that the final frame has no accidental tail.
