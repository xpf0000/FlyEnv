# FlyEnv Header Standardization Design

## Objective

Turn `docs/flyenv-header.mp4` into a reusable long-form FlyEnv demo opener while preserving the generated source unchanged. The standardized master must have deterministic timing, frame rate, audio format, branding, and a clean transition into screen recordings.

## Source evidence

The source is suitable visually but not yet a delivery master:

- duration: 5.085 seconds;
- video: 1920×1080 H.264 High, `yuv420p`;
- timing metadata: 60 fps nominal rate but approximately 24.12 fps average rate;
- audio: AAC stereo, 44.1 kHz, approximately 130 kbps;
- integrated loudness: -14.8 LUFS;
- true peak: -2.5 dBFS;
- the FlyEnv Logo holds for roughly the final second, but no `FlyEnv` wordmark appears;
- the final Logo frame does not fade to black before a demo begins.

## Deliverables

- Preserve: `docs/flyenv-header.mp4`
- Create: `docs/flyenv-header-master.mp4`
- Create task workspace: `docs/task/flyenv-header-standardization/`
- Create task-local render script: `docs/task/flyenv-header-standardization/render-header.sh`
- Create deterministic wordmark source and overlay:
  - `docs/task/flyenv-header-standardization/flyenv-wordmark.svg`
  - `docs/task/flyenv-header-standardization/flyenv-wordmark.png`
- Create verification frames in `docs/task/flyenv-header-standardization/verification/`

No short bumper variant is included in this pass.

## Visual treatment

Keep the source animation and color grading unchanged until the final Logo hold.

During the final hold:

- show the exact text `FlyEnv` in bold white type centered below the existing Logo;
- render the wordmark as a 560×150 transparent asset using Arial Bold at 96 px;
- place its top-left corner at `(680, 700)`, centered in the 1920×1080 frame without covering the Logo;
- begin the wordmark at 4.00 seconds;
- fade it in over 0.15 seconds;
- keep it stable through 4.55 seconds;
- fade it out over 0.15 seconds;
- fade the complete video and audio from 4.70 through 4.93 seconds;
- hold black and silence from 4.93 through 5.00 seconds.

The master ends on black at exactly five seconds so downstream videos can begin with either a hard cut from black or a short fade-in.

The wordmark is rendered once from SVG to a transparent PNG instead of relying on FFmpeg's runtime font lookup. This keeps the spelling and appearance deterministic across future rebuilds.

## Video normalization

The master output contract is:

- duration: 5.000 seconds;
- resolution: 1920×1080;
- frame rate: constant 30 fps;
- codec: H.264 High profile;
- pixel format: `yuv420p`;
- sample aspect ratio: 1:1;
- encode mode: CRF 18 with a slow preset;
- container optimization: `+faststart`.

The source is decoded and retimed to a constant 30 fps before the wordmark and final fade are applied. No spatial crop or stretch is permitted.

## Audio normalization

Preserve the source music and effects without loudness compression because the measured -14.8 LUFS and -2.5 dBFS true peak are already suitable for YouTube and Bilibili.

Normalize only the delivery format:

- AAC-LC;
- stereo;
- 48 kHz;
- 192 kbps;
- final audio fade from 4.70 through 4.93 seconds.

The final loudness should remain within 1.5 LU of the source measurement and the true peak must remain below -1 dBFS.

## Metadata

Retain source provenance metadata, including the Dreamina/AIGC labels, wherever the MP4 muxer supports those fields; do not intentionally strip it. Add a title identifying the file as the FlyEnv standardized header master.

## Verification

The render is accepted only when all checks pass:

1. `ffprobe` reports 1920×1080, H.264, `yuv420p`, constant 30 fps, AAC stereo at 48 kHz, and a duration within 0.05 seconds of 5.000.
2. Integrated loudness remains between -16.3 and -13.3 LUFS; true peak remains below -1 dBFS.
3. An opening frame shows the original monitor composition without the wordmark.
4. A frame near 4.20 seconds shows the exact `FlyEnv` wordmark beneath the Logo.
5. A frame near 4.90 seconds confirms the complete frame is fading to black.
6. The final frame is black and the audio has faded to silence.
7. `docs/flyenv-header.mp4` remains byte-for-byte unchanged.

## Usage contract

Use `docs/flyenv-header-master.mp4` as the standard opener for long-form FlyEnv demonstrations. Normalize the main screen recording to 1920×1080, 30 fps, and 48 kHz before composition. Begin the main video immediately after the master's black final frame or fade the main video in over the first 0.20 seconds.
