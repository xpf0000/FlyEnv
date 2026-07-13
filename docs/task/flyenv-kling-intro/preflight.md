# FlyEnv Kling Intro Preflight

- Checked at: 2026-07-13 23:17:43 CST
- Kling CLI: `0.1.3`
- Skill telemetry: `kling-cli` `0.1.3`
- Task trace ID: `019f5be3-2843-711a-a95c-3d8a7a1a5f59` (UUID V7)

## Live capability check

`kling who_am_i`, `kling tool_list`, and `kling image_to_video --help` all returned successfully before submission.

- Tool: `image_to_video`
- Model: `kling-video-v3_0_omni`
- Duration: `8` seconds is allowed (live range: 3–15 seconds)
- Aspect ratio: `16:9` is allowed
- Resolution: `1080p` is allowed
- Native audio: `enable_audio=true` is allowed
- Shot behavior: `prefer_multi_shots=false` is allowed
- Reference capacity: the model declares `image_1` through `image_7`; this generation supplies six images
- Input contract: PNG/JPG, below 4K resolution, no more than 30 MB, and aspect ratio no wider than 1:2
- Trace schema: both `rationale` and RFC 4122 UUID V7 `taskTraceId` are declared for `image_to_video`

## Reference inputs

All six reference boards are PNG files at 1920×1080 and are comfortably below the 30 MB input limit:

| File | Size |
| --- | ---: |
| `modules-a.png` | 161,855 bytes |
| `modules-b.png` | 175,629 bytes |
| `modules-c.png` | 168,824 bytes |
| `flyenv-logo.png` | 304,391 bytes |
| `spatial-style.png` | 288,421 bytes |
| `end-card.png` | 227,212 bytes |

## Account check

- Membership: `SVIP` (`铂金`)
- Available credits before submission: `400`

No credentials, token material, or endpoint configuration are recorded here.
