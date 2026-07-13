# FlyEnv Kling Intro Video Design

## Objective

Create an approximately eight-second, 1920×1080, 16:9 FlyEnv demo-video intro generated as one continuous Kling video. The intro must communicate the breadth of FlyEnv's supported modules through a cinematic three-dimensional burst, then converge into the FlyEnv brand mark and end card.

The Kling-generated video is the final visual output. There will be no post-generation repair, replacement, tracking overlay, or reconstruction of module names, module logos, the FlyEnv logo, the three switches, or the wordmark.

## Approved Creative Direction

- Duration: approximately 8 seconds.
- Frame: 16:9 at 1920×1080.
- Style: deep-ocean blue neon cinematic technology aesthetic.
- Composition: a monitor at the center of a spherical three-dimensional module burst.
- Camera: travel into the module field, then sweep approximately 120 degrees around the monitor.
- Module density: 24 readable module plaques.
- Module reveal: one continuous stream with slow initial spacing that accelerates toward a dense finish.
- Resolution of module plaques: each plaque combines the official logo with its English name and stays oriented toward the camera.
- Ending: all modules collapse into the FlyEnv logo, the logo's three switches activate in sequence, electricity wraps the logo, and the `FlyEnv` wordmark appears.
- Audio: electronic music beat plus synchronized motion, switch, and electrical sound effects.

## Production Approach

Use a single paid Kling generation rather than multiple generated shots or a hybrid compositing workflow. The active Kling model must be selected immediately before submission from the live `who_am_i` declaration. The chosen model must support the required duration, 16:9 frame, 1080p output, native audio, and the required number of reference inputs.

The implementation may prepare deterministic reference boards from FlyEnv's official repository assets. These boards are inputs to Kling, not post-processing of the generated video.

## Reference Input Package

Prepare six reference images:

1. Module board A with eight official module logos and English names.
2. Module board B with eight official module logos and English names.
3. Module board C with eight official module logos and English names.
4. FlyEnv logo board showing the official rounded-square mark and its three switches.
5. Style and spatial-composition board showing the monitor, deep-blue neon palette, and spherical Z-axis burst.
6. End-card board showing the FlyEnv logo followed by the `FlyEnv` wordmark.

Reference boards must use clean spacing, high contrast, no decorative text, and no substitute or AI-redrawn logos.

## Module Set

The 24 approved modules are:

1. Nginx
2. Apache
3. Caddy
4. PHP
5. Node.js
6. Python
7. Java
8. Go
9. Ruby
10. Rust
11. MySQL
12. MariaDB
13. PostgreSQL
14. MongoDB
15. Redis
16. Memcached
17. RabbitMQ
18. Elasticsearch
19. MinIO
20. Tomcat
21. Bun
22. Deno
23. Ollama
24. Podman

Each module appears as a dark translucent glass plaque with its official logo on the left and a white English name on the right. Plaques must behave as camera-facing billboards, retain a readable minimum size, remain present after appearing, and occupy distinct foreground, middle-ground, and background positions.

## Timeline and Camera Choreography

### 0.0–0.7 seconds: monitor awakening

A monitor emerges from deep blue-black space. Cyan rim light reveals its silhouette while an energy core activates inside the screen. The camera begins from a three-quarter angle rather than a flat frontal view.

### 0.7–3.2 seconds: continuous module burst

Twenty-four logo-and-name plaques stream out of the monitor into three-dimensional space. The first few plaques receive deliberate separation. The interval then shortens continuously so the emission feels increasingly energetic rather than divided into four discrete bursts.

Some plaques pass close to the camera, others settle behind the monitor, and all remain visible as the burst forms a spherical ecosystem. Motion trails may emphasize direction but must not obscure names or logos.

### 3.2–4.8 seconds: spherical camera sweep

The camera travels into the module field and sweeps approximately 120 degrees around the monitor. Strong parallax, near-large/far-small scale changes, and foreground passes communicate Z-axis depth. Plaques continue facing the camera. This is a cinematic spatial orbit, not a flat pan or infographic ring.

