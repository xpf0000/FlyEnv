# FlyEnv Kling Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one approximately eight-second, 1920×1080 FlyEnv intro video with native audio through a single Kling generation, using six deterministic reference boards built from official repository assets.

**Architecture:** A task-local TypeScript/Sharp utility renders six 1920×1080 PNG reference boards from the existing FlyEnv logo and module SVGs. A versioned Chinese prompt and a single canonical `kling image_to_video` command submit those boards to the live `kling-video-v3_0_omni` model. The returned `generationId` is polled manually through `kling query_tasks`; the finished media is saved locally without visual or audio repair and verified against the approved design.

**Tech Stack:** TypeScript 5.8, Node.js 24, `tsx`, Sharp 0.34, ImageMagick, Kling CLI 0.1.3, ffmpeg/ffprobe.

---

## File Map

- Create `docs/task/flyenv-kling-intro/module-manifest.ts` — canonical 24-module list and official SVG mappings.
- Create `docs/task/flyenv-kling-intro/reference-boards.ts` — deterministic renderer for the six reference PNGs.
- Create `docs/task/flyenv-kling-intro/reference-boards.test.ts` — manifest and board-generation tests using Node's built-in test runner.
- Create `docs/task/flyenv-kling-intro/prompt-zh.txt` — exact Kling generation prompt.
- Create `docs/task/flyenv-kling-intro/submit-generation.zsh` — the single paid canonical Kling submission command.
- Create `docs/task/flyenv-kling-intro/.gitignore` — excludes the downloaded MP4 while keeping scripts, references, metadata, and verification notes reviewable.
- Create `docs/task/flyenv-kling-intro/references/*.png` — three module boards, FlyEnv logo board, spatial-style board, and end-card board.
- Create `docs/task/flyenv-kling-intro/preflight.md` — records the live model, input limits, account status, and command contract checked immediately before submission.
- Create `docs/task/flyenv-kling-intro/generation-submit.json` — exact JSON returned by the paid submission.
- Create `docs/task/flyenv-kling-intro/generation-latest.json` — latest `query_tasks` response, overwritten by each manual poll.
- Create `docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4` — downloaded generated result; intentionally ignored by Git.
- Create `docs/task/flyenv-kling-intro/verification-frames/*.png` — representative frames extracted only for validation.
- Create `docs/task/flyenv-kling-intro/verification.md` — final design checklist and observed generation defects.

### Task 1: Create the canonical module manifest

**Files:**
- Create: `docs/task/flyenv-kling-intro/module-manifest.ts`
- Create: `docs/task/flyenv-kling-intro/reference-boards.test.ts`
- Create: `docs/task/flyenv-kling-intro/.gitignore`

- [ ] **Step 1: Create the task workspace**

Run:

```bash
mkdir -p docs/task/flyenv-kling-intro
```

Expected: the task directory exists and no files outside `docs/task/flyenv-kling-intro/` are changed.

- [ ] **Step 2: Write the failing manifest test**

Create `docs/task/flyenv-kling-intro/reference-boards.test.ts`:

```ts
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { MODULES, REPO_ROOT, partitionModules } from './module-manifest.ts'

test('manifest contains 24 unique modules backed by existing assets', () => {
  assert.equal(MODULES.length, 24)
  assert.equal(new Set(MODULES.map((item) => item.name)).size, 24)
  for (const item of MODULES) {
    assert.equal(existsSync(path.join(REPO_ROOT, item.asset)), true, item.asset)
  }
})

test('manifest partitions into three ordered boards of eight modules', () => {
  const groups = partitionModules(MODULES)
  assert.deepEqual(groups.map((group) => group.length), [8, 8, 8])
  assert.deepEqual(groups.flat(), MODULES)
})
```

- [ ] **Step 3: Run the test and verify the missing-module failure**

Run:

```bash
node --import tsx --test docs/task/flyenv-kling-intro/reference-boards.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `module-manifest.ts`.

- [ ] **Step 4: Implement the canonical manifest**

Create `docs/task/flyenv-kling-intro/module-manifest.ts`:

```ts
import path from 'node:path'

