# FlyEnv Dreamina Two-Stage Intro Design

## Objective

Produce one eight-second, 16:9, 1920×1080 FlyEnv intro by combining two Dreamina generations:

- a five-second module-burst clip;
- a four-second Logo-and-switch clip;
- a one-second overlap hidden inside a shared cyan-white energy flash.

The final timing is `5 + 4 - 1 = 8` seconds. The design favors correct official reference material and a reliable final wordmark over a single all-in-one generation. It deliberately avoids post-production tracking of 24 independent plaques.

## Evidence from the three Dreamina trials

The three existing Dreamina outputs share four repeatable failures:

1. Each file is 960×960 even though the prompt says 16:9, so aspect ratio must be set as a generation parameter and verified from the rendered media.
2. The final wordmark is consistently rendered as `FlyEnb` because the wordmark is not present in the supplied Logo-only reference.
3. The module sphere is viewed from outside because “orbit around the monitor” conflicts with “scan outward from inside the sphere.”
4. Exact module names, Logo identity, and switch motion are not reliably preserved from prompt text alone.

The new workflow addresses these failures through clean visual references, an explicit first-person camera coordinate system, a forced final frame, and a two-clip structure.

## Output contract

- Duration: exactly 8.0 seconds after composition
- Aspect ratio: 16:9
- Resolution: 1920×1080
- Frame rate: preserve the generated source rate when possible; normalize both clips to one common rate before composition if they differ
- Audio: stereo electronic bed and synchronized effects, crossfaded through the one-second overlap
- Branding: one official FlyEnv Logo and one correctly spelled `FlyEnv` end wordmark
- Post-production: only timing normalization, one-second video/audio crossfade, and final encoding; no 24-plaque motion tracking

## Reference assets

All generation references are 1920×1080 so Dreamina infers or receives a 16:9 composition.

### Module boards

Create three clean reference boards containing eight official modules each. They are derived from the repository SVG assets and the existing canonical 24-module manifest.

- Board A: Nginx, Apache, Caddy, PHP, Node.js, Python, Java, Go
- Board B: Ruby, Rust, MySQL, MariaDB, PostgreSQL, MongoDB, Redis, Memcached
- Board C: RabbitMQ, Elasticsearch, MinIO, Tomcat, Bun, Deno, Ollama, Podman

Each board contains only eight large `official Logo + exact English name` plaques. Remove board titles, explanatory captions, numbering, and other text that could leak into the generated video. Use a dark neutral background, high-contrast white names, and generous spacing.

The three boards are identity contact sheets, not scene or composition references. Clip A's prompt must identify them by their uploaded filenames and state that Dreamina must treat each `Logo + English name` pair as one independent plaque. The complete board image, its two-column grid, cyan card outlines, solid background, and original layout must never appear in a generated frame or fly out of the monitor as one object.

### Branding frames

- `logo-off.png`: the official FlyEnv Logo centered on a deep-blue background, with all three switches in the off position.
- `end-card.png`: the official FlyEnv Logo plus a pre-rendered, exact `FlyEnv` wordmark. This is the forced last frame of the second clip; Dreamina must not redraw the wordmark from prompt text.

### Interior-camera reference

Create one composition-only image showing a first-person camera at the center of a hollow sphere, looking outward at plaques distributed across the inner surface. It is a spatial-topology demonstration rather than a final art frame.

The replacement reference must communicate depth through perspective rather than diagram lines:

- remove every complete ellipse, circle, orbital guide, sphere outline, arrow, caption, and explanatory label;
- do not show the complete sphere as an object inside the frame;
- place oversized foreground plaques partly outside the frame edges, fully visible readable-scale plaques in the middle distance, and smaller plaques deeper in the scene;
- distribute plaques above, below, left, right, in front of, and behind the camera's viewing direction instead of arranging them on one flat ring;
- use overlaps, scale changes, converging perspective, cyan rim light, volumetric haze, and restrained depth falloff to establish a cinematic three-dimensional interior;
- leave the monitor behind the camera and therefore invisible during the interior scan;
- keep every demonstration plaque blank so it cannot introduce substitute names, Logos, or random text.

The Clip A prompt must identify `interior-camera.png` as a camera-relationship reference only. It must explicitly prohibit copying any schematic geometry, flat illustration style, placeholder plaque graphics, or ring layout from that image. The intended motion is a roughly 120-degree rotation from the sphere center while looking outward, with foreground plaques crossing the frame faster than distant plaques.

The first Dreamina submission uses the three module boards, `logo-off.png`, and the interior-camera reference: five images, within the live `multimodal2video` limit of nine images. The second submission uses `logo-off.png` as its first frame and `end-card.png` as its last frame.

## Clip A: five-second module burst

Use Dreamina `multimodal2video` (the all-around-reference mode) with a model and account tier that expose 1080p. Set `ratio=16:9`, `video_resolution=1080p`, and `duration=5` as command or web parameters; never rely on the prompt to enforce them.

### Timeline

- **0.0–0.6 seconds:** A single matte-metal monitor emerges in a deep-blue space at a three-quarter angle. Its screen contains a cyan energy core.
- **0.6–2.4 seconds:** The 24 referenced plaques burst continuously from the screen. The cadence begins sparse and accelerates smoothly. Plaques occupy clearly different Z depths and remain oriented toward the camera.
- **2.4–3.9 seconds:** The camera crosses through the monitor screen into the center of a hollow module sphere. It then looks outward and rotates from inside the sphere. The monitor is behind the camera and must not appear as an object being orbited. Plaques cover the surrounding inner surface with foreground occlusion and strong parallax.
- **3.9–5.0 seconds:** The sphere collapses inward toward the camera, becomes the centered official FlyEnv Logo, and ends in a cyan-white energy flash. The final frames reserve the entire image for the centered Logo and flash so Clip B can overlap invisibly.