### 4.8–5.7 seconds: collapse into the brand

The spherical field contracts suddenly. All modules reverse direction and stream into the monitor with cyan-blue trails. Their energy converges into the official FlyEnv logo on the screen.

### 5.7–7.1 seconds: three switch activations

The camera pushes closer to the logo. Its three switches activate from top to bottom on three distinct electronic downbeats. Each activation produces a controlled light pulse and a mechanical click.

### 7.1–8.0 seconds: electrical end card

Electricity completes one wrap around the logo. A short low-frequency impact lands as the `FlyEnv` wordmark appears. The final logo and wordmark remain stable for approximately 0.35 seconds before the video ends.

## Visual Rules

- Use cyan and deep blue as the primary energy colors, with restrained purple accents.
- Keep the monitor and plaques premium, dimensional, and physically lit.
- Preserve obvious foreground, middle-ground, and background separation.
- Favor crisp names and logos over heavy motion blur or shallow depth of field.
- Use a single monitor and a single FlyEnv brand mark.
- Do not introduce unrelated user interfaces, random glyphs, extra monitors, green-dominant lighting, flat infographic layouts, or watermarks.
- Do not turn module plaques into indistinct particles.
- End only with the FlyEnv logo, its three switches, and the `FlyEnv` wordmark.

## Audio Design

- 0.0–0.7 seconds: low-frequency startup tone and electrical monitor wake-up.
- 0.7–3.2 seconds: electronic beat and module launch sounds accelerate together from sparse to dense.
- 3.2–4.8 seconds: stereo orbital whoosh with a briefly suspended musical layer.
- 4.8–5.7 seconds: reverse suction effect and descending low-frequency movement.
- 5.7–7.1 seconds: three distinct downbeats, each paired with a mechanical switch click and light pulse.
- 7.1–8.0 seconds: electrical crack, compact bass impact, and a quickly controlled tail.

Audio must be produced natively by the selected Kling model. There is no separate post-generation audio replacement or mix.

## Submission and Failure Handling

1. Start the Kling workflow with `who_am_i` and inspect the live model and parameter declarations.
2. Inspect `tool_list` and the target generation command help before composing the command.
3. Select a model only if its live declaration supports the required duration, aspect ratio, resolution, audio, and reference-input count.
4. Upload local reference boards through the canonical Kling CLI workflow when required.
5. Submit exactly one paid generation with an explicit model selection.
6. Report the returned `generationId` and `creditsConsumed` immediately.
7. Poll the returned `generationId` through `query_tasks` until completion or a terminal failure.
8. Do not modify the prompt, references, model, or parameters and resubmit automatically.
9. If the submission fails or the result is unsatisfactory, present the concrete result or error and ask the user before any retry.

## Validation

Validate the completed result with the following checks:

- The output is approximately 8 seconds, 1920×1080, 16:9, and contains audio.
- A monitor is the central object throughout the story.
- Approximately 24 logo-and-name module plaques appear.
- The module stream is continuous and visibly accelerates from slow to fast.
- The burst has strong Z-axis depth, including foreground passes and a camera sweep of approximately 120 degrees.
- Plaques remain recognizable as logo-and-name elements rather than generic particles.
- Modules collapse into the FlyEnv logo.
- The three switches activate sequentially and on clear beats.
- Electricity wraps the logo before the final `FlyEnv` wordmark appears.
- The final logo and wordmark hold steadily before the cut.

Inspect the full video and representative frames near 0.5, 2.0, 4.0, 5.3, 6.4, and 7.7 seconds. Report spelling, logo, switch, or continuity defects rather than hiding them.

## Accepted Risk

The user selected a pure, single-generation Kling workflow after being advised that generative video may misspell module names, deform official logos, duplicate modules, alter the three-switch structure, or drift between frames. These are accepted generation risks. They do not authorize automatic retries, and they will not be repaired in post-production.