export type ModuleSpec = Readonly<{ name: string; asset: string }>

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

export const MODULES: readonly ModuleSpec[] = [
  { name: 'Nginx', asset: 'src/render/svg/nginx.svg' },
  { name: 'Apache', asset: 'src/render/svg/apache.svg' },
  { name: 'Caddy', asset: 'src/render/svg/caddy.svg' },
  { name: 'PHP', asset: 'src/render/svg/php.svg' },
  { name: 'Node.js', asset: 'src/render/svg/nodejs.svg' },
  { name: 'Python', asset: 'src/render/svg/python.svg' },
  { name: 'Java', asset: 'src/render/svg/java.svg' },
  { name: 'Go', asset: 'src/render/svg/Golang.svg' },
  { name: 'Ruby', asset: 'src/render/svg/Ruby.svg' },
  { name: 'Rust', asset: 'src/render/svg/rust.svg' },
  { name: 'MySQL', asset: 'src/render/svg/mysql.svg' },
  { name: 'MariaDB', asset: 'src/render/svg/mariaDB.svg' },
  { name: 'PostgreSQL', asset: 'src/render/svg/postgresql.svg' },
  { name: 'MongoDB', asset: 'src/render/svg/Mongodb.svg' },
  { name: 'Redis', asset: 'src/render/svg/redis.svg' },
  { name: 'Memcached', asset: 'src/render/svg/memcached.svg' },
  { name: 'RabbitMQ', asset: 'src/render/svg/rabbitmq.svg' },
  { name: 'Elasticsearch', asset: 'src/render/svg/elasticsearch.svg' },
  { name: 'MinIO', asset: 'src/render/svg/minio.svg' },
  { name: 'Tomcat', asset: 'src/render/svg/Tomcat.svg' },
  { name: 'Bun', asset: 'src/render/svg/bun.svg' },
  { name: 'Deno', asset: 'src/render/svg/deno.svg' },
  { name: 'Ollama', asset: 'src/render/svg/ollama.svg' },
  { name: 'Podman', asset: 'src/render/svg/podman.svg' }
]

export function partitionModules(items: readonly ModuleSpec[]): ModuleSpec[][] {
  return [items.slice(0, 8), items.slice(8, 16), items.slice(16, 24)]
}
```

Create `docs/task/flyenv-kling-intro/.gitignore`:

```gitignore
flyenv-kling-intro.mp4
```

- [ ] **Step 5: Run the manifest tests**

Run:

```bash
node --import tsx --test docs/task/flyenv-kling-intro/reference-boards.test.ts
```

Expected: 2 tests PASS, 0 tests FAIL.

- [ ] **Step 6: Commit the manifest**

```bash
git add docs/task/flyenv-kling-intro/module-manifest.ts docs/task/flyenv-kling-intro/reference-boards.test.ts docs/task/flyenv-kling-intro/.gitignore
git commit -m "test: define FlyEnv intro module manifest"
```

### Task 2: Build the deterministic reference-board renderer

**Files:**
- Create: `docs/task/flyenv-kling-intro/reference-boards.ts`
- Modify: `docs/task/flyenv-kling-intro/reference-boards.test.ts`

- [ ] **Step 1: Add a failing board-render test**

Append to `reference-boards.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import sharp from 'sharp'
import { BOARD_FILES, renderReferenceBoards } from './reference-boards.ts'

test('renderer creates six compliant 1920x1080 PNG boards', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'flyenv-intro-'))
  try {
    await renderReferenceBoards(output)
    assert.deepEqual(BOARD_FILES, [
      'modules-a.png',
      'modules-b.png',
      'modules-c.png',
      'flyenv-logo.png',
      'spatial-style.png',
      'end-card.png'
    ])
    for (const filename of BOARD_FILES) {
      const metadata = await sharp(path.join(output, filename)).metadata()
      assert.equal(metadata.format, 'png')
      assert.equal(metadata.width, 1920)
      assert.equal(metadata.height, 1080)
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the test and verify the renderer is missing**

Run:

```bash
node --import tsx --test docs/task/flyenv-kling-intro/reference-boards.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `reference-boards.ts`.

- [ ] **Step 3: Implement the reference-board renderer**

Create `docs/task/flyenv-kling-intro/reference-boards.ts`:

```ts
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { MODULES, REPO_ROOT, type ModuleSpec, partitionModules } from './module-manifest.ts'

export const BOARD_FILES = [
  'modules-a.png',
  'modules-b.png',
  'modules-c.png',
  'flyenv-logo.png',
  'spatial-style.png',
  'end-card.png'
] as const

const WIDTH = 1920
const HEIGHT = 1080
const logoPath = path.join(REPO_ROOT, 'src/render/assets/256x256.png')

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[char] as string)
}