### Prompt rules

- Refer to each module board by its uploaded filename and call all three identity contact sheets, not scenes, compositions, UI panels, or complete flying objects.
- Require Dreamina to separate the 24 `Logo + exact English name` pairs into 24 independent plaques, and prohibit reproducing a complete board, two-column grid, board background, or board layout.
- Refer to `interior-camera.png` as a spatial-topology demonstration only, not a final art frame.
- Explicitly describe the interior phase as first-person POV from the sphere center, looking outward, with near/middle/far layers, edge cropping, occlusion, scale differences, and strong rotational parallax.
- Prohibit copying flat rings, complete sphere outlines, ellipses, guide lines, central circles, placeholder graphics, or a flat infographic style from the camera reference.
- Remove “orbit around the monitor” and any equivalent external-camera wording.
- Do not request a final wordmark in this clip.
- Permit only green that already exists inside official module Logos; the overall palette remains deep blue, cyan, and restrained violet.

## Clip B: four-second Logo sequence

Use Dreamina `frames2video` with `logo-off.png` as the first frame and `end-card.png` as the last frame. Both frames are 1920×1080, causing the command to infer 16:9. Use a model/tier supporting 1080p and set `duration=4`.

### Timeline

- **0.0–1.0 seconds:** The same centered Logo is visible inside the cyan-white flash from Clip A. The flash dissipates; all switches remain off.
- **1.0–2.2 seconds:** The top, middle, and bottom switches activate one at a time. Each activation must visibly move its circular knob to the opposite side, change only that switch track to green, and land on an individual mechanical click/electronic beat. Switches already activated stay green.
- **2.2–3.2 seconds:** Cyan lightning with restrained violet accents completes one full wrap around the Logo.
- **3.2–4.0 seconds:** The forced `end-card.png` composition settles and holds: official Logo plus the exact `FlyEnv` wordmark, with no additional text. All three switches remain on.

The prompt distinguishes switch mechanics from general glow: no simultaneous activation, no mere brightness pulse, no whole-Logo color change, and no switch reverting to off.

## Composition and audio

Place Clip B at output time 4.0 seconds, overlapping the final second of Clip A. Apply:

- a one-second video crossfade centered on the shared energy flash;
- a one-second audio crossfade between the rising collapse impact and the Logo-sequence opening;
- no inserted title card, cutaway, or additional visual effect.

The flash makes the transition appear continuous even though two generations are used. The final composition is re-encoded once to H.264 with AAC stereo audio at 1920×1080.

## Validation gates

### Before paid generation

- Confirm the Dreamina CLI/session and available credit without submitting.
- Re-read live help for `multimodal2video` and `frames2video`.
- Confirm the selected model exposes 1080p, the required durations, and the intended input count.
- Verify every reference image is 1920×1080 and contains no unintended captions.
- Verify the module boards use a solid background and the prompt describes them as identity contact sheets whose complete layouts are forbidden in the output.
- Verify `interior-camera.png` contains no complete ellipse, circle, sphere outline, guide line, caption, Logo, or module name and visibly includes foreground, middle-distance, and far plaques at different apparent scales.
- Present the final prompts and paid command parameters to the user before submission.

### After each generation

- Treat a submission as successful only when it returns a `submit_id` and `gen_status` is `querying` or `success`.
- Poll the returned `submit_id`; never invent or replace it.
- Verify width, height, duration, frame rate, video stream, and audio stream with `ffprobe`.
- Extract full-timeline contact sheets plus dense frames for the interior-camera and switch windows.
- Record module spelling/Logo defects and switch-order defects before composition.

### Final acceptance

- Exactly 8.0 seconds at 1920×1080 and 16:9
- One continuous-looking camera path with the module scan visibly inside the hollow sphere
- A dense field representing all 24 referenced modules; every readable name exactly matches its reference board, every visible Logo belongs to its named module, and no invented module name is accepted
- Collapse into the official FlyEnv Logo at the hidden transition
- Three separately visible switch slides in top-to-bottom order; activated tracks turn green and remain on
- Full lightning wrap
- Correct, stable `FlyEnv` wordmark supplied by the forced end frame
- Stereo electronic audio and action-aligned transients

## Failure and retry policy

Dreamina generation consumes credits. Do not automatically resubmit a failed or unsatisfactory clip.

- Parameter or authorization failure: report the exact error and required correction before retrying.
- Business/generation failure: report it and request explicit retry approval.
- Any readable module name is misspelled, invented, or paired with the wrong Logo: stop before composition and let the user choose between accepting the defect, approving a new generation, or expanding scope to tracked post-production overlays.
- Clip B changes `FlyEnv`, activates switches simultaneously, or ends with an off switch: stop before composition and request explicit retry approval.
- Different resolutions/frame rates: normalization is allowed during composition, but a square result is a generation failure rather than something to crop into compliance.

## Deliverables

- clean module boards A/B/C
- `logo-off.png`, `end-card.png`, and the interior-camera reference
- versioned prompts and exact Dreamina submit metadata for both clips
- original downloaded Clip A and Clip B
- composed eight-second MP4
- representative verification frames and a written pass/partial/fail report

The three existing 960×960 Dreamina trials remain evidence only and are not used as generation inputs.