async function dataUri(filename: string): Promise<string> {
  const bytes = await readFile(filename)
  const mime = path.extname(filename).toLowerCase() === '.png' ? 'image/png' : 'image/svg+xml'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

function documentSvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <radialGradient id="bg"><stop stop-color="#173b72"/><stop offset="0.48" stop-color="#07152d"/><stop offset="1" stop-color="#01030b"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    ${content}
  </svg>`
}

async function moduleBoardSvg(items: readonly ModuleSpec[], boardName: string): Promise<string> {
  const cards = await Promise.all(items.map(async (item, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 130 + column * 850
    const y = 170 + row * 210
    const icon = await dataUri(path.join(REPO_ROOT, item.asset))
    return `<g transform="translate(${x} ${y})">
      <rect width="790" height="174" rx="28" fill="#07152a" fill-opacity="0.92" stroke="#62ddff" stroke-width="3"/>
      <image href="${icon}" x="34" y="27" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>
      <text x="190" y="108" fill="#ffffff" font-size="54" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(item.name)}</text>
    </g>`
  }))
  return documentSvg(`<text x="130" y="105" fill="#76e7ff" font-size="44" font-weight="700" font-family="Arial, Helvetica, sans-serif">FlyEnv modules · ${boardName}</text>${cards.join('')}`)
}

async function logoBoardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(`<circle cx="960" cy="510" r="360" fill="none" stroke="#5adfff" stroke-width="4" opacity="0.45" filter="url(#glow)"/>
    <image href="${logo}" x="610" y="160" width="700" height="700"/>
    <text x="960" y="945" text-anchor="middle" fill="#ffffff" font-size="64" font-weight="700" font-family="Arial, Helvetica, sans-serif">Preserve the official three-switch structure</text>`)
}

async function styleBoardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  const plaques = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2
    const x = 960 + Math.cos(angle) * (index % 2 === 0 ? 690 : 520)
    const y = 520 + Math.sin(angle) * (index % 3 === 0 ? 350 : 270)
    const scale = index % 4 === 0 ? 1.35 : index % 3 === 0 ? 0.72 : 1
    return `<g transform="translate(${x - 95} ${y - 32}) scale(${scale})"><rect width="190" height="64" rx="15" fill="#081a36" stroke="#63e2ff" stroke-width="2"/><circle cx="34" cy="32" r="17" fill="#6be5ff"/><rect x="65" y="23" width="100" height="18" rx="9" fill="#ffffff"/></g>`
  }).join('')
  return documentSvg(`<ellipse cx="960" cy="520" rx="760" ry="340" fill="none" stroke="#67ddff" stroke-width="4" opacity="0.55" transform="rotate(-11 960 520)"/>
    <g transform="translate(590 255) rotate(-5 370 235)"><rect width="740" height="470" rx="34" fill="#071327" stroke="#69e3ff" stroke-width="7" filter="url(#glow)"/><image href="${logo}" x="245" y="105" width="250" height="250"/></g>
    ${plaques}
    <text x="960" y="1000" text-anchor="middle" fill="#78e9ff" font-size="48" font-weight="700" font-family="Arial, Helvetica, sans-serif">Deep-blue neon · spherical Z-axis burst · cinematic 120° orbit</text>`)
}

async function endCardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(`<image href="${logo}" x="440" y="290" width="500" height="500"/>
    <text x="1010" y="600" fill="#ffffff" font-size="150" font-weight="700" letter-spacing="2" font-family="Arial, Helvetica, sans-serif">FlyEnv</text>
    <path d="M410 820 C700 700 1170 900 1510 690" fill="none" stroke="#69e5ff" stroke-width="8" filter="url(#glow)"/>`)
}

export async function renderReferenceBoards(outputDir = path.join(import.meta.dirname, 'references')): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const groups = partitionModules(MODULES)
  const svgs = [
    await moduleBoardSvg(groups[0], 'A'),
    await moduleBoardSvg(groups[1], 'B'),
    await moduleBoardSvg(groups[2], 'C'),
    await logoBoardSvg(),
    await styleBoardSvg(),
    await endCardSvg()
  ]
  await Promise.all(svgs.map((svg, index) => sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, BOARD_FILES[index]))))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderReferenceBoards()
}
```

- [ ] **Step 4: Run all board tests**

Run:

```bash
node --import tsx --test docs/task/flyenv-kling-intro/reference-boards.test.ts
```

Expected: 3 tests PASS, 0 tests FAIL.

- [ ] **Step 5: Commit the renderer**

```bash
git add docs/task/flyenv-kling-intro/reference-boards.ts docs/task/flyenv-kling-intro/reference-boards.test.ts
git commit -m "feat: render FlyEnv Kling reference boards"
```

### Task 3: Generate and inspect the six reference boards

**Files:**
- Create: `docs/task/flyenv-kling-intro/references/modules-a.png`
- Create: `docs/task/flyenv-kling-intro/references/modules-b.png`
- Create: `docs/task/flyenv-kling-intro/references/modules-c.png`
- Create: `docs/task/flyenv-kling-intro/references/flyenv-logo.png`
- Create: `docs/task/flyenv-kling-intro/references/spatial-style.png`
- Create: `docs/task/flyenv-kling-intro/references/end-card.png`

- [ ] **Step 1: Render the boards**

Run:

```bash
npx tsx docs/task/flyenv-kling-intro/reference-boards.ts
```

Expected: exit code 0 and six PNG files under `docs/task/flyenv-kling-intro/references/`.

- [ ] **Step 2: Verify dimensions, format, and input size limits**

Run:

```bash
magick identify docs/task/flyenv-kling-intro/references/*.png
```

Expected: every file reports `PNG 1920x1080`; every file is below 30 MB and therefore satisfies the live Kling upload declaration.

- [ ] **Step 3: Inspect all six boards visually**

Open each PNG with the image-view tool. Confirm:

- all 24 names occur once across the three module boards;
- no logo is clipped or stretched;
- the FlyEnv board preserves the three-switch icon;
- the style board reads as a monitor-centered spherical field rather than a flat ring;
- the end card contains only the official logo, electricity accent, and `FlyEnv` wordmark.

- [ ] **Step 4: Commit the generated inputs**

```bash
git add docs/task/flyenv-kling-intro/references
git commit -m "assets: add FlyEnv Kling reference boards"
```

### Task 4: Author the exact prompt and paid-submit command

**Files:**
- Create: `docs/task/flyenv-kling-intro/prompt-zh.txt`
- Create: `docs/task/flyenv-kling-intro/submit-generation.zsh`

- [ ] **Step 1: Create the approved Chinese prompt**

Create `docs/task/flyenv-kling-intro/prompt-zh.txt` with this exact content:

```text
生成一支严格连续、无切镜的 8 秒 16:9 电影级 3D 科技品牌片头，并生成与画面动作精确同步的原生电子音乐和音效。图片1、图片2、图片3是 24 个 FlyEnv 模块的官方 Logo 与英文名称参考板；必须尽量保持每个 Logo、拼写和 Logo+名称组合。图片4是 FlyEnv 官方 Logo，必须保持圆角深蓝方形外观和内部三个横向开关。图片5是显示器、深海蓝霓虹、球形 Z 轴爆发和 120 度环绕运镜的风格与构图参考。图片6是最后的 FlyEnv Logo + FlyEnv 字标落版参考。

0.0–0.7 秒：深海蓝黑空间，一台高级磨砂材质显示器从暗处被青蓝轮廓光勾亮，屏幕内出现能量核心，低频启动声与轻微电流声同步出现。摄影机保持明显的三分之四角度，禁止平面正视构图。

0.7–3.2 秒：24 个深色半透明玻璃铭牌从显示器屏幕连续喷涌炸出，每个铭牌左侧是参考板中的官方模块 Logo，右侧是对应的白色英文名称。出场必须是一条连贯曲线：最初几个间隔较慢、清晰有力，随后间隔持续缩短、速度越来越快，最终形成 Boom 式密集爆发，不能分成四次独立爆炸。铭牌飞向明显不同的 Z 轴深度，有些贴近镜头掠过，有些停留在显示器后方；出现后继续驻留并组成三维球形生态。铭牌始终正对摄影机，名称和 Logo 尽量清晰，不得降级成模糊粒子。电子节拍和每次飞出声从疏到密同步加速。

3.2–4.8 秒：摄影机穿入模块群，在强烈的近大远小、遮挡关系和空间视差中围绕显示器扫过约 120 度。前景铭牌快速掠过镜头，中景铭牌清晰可读，远景铭牌仍保持可辨轮廓；所有铭牌继续朝向摄影机。使用环绕呼啸声和短暂悬浮的电子音乐层。禁止平面横移、平面信息图和规整二维圆环。

4.8–5.7 秒：整个球形模块场突然向内坍缩，所有铭牌拖着青蓝光轨高速反向收回显示器，伴随反向吸入声和低频下坠，能量在屏幕中心汇聚成图片4的 FlyEnv 官方 Logo。

5.7–7.1 秒：摄影机推近 FlyEnv Logo，Logo 内三个横向开关从上到下依次开启，分别落在三个清晰的电子音乐重拍上。每次开启都有明确机械点击、青蓝光脉冲和短促能量扩散，三个开关结构必须保持清楚。

7.1–8.0 秒：一道青蓝为主、少量紫色点缀的电流围绕 FlyEnv Logo 完整环绕一圈，短促低频冲击落下，图片6中的 FlyEnv 字标显现。最后约 0.35 秒保持 FlyEnv Logo + FlyEnv 字标稳定、清楚、居中后干净结束，音效尾音快速收束。

整体使用深海蓝、青蓝霓虹和少量紫色，高级物理材质与电影级体积光。只允许一台显示器和一个 FlyEnv 品牌标志。禁止绿色主色、随机 UI、随机字符、重复模块、额外显示器、重度景深模糊、过强运动模糊、水印、平面信息图、Logo 变成其他结构、最后出现额外文字。必须是连续单镜头，不要智能分镜。
```

- [ ] **Step 2: Create the single paid-submit script**

Create `docs/task/flyenv-kling-intro/submit-generation.zsh`:

```zsh
#!/usr/bin/env zsh
set -euo pipefail

root="${0:A:h}"
prompt="$(<"$root/prompt-zh.txt")"

kling image_to_video \
  --model kling-video-v3_0_omni \
  --image "$root/references/modules-a.png" \
  --image "$root/references/modules-b.png" \
  --image "$root/references/modules-c.png" \
  --image "$root/references/flyenv-logo.png" \
  --image "$root/references/spatial-style.png" \
  --image "$root/references/end-card.png" \
  --duration 8 \
  --aspect_ratio 16:9 \
  --resolution 1080p \
  --prefer_multi_shots false \
  --enable_audio true \
  --task-trace-id 019f5be3-2843-711a-a95c-3d8a7a1a5f59 \
  --rationale "User approved a single-shot eight-second FlyEnv brand intro with six official reference boards, native synchronized audio, 1080p output, and no post-generation repairs." \
  --skill-name kling-cli \
  --skill-version 0.1.3 \
  "$prompt" | tee "$root/generation-submit.json"
```

- [ ] **Step 3: Make the submit script executable without running it**

Run:

```bash
chmod +x docs/task/flyenv-kling-intro/submit-generation.zsh
```

- [ ] **Step 4: Verify prompt invariants without submitting**

Run:

```bash
rg -n "24 个|0.7–3.2|120 度|三个横向开关|原生电子音乐|连续单镜头|不要智能分镜" docs/task/flyenv-kling-intro/prompt-zh.txt
```

Expected: every required phrase is present.

- [ ] **Step 5: Commit the prompt and command**

```bash
git add docs/task/flyenv-kling-intro/prompt-zh.txt docs/task/flyenv-kling-intro/submit-generation.zsh
git commit -m "feat: define FlyEnv Kling generation prompt"
```

### Task 5: Run the no-charge Kling preflight

**Files:**
- Create: `docs/task/flyenv-kling-intro/preflight.md`

- [ ] **Step 1: Refresh identity and model declarations**

Run:

```bash
kling who_am_i --task-trace-id 019f5be3-2843-711a-a95c-3d8a7a1a5f59 --skill-name kling-cli --skill-version 0.1.3
```

Expected: `ok: true`, status 200, and `image_to_video.models` contains `kling-video-v3_0_omni` with duration `8`, aspect ratio `16:9`, resolution `1080p`, `enable_audio`, `prefer_multi_shots`, and at least six image inputs.

- [ ] **Step 2: Refresh tool schemas and command help**

Run these separately:

```bash
kling tool_list --skill-name kling-cli --skill-version 0.1.3
```

```bash
kling image_to_video --help --skill-name kling-cli --skill-version 0.1.3
```

Expected: `image_to_video` remains available; local PNG/JPG inputs below 4K and 30 MB are accepted; `rationale` and UUID V7 `taskTraceId` remain declared.

- [ ] **Step 3: Check the current account balance**

Run:

```bash
kling account --task-trace-id 019f5be3-2843-711a-a95c-3d8a7a1a5f59 --skill-name kling-cli --skill-version 0.1.3
```

Expected: `ok: true` and `availableRemainCredits` is greater than zero. If the service reports insufficient credit during submission, stop and present the dynamic recharge guidance from the live service response.

- [ ] **Step 4: Record the preflight facts**

Create `preflight.md` with the command date, CLI version, model name, confirmed parameters, six-input limit check, account membership, available credits, and the UUID V7 trace ID `019f5be3-2843-711a-a95c-3d8a7a1a5f59`. Do not record credentials, endpoint configuration, or token material.

- [ ] **Step 5: Commit the preflight record**

```bash
git add docs/task/flyenv-kling-intro/preflight.md
git commit -m "docs: record FlyEnv Kling preflight"
```

### Task 6: Submit the single paid generation

**Files:**
- Create: `docs/task/flyenv-kling-intro/generation-submit.json`

- [ ] **Step 1: Run the approved paid submission once**

Run:

```bash
docs/task/flyenv-kling-intro/submit-generation.zsh
```

Expected: JSON with `ok: true`, status 200, `body.generationId`, initial status, and `body.creditsConsumed`. This command must run exactly once. A validation error is reported to the user with the correct live syntax and requires confirmation before correction; a business failure or unsatisfactory result must not be resubmitted automatically.

- [ ] **Step 2: Immediately report the submission**

Read `generation-submit.json` and tell the user the exact `generationId`, `creditsConsumed`, and initial status. State that polling has started.

- [ ] **Step 3: Validate the stored response shape**

Run:

```bash
node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-kling-intro/generation-submit.json","utf8"));if(!j.ok||!j.body?.generationId)process.exit(1);console.log({generationId:j.body.generationId,status:j.body.status,creditsConsumed:j.body.creditsConsumed})'
```

Expected: exit code 0 and the three submission fields printed.

### Task 7: Poll manually and save the finished media

**Files:**
- Create: `docs/task/flyenv-kling-intro/generation-latest.json`
- Create: `docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4`

- [ ] **Step 1: Query the returned generation ID once**

Run this as one Shell tool call:

```bash
kling query_tasks "$(node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-kling-intro/generation-submit.json","utf8"));process.stdout.write(j.body.generationId)')" --task-trace-id 019f5be3-2843-711a-a95c-3d8a7a1a5f59 --skill-name kling-cli --skill-version 0.1.3 | tee docs/task/flyenv-kling-intro/generation-latest.json
```

Expected: `QUEUING`, `RUNNING`, `COMPLETED`, `PARTIAL_COMPLETED`, or another documented status.

- [ ] **Step 2: Continue individual queries while status is intermediate**

Wait approximately 2–3 seconds between Shell tool calls, then run the exact Step 1 command again. Do not use a loop, background process, or polling script. Report the first transition into `RUNNING`, then provide a short update every 3–4 unchanged polls. Stop at a terminal status or after 15 minutes.

- [ ] **Step 3: Handle terminal status**

- On `COMPLETED`, `PARTIAL_COMPLETED`, or `succeed`, extract and display every `works[].url` as a clickable link.
- On `FAILED`, `CANCELLED`, moderation failure, service error, or timeout, translate the concrete error for the user and ask whether to retry; do not modify any prompt or parameter.
- If 15 minutes elapse in an intermediate state, ask whether to continue waiting or stop.

- [ ] **Step 4: Save the completed video locally without modifying it**

After a successful terminal status, run:

```bash
ffmpeg -y -i "$(node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-kling-intro/generation-latest.json","utf8"));process.stdout.write(j.body.works[0].url)')" -c copy docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4
```

Expected: exit code 0 and a local MP4 that is a byte-stream copy of the returned work, with no re-encoding or repair.

### Task 8: Verify the unmodified generated result

**Files:**
- Create: `docs/task/flyenv-kling-intro/verification-frames/*.png`
- Create: `docs/task/flyenv-kling-intro/verification.md`

- [ ] **Step 1: Verify media streams and duration**

Run:

```bash
ffprobe -v error -show_entries format=duration -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate -of json docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4
```

Expected: a video stream at 1920×1080, an audio stream, and duration close to 8 seconds. Record the exact values even if they differ.

- [ ] **Step 2: Extract the six approved review moments**

Run:

```bash
mkdir -p docs/task/flyenv-kling-intro/verification-frames
```

Run:

```bash
ffmpeg -y -i docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4 -vf "select='eq(n,15)+eq(n,60)+eq(n,120)+eq(n,159)+eq(n,192)+eq(n,231)'" -fps_mode vfr docs/task/flyenv-kling-intro/verification-frames/frame-%02d.png
```

Expected: six PNG frames near 0.5, 2.0, 4.0, 5.3, 6.4, and 7.7 seconds for a 30 fps output.

- [ ] **Step 3: Inspect the full video and frames**

Use the image-view tool on all six frames and review the full MP4. Record each approved criterion as pass, partial, or fail:

- central monitor and deep-blue neon style;
- approximately 24 logo-and-name plaques;
- continuous slow-to-fast Z-axis burst;
- camera travel into the field and approximately 120° orbit;
- collapse into the FlyEnv logo;
- three sequential switch activations;
- electronic beat plus synchronized sound effects;
- electrical wrap and stable `FlyEnv Logo + FlyEnv` end card;
- visible spelling, logo, duplication, or continuity defects.

- [ ] **Step 4: Write the verification report**

Create `verification.md` containing the exact ffprobe metadata, final `generationId`, `creditsConsumed`, final resource URL, checklist results, and observed pure-generation defects. State explicitly that no visual or audio repair was performed.

- [ ] **Step 5: Re-run local checks**

Run:

```bash
node --import tsx --test docs/task/flyenv-kling-intro/reference-boards.test.ts
```

Run:

```bash
git diff --check -- docs/task/flyenv-kling-intro docs/superpowers/specs/2026-07-13-flyenv-kling-intro-design.md
```

Expected: all tests pass and `git diff --check` produces no output.

- [ ] **Step 6: Commit metadata and verification artifacts, excluding the MP4**

```bash
git add docs/task/flyenv-kling-intro/generation-submit.json docs/task/flyenv-kling-intro/generation-latest.json docs/task/flyenv-kling-intro/verification-frames docs/task/flyenv-kling-intro/verification.md
git commit -m "docs: verify FlyEnv Kling intro output"
```

The MP4 remains available at `docs/task/flyenv-kling-intro/flyenv-kling-intro.mp4` and is excluded by the task-local `.gitignore`.
