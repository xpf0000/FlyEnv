# FlyEnv Dreamina Two-Stage Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one verified eight-second, 1920×1080 FlyEnv intro from a five-second Dreamina module clip and a four-second Dreamina Logo clip joined under a one-second energy-flash overlap.

**Architecture:** A task-local TypeScript/Sharp renderer builds three clean eight-module identity boards, an off-state Logo frame, an exact on-state `FlyEnv` end card, and a text-free inside-sphere camera reference from official repository assets. Dreamina `multimodal2video` generates Clip A and `frames2video` generates Clip B under separate paid approval gates; each clip is downloaded and rejected early if its required identities, camera geometry, dimensions, or switch behavior fail. A deterministic ffmpeg script normalizes the accepted clips and composes them with one video/audio crossfade into the final eight-second deliverable.

**Tech Stack:** TypeScript 5.8, Node.js 24, `tsx`, Sharp 0.34, Dreamina official CLI, Seedance 2.0 VIP family, ImageMagick, zsh, ffmpeg/ffprobe.

---

## File Map

- Reuse `docs/task/flyenv-kling-intro/module-manifest.ts` — canonical 24-module order and official SVG mappings.
- Create `docs/task/flyenv-dreamina-two-stage-intro/.gitignore` — exclude generated MP4 files.
- Create `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts` — render six deterministic 1920×1080 references.
- Create `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts` — verify reference routing, dimensions, size limits, and the text-free camera board.
- Create `docs/task/flyenv-dreamina-two-stage-intro/references/*.png` — three module boards, off-state Logo, exact end card, and interior-camera board.
- Create `docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt` and `clip-b-prompt-zh.txt` — exact prompts.
- Create `docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh` and `submit-clip-b.zsh` — duplicate-guarded paid submit commands.
- Create `docs/task/flyenv-dreamina-two-stage-intro/preflight.md` — live no-charge capability and balance record.
- Create `docs/task/flyenv-dreamina-two-stage-intro/clip-{a,b}-{submit,latest}.json` — exact Dreamina task metadata.
- Create `docs/task/flyenv-dreamina-two-stage-intro/clip-{a,b}-verification-frames/*.png` and matching reports.
- Create `docs/task/flyenv-dreamina-two-stage-intro/compose.zsh` — normalize and crossfade the two accepted clips.
- Create `docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4`, `generated/clip-b.mp4`, and `flyenv-dreamina-intro.mp4` — ignored local media.
- Create `docs/task/flyenv-dreamina-two-stage-intro/verification-frames/*.png` and `verification.md` — final acceptance evidence.

### Task 1: Build the deterministic Dreamina reference renderer

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/.gitignore`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts`

- [ ] **Step 1: Create the task workspace and ignore generated video**

Run:

```bash
mkdir -p docs/task/flyenv-dreamina-two-stage-intro
```

Create `.gitignore`:

```gitignore
generated/
flyenv-dreamina-intro.mp4
```

Expected: the task directory exists and generated media cannot be staged accidentally.

- [ ] **Step 2: Write the failing renderer contract test**

Create `reference-assets.test.ts`:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import {
  CLIP_A_REFERENCE_FILES,
  CLIP_B_FRAME_FILES,
  REFERENCE_FILES,
  interiorCameraSvg,
  renderReferenceAssets
} from './reference-assets.ts'

test('reference routing uses five Clip A images and two Clip B frames', () => {
  assert.deepEqual(REFERENCE_FILES, [
    'module-board-a.png', 'module-board-b.png', 'module-board-c.png',
    'logo-off.png', 'end-card.png', 'interior-camera.png'
  ])
  assert.deepEqual(CLIP_A_REFERENCE_FILES, [
    'module-board-a.png', 'module-board-b.png', 'module-board-c.png',
    'logo-off.png', 'interior-camera.png'
  ])
  assert.deepEqual(CLIP_B_FRAME_FILES, ['logo-off.png', 'end-card.png'])
})

test('interior camera reference contains no text element', () => {
  const svg = interiorCameraSvg()
  assert.equal(svg.includes('<text'), false)
  assert.match(svg, /data-camera="inside-sphere"/)
})

test('renderer creates six compliant 1920x1080 PNG references', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'flyenv-dreamina-ref-'))
  try {
    await renderReferenceAssets(output)
    for (const filename of REFERENCE_FILES) {
      const fullPath = path.join(output, filename)
      const metadata = await sharp(fullPath).metadata()
      const fileStat = await stat(fullPath)
      assert.equal(metadata.format, 'png')
      assert.equal(metadata.width, 1920)
      assert.equal(metadata.height, 1080)
      assert.ok(fileStat.size < 30 * 1024 * 1024, filename)
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run the test and verify the missing-renderer failure**

Run:

```bash
node --import tsx --test docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `reference-assets.ts`.

- [ ] **Step 4: Implement the complete reference renderer**

Create `reference-assets.ts`:

```ts
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import {
  MODULES,
  REPO_ROOT,
  partitionModules,
  type ModuleSpec
} from '../flyenv-kling-intro/module-manifest.ts'

export const REFERENCE_FILES = [
  'module-board-a.png', 'module-board-b.png', 'module-board-c.png',
  'logo-off.png', 'end-card.png', 'interior-camera.png'
] as const

export const CLIP_A_REFERENCE_FILES = [
  'module-board-a.png', 'module-board-b.png', 'module-board-c.png',
  'logo-off.png', 'interior-camera.png'
] as const

export const CLIP_B_FRAME_FILES = ['logo-off.png', 'end-card.png'] as const

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
      <radialGradient id="bg"><stop stop-color="#143866"/><stop offset="0.48" stop-color="#07162f"/><stop offset="1" stop-color="#01040d"/></radialGradient>
      <radialGradient id="dome"><stop stop-color="#071b39"/><stop offset="0.72" stop-color="#041027"/><stop offset="1" stop-color="#00030b"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="11" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    ${content}
  </svg>`
}

async function moduleBoardSvg(items: readonly ModuleSpec[]): Promise<string> {
  const cards = await Promise.all(items.map(async (item, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 90 + column * 900
    const y = 70 + row * 245
    const icon = await dataUri(path.join(REPO_ROOT, item.asset))
    return `<g transform="translate(${x} ${y})" data-module="${escapeXml(item.name)}">
      <rect width="840" height="205" rx="30" fill="#06152d" stroke="#58ddff" stroke-width="4"/>
      <image href="${icon}" x="38" y="32" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>
      <text x="215" y="128" fill="#ffffff" font-size="58" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(item.name)}</text>
    </g>`
  }))
  return documentSvg(cards.join(''))
}

function activeSwitchOverlay(x: number, y: number, size: number): string {
  const scale = size / 256
  const tracks = [[153, 74, 26, 14], [143, 117, 26, 14], [133, 159, 26, 14]] as const
  return tracks.map(([trackX, trackY, width, height], index) => {
    const px = x + trackX * scale
    const py = y + trackY * scale
    const w = width * scale
    const h = height * scale
    const radius = h / 2
    return `<g data-switch-on="${index + 1}">
      <rect x="${px}" y="${py}" width="${w}" height="${h}" rx="${radius}" fill="#20d46b"/>
      <circle cx="${px + radius}" cy="${py + radius}" r="${radius * 0.78}" fill="#ffffff"/>
    </g>`
  }).join('')
}

async function logoOffSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  return documentSvg(`<circle cx="960" cy="540" r="390" fill="none" stroke="#59ddff" stroke-width="4" opacity="0.25" filter="url(#glow)"/>
    <image href="${logo}" x="660" y="240" width="600" height="600" preserveAspectRatio="xMidYMid meet"/>`)
}

async function endCardSvg(): Promise<string> {
  const logo = await dataUri(logoPath)
  const logoX = 360
  const logoY = 290
  const logoSize = 500
  return documentSvg(`<image href="${logo}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>
    ${activeSwitchOverlay(logoX, logoY, logoSize)}
    <text x="960" y="615" fill="#ffffff" font-size="166" font-weight="700" font-family="Arial, Helvetica, sans-serif">FlyEnv</text>
    <ellipse cx="955" cy="835" rx="570" ry="80" fill="none" stroke="#5fe7ff" stroke-width="7" opacity="0.68" filter="url(#glow)"/>`)
}

export function interiorCameraSvg(): string {
  const placements = [
    [70, 95, 350, 130, -10], [500, 45, 330, 120, -4], [1090, 45, 330, 120, 4], [1500, 95, 350, 130, 10],
    [25, 330, 390, 145, -5], [1480, 330, 390, 145, 5], [35, 605, 410, 155, 6], [1475, 605, 410, 155, -6],
    [130, 850, 370, 135, 11], [520, 900, 330, 120, 4], [1070, 900, 330, 120, -4], [1420, 850, 370, 135, -11]
  ] as const
  const plaques = placements.map(([x, y, width, height, rotation], index) =>
    `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})" data-plaque="${index + 1}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="#07172f" stroke="#60e3ff" stroke-width="4"/>
      <circle cx="${x + 48}" cy="${y + height / 2}" r="20" fill="#5fe5ff"/>
      <rect x="${x + 88}" y="${y + height / 2 - 11}" width="${width - 125}" height="22" rx="11" fill="#ffffff"/>
    </g>`
  ).join('')
  return documentSvg(`<g data-camera="inside-sphere"><rect width="1920" height="1080" fill="url(#dome)"/>
    <ellipse cx="960" cy="540" rx="900" ry="500" fill="none" stroke="#4fd9ff" stroke-width="5" opacity="0.45"/>
    <ellipse cx="960" cy="540" rx="660" ry="365" fill="none" stroke="#6a8fff" stroke-width="3" opacity="0.32"/>
    <path d="M960 10 C680 260 680 820 960 1070 M960 10 C1240 260 1240 820 960 1070" fill="none" stroke="#51c8ff" stroke-width="3" opacity="0.22"/>
    <circle cx="960" cy="540" r="150" fill="#031027" stroke="#58e3ff" stroke-width="3" opacity="0.72"/>${plaques}</g>`)
}

export async function renderReferenceAssets(outputDir = path.join(import.meta.dirname, 'references')): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const groups = partitionModules(MODULES)
  const svgs = [await moduleBoardSvg(groups[0]), await moduleBoardSvg(groups[1]), await moduleBoardSvg(groups[2]), await logoOffSvg(), await endCardSvg(), interiorCameraSvg()]
  await Promise.all(svgs.map((svg, index) => sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, REFERENCE_FILES[index]))))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderReferenceAssets()
}
```

- [ ] **Step 5: Run the renderer tests**

Run:

```bash
node --import tsx --test docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: 3 tests PASS, 0 tests FAIL.

- [ ] **Step 6: Commit the renderer without consuming existing staged changes**

Run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/.gitignore docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
git commit --only -m "feat: render Dreamina FlyEnv references" -- docs/task/flyenv-dreamina-two-stage-intro/.gitignore docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: the commit contains exactly three files; unrelated pre-existing staged paths remain staged.

### Task 2: Render and visually approve the six Dreamina references

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/module-board-a.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/module-board-b.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/module-board-c.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/logo-off.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/end-card.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png`

- [ ] **Step 1: Render the references**

Run:

```bash
npx tsx docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts
```

Expected: exit 0 and all six files exist under `references/`.

- [ ] **Step 2: Verify file format, dimensions, and size**

Run:

```bash
magick identify -format '%f %m %wx%h %b\n' docs/task/flyenv-dreamina-two-stage-intro/references/*.png
```

Expected: every file is PNG, 1920×1080, and below 30 MB.

- [ ] **Step 3: Inspect every reference image**

Use image-view on all six images. Confirm:

- each module board shows exactly eight official `Logo + exact name` cards and no title/caption/number;
- all 24 names occur once across the three boards;
- no Logo is clipped or stretched;
- `logo-off.png` uses the untouched official Logo source;
- `end-card.png` spells only `FlyEnv`, shows three green on-state tracks with their knobs on the opposite side, and contains no other text;
- `interior-camera.png` reads as a first-person view from inside a hollow dome rather than an external globe and contains no text.

Expected: all conditions pass before Dreamina submission work continues.

- [ ] **Step 4: Re-run the asset test**

Run:

```bash
node --import tsx --test docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the six references**

Run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/references
git commit --only -m "assets: add Dreamina FlyEnv references" -- docs/task/flyenv-dreamina-two-stage-intro/references
```

Expected: the commit contains exactly six PNGs.

### Task 3: Author both exact prompts and guarded paid-submit scripts

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-b-prompt-zh.txt`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh`

- [ ] **Step 1: Write the Clip A prompt**

Create `clip-a-prompt-zh.txt`:

```text
生成严格连续、无切镜的 5 秒 16:9 电影级 3D 科技镜头，并生成同步的电子音乐与动作音效。参考图1、参考图2、参考图3分别给出 24 个 FlyEnv 模块的官方 Logo 和精确英文名称；它们只用于模块身份，禁止发明、替换、错拼或重复模块。参考图4是唯一允许出现的 FlyEnv 官方 Logo。参考图5只定义摄影机位于空心球体内部、从球心向外看的第一人称空间构图，不得复制成外部球体。

0.0–0.6 秒：深海蓝黑未来空间，一台磨砂金属显示器从暗处显现，青蓝轮廓光点亮，屏幕内形成青蓝能量核心。摄影机是明显的三分之四侧面视角，只有一台显示器。

0.6–2.4 秒：参考图1至图3中的 24 张深色玻璃模块铭牌从屏幕连续向外喷涌。最初几张间隔明显、动作清楚，随后间隔持续缩短、速度逐渐加快，形成一次连贯的 Boom 式空间爆发。每张铭牌必须保持参考图中的官方 Logo 和对应英文名称，飞向不同 Z 轴深度，始终正对摄影机，不能变成粒子、乱码或重复牌。

2.4–3.9 秒：摄影机正面穿过显示器屏幕，进入空心模块球体的中心。此时是第一人称 POV：摄影机位于球心，镜头朝球体内壁向外看，模块分布在摄影机四周和前后上下，显示器已经位于摄影机身后、画面中不可见。摄影机在球体内部向外旋转扫描，必须有前景遮挡、强烈近大远小和空间视差。绝对禁止从球体外部观察、绕着显示器转圈、把球体当成画面中的完整物体。

3.9–5.0 秒：四周模块突然从球体内壁向摄影机中心坍缩，拖出青蓝光轨，汇聚为参考图4中的 FlyEnv 官方 Logo。最后形成占据画面中心的青白能量闪光，并保持居中 Logo 与闪光直到结束，为下一段衔接。不要生成 FlyEnv 字标。

声音：电子节拍和铭牌飞出声从疏到密连续加速；进入球体时加入立体声穿越与环绕呼啸；坍缩时加入反向吸入、低频下坠和结尾上升能量冲击。

整体：深海蓝、青蓝霓虹、少量紫色，电影级体积光和高级物理材质。禁止切镜、智能分镜、外部球体视角、二维圆环、平面信息图、随机文字、额外品牌、额外显示器、重度景深、过强运动模糊、绿色主色和水印。
```

- [ ] **Step 2: Write the Clip B prompt**

Create `clip-b-prompt-zh.txt`:

```text
根据给定首帧和尾帧生成严格连续、无切镜的 4 秒 16:9 FlyEnv Logo 动画，并生成同步电子音乐与音效。首帧是居中的官方 FlyEnv Logo，三个开关全部处于原始关闭状态；尾帧是强制的最终画面，包含三个绿色开启开关和拼写绝对准确的 FlyEnv 字标。必须自然到达尾帧，不得重新绘制或改写尾帧中的 FlyEnv。

0.0–1.0 秒：青白能量闪光覆盖画面后逐渐消散，官方 FlyEnv Logo 稳定居中，三个开关仍然全部关闭。

1.0–2.2 秒：三个开关严格从上到下、一次只开启一个。约 1.05 秒开启顶部开关：圆形滑块清楚滑到轨道另一侧，只有顶部轨道底色变为绿色并保持绿色。约 1.45 秒以同样方式开启中间开关并保持。约 1.85 秒开启底部开关并保持。每次都必须同时出现独立机械点击、电子重拍和短促青蓝光脉冲。禁止三个开关同时发光，禁止只改变亮度而不移动滑块，禁止整个 Logo 变绿，禁止已开启开关恢复关闭。

2.2–3.2 秒：青蓝电流夹杂少量紫色闪电，围绕 Logo 完整环绕一圈，不能只是下划线、半圆或静态光圈。所有三个开关继续保持绿色开启状态。

3.2–4.0 秒：自然过渡并严格稳定在给定尾帧：官方 FlyEnv Logo、三个绿色开启开关、准确的 FlyEnv 字标。尾帧外不得出现任何额外文字，最后至少稳定保持 0.6 秒并干净结束。

声音：开场延续能量冲击；三个开关分别对应三个机械点击重拍；闪电阶段使用环绕电流爆裂；结尾落下短促低频冲击并快速收束。整体仍为深海蓝、青蓝霓虹、少量紫色，绿色只允许出现在三个已开启的开关轨道中。
```

- [ ] **Step 3: Write the guarded Clip A submit script without running it**

Create `submit-clip-a.zsh`:

```zsh
#!/usr/bin/env zsh
set -euo pipefail

root="${0:A:h}"
output="$root/clip-a-submit.json"

if [[ -e "$output" ]]; then
  print -u2 -- "Refusing duplicate paid Clip A submission: $output already exists"
  exit 64
fi

prompt="$(<"$root/clip-a-prompt-zh.txt")"

dreamina multimodal2video \
  --image "$root/references/module-board-a.png" \
  --image "$root/references/module-board-b.png" \
  --image "$root/references/module-board-c.png" \
  --image "$root/references/logo-off.png" \
  --image "$root/references/interior-camera.png" \
  --prompt "$prompt" \
  --duration 5 \
  --ratio 16:9 \
  --video_resolution 1080p \
  --model_version seedance2.0_vip \
  --session 0 | tee "$output"
```

- [ ] **Step 4: Write the guarded Clip B submit script without running it**

Create `submit-clip-b.zsh`:

```zsh
#!/usr/bin/env zsh
set -euo pipefail

root="${0:A:h}"
output="$root/clip-b-submit.json"

if [[ -e "$output" ]]; then
  print -u2 -- "Refusing duplicate paid Clip B submission: $output already exists"
  exit 64
fi

prompt="$(<"$root/clip-b-prompt-zh.txt")"

dreamina frames2video \
  --first "$root/references/logo-off.png" \
  --last "$root/references/end-card.png" \
  --prompt "$prompt" \
  --duration 4 \
  --video_resolution 1080p \
  --model_version seedance2.0_vip \
  --session 0 | tee "$output"
```

- [ ] **Step 5: Make scripts executable and verify without submitting**

Run:

```bash
chmod +x docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh
zsh -n docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh
zsh -n docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh
rg -n "5 秒|球心向外|外部球体|不要生成 FlyEnv 字标" docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt
rg -n "4 秒|从上到下|滑块|绿色|FlyEnv|完整环绕" docs/task/flyenv-dreamina-two-stage-intro/clip-b-prompt-zh.txt
```

Expected: both syntax checks exit 0 and every prompt invariant is found. Do not execute either submit script.

- [ ] **Step 6: Commit prompts and guarded scripts**

Run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/clip-b-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh
git commit --only -m "feat: define two-stage Dreamina prompts" -- docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/clip-b-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh
```

### Task 4: Run the no-charge Dreamina preflight and obtain Clip A approval

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/preflight.md`

- [ ] **Step 1: Refresh the CLI contract without submitting**

Run separately:

```bash
dreamina version
```

```bash
dreamina multimodal2video -h
```

```bash
dreamina frames2video -h
```

Expected: `multimodal2video` still accepts up to nine images, duration 4–15, ratio 16:9, and `seedance2.0_vip` at 1080p; `frames2video` still accepts duration 4–15, infers ratio from the first frame, and supports `seedance2.0_vip` at 1080p.

- [ ] **Step 2: Reuse or complete official OAuth login**

Run:

```bash
dreamina user_credit
```

Expected: current credit JSON is returned. If it returns a login/authentication error, run `dreamina login`, relay the OAuth Device Flow URI and code to the user, keep the command alive until completion, explicitly confirm successful login, then rerun `dreamina user_credit`. Do not use cookies, manual tokens, or another login channel.

- [ ] **Step 3: Record non-sensitive preflight facts**

Create `preflight.md` containing the local date/time, CLI version, login/session confirmation without tokens, current credit balance, both exact model/input/duration/resolution contracts, all six image dimensions and sizes, and a statement that neither paid submit script has run.

- [ ] **Step 4: Commit only the preflight record**

Run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/preflight.md
git commit --only -m "docs: record Dreamina intro preflight" -- docs/task/flyenv-dreamina-two-stage-intro/preflight.md
```

- [ ] **Step 5: Present the Clip A paid gate and stop**

Tell the user the current available credits and exact Clip A model, five-image input list, duration, ratio, and resolution. State that the next command is one guarded paid submission and Clip B will not be submitted until Clip A passes. Ask for explicit approval to run `submit-clip-a.zsh`; do not continue without an affirmative answer.

### Task 5: Submit, poll, and download Clip A exactly once

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-submit.json`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-latest.json`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4`

- [ ] **Step 1: Run the approved Clip A paid submission once**

After explicit approval, run:

```bash
docs/task/flyenv-dreamina-two-stage-intro/submit-clip-a.zsh
```

Expected: JSON contains a real `submit_id` and `gen_status` equal to `querying` or `success`. Never rerun this script automatically.

- [ ] **Step 2: Validate and immediately report the submit response**

Run:

```bash
node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-dreamina-two-stage-intro/clip-a-submit.json","utf8"));const id=j.submit_id??j.submitId??j.data?.submit_id;const s=j.gen_status??j.genStatus??j.data?.gen_status;if(!id||!["querying","success"].includes(s))process.exit(1);console.log({submitId:id,genStatus:s})'
```

Expected: exit 0 with the actual `submitId` and `genStatus`. Tell the user both values before polling.

- [ ] **Step 3: Query Clip A manually and save the latest response**

Run as one shell call:

```bash
submit_id="$(node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-dreamina-two-stage-intro/clip-a-submit.json","utf8"));process.stdout.write(j.submit_id??j.submitId??j.data?.submit_id)')"
dreamina query_result --submit_id="$submit_id" --download_dir=docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a | tee docs/task/flyenv-dreamina-two-stage-intro/clip-a-latest.json
```

Expected: a current asynchronous state or successful media result. Repeat this exact query as separate calls with user-visible status updates; do not launch a background poller.

- [ ] **Step 4: Handle Clip A terminal state**

On `success`, locate the downloaded MP4:

```bash
find docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a -type f -name '*.mp4' -print
```

Copy the single returned file to the deterministic ignored path:

```bash
clip_a_source="$(find docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a -type f -name '*.mp4' -print -quit)"
cp "$clip_a_source" docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4
```

On `fail`, missing `submit_id`, `AigcComplianceConfirmationRequired`, service failure, or timeout: report the exact reason and stop. Do not resubmit without explicit user approval.

### Task 6: Verify Clip A before spending credits on Clip B

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames/*.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification.md`

- [ ] **Step 1: Verify Clip A streams, aspect ratio, resolution, and duration**

Run:

```bash
ffprobe -v error -show_entries format=duration -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of json docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4
```

Expected: 1920×1080 video, an audio stream, and duration close to 5 seconds. A 960×960 or other square result is FAIL; do not crop it.

- [ ] **Step 2: Extract full-timeline and dense action evidence**

Run:

```bash
mkdir -p docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames
ffmpeg -hide_banner -loglevel error -y -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4 -vf "fps=4,scale=384:216,tile=5x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames/full-timeline.png
ffmpeg -hide_banner -loglevel error -y -ss 2.3 -t 1.8 -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4 -vf "fps=8,scale=384:216,tile=5x3" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames/interior-window.png
ffmpeg -hide_banner -loglevel error -y -ss 3.8 -t 1.2 -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4 -vf "fps=8,scale=480:270,tile=4x3" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames/collapse-window.png
```

Expected: three PNG contact sheets.

- [ ] **Step 3: Review Clip A against the hard gate**

Use image-view on all three sheets and review the MP4. Record PASS/FAIL for:

- single monitor and continuous slow-to-fast module burst;
- more than 20 visible plaques representing the 24 references;
- every readable module name exactly matches a reference board;
- every visible Logo belongs to the adjacent module name;
- no invented or duplicated readable module identity;
- camera crosses the screen and looks outward from the hollow-sphere center;
- monitor absent during interior POV and no complete external globe shown;
- collapse resolves to the official centered Logo and cyan-white flash;
- no unintended wordmark or extra text;
- native electronic/audio effects present.

Any readable misspelling, wrong Logo pairing, external-globe camera, square frame, or missing collapse is FAIL and stops the plan before Clip B.

- [ ] **Step 4: Write Clip A verification**

Create `clip-a-verification.md` containing the real `submit_id`, final task status, exact ffprobe data, local media path, checklist, observed defects, and a clear hard-gate result.

- [ ] **Step 5: Stop or commit Clip A evidence**

If FAIL: tell the user the exact defects and ask whether to accept, approve one Clip A retry, or expand scope to tracked overlays. Do not submit Clip B.

If PASS, run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/clip-a-submit.json docs/task/flyenv-dreamina-two-stage-intro/clip-a-latest.json docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification.md
git commit --only -m "docs: verify Dreamina FlyEnv module clip" -- docs/task/flyenv-dreamina-two-stage-intro/clip-a-submit.json docs/task/flyenv-dreamina-two-stage-intro/clip-a-latest.json docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification-frames docs/task/flyenv-dreamina-two-stage-intro/clip-a-verification.md
```

- [ ] **Step 6: Present the separate Clip B paid gate and stop**

Run `dreamina user_credit`, report remaining credits, show the exact four-second `frames2video` model/first/last-frame parameters, and request explicit approval to run `submit-clip-b.zsh` once.

### Task 7: Submit, poll, and download Clip B exactly once

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-b-submit.json`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-b-latest.json`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4`

- [ ] **Step 1: Run the approved Clip B paid submission once**

After explicit approval, run:

```bash
docs/task/flyenv-dreamina-two-stage-intro/submit-clip-b.zsh
```

Expected: JSON contains a real `submit_id` and `gen_status` of `querying` or `success`. Never rerun automatically.

- [ ] **Step 2: Validate and report Clip B submission**

Run:

```bash
node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-dreamina-two-stage-intro/clip-b-submit.json","utf8"));const id=j.submit_id??j.submitId??j.data?.submit_id;const s=j.gen_status??j.genStatus??j.data?.gen_status;if(!id||!["querying","success"].includes(s))process.exit(1);console.log({submitId:id,genStatus:s})'
```

Expected: exit 0; immediately tell the user the returned values.

- [ ] **Step 3: Query Clip B manually and download the result**

Run individual queries:

```bash
submit_id="$(node -e 'const j=JSON.parse(require("node:fs").readFileSync("docs/task/flyenv-dreamina-two-stage-intro/clip-b-submit.json","utf8"));process.stdout.write(j.submit_id??j.submitId??j.data?.submit_id)')"
dreamina query_result --submit_id="$submit_id" --download_dir=docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b | tee docs/task/flyenv-dreamina-two-stage-intro/clip-b-latest.json
```

On success:

```bash
clip_b_source="$(find docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b -type f -name '*.mp4' -print -quit)"
cp "$clip_b_source" docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4
```

On any failure, report and stop without resubmission.

### Task 8: Verify Clip B before composition

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames/*.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification.md`

- [ ] **Step 1: Verify Clip B media**

Run:

```bash
ffprobe -v error -show_entries format=duration -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of json docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4
```

Expected: 1920×1080, audio present, duration close to 4 seconds.

- [ ] **Step 2: Extract switch and end-card evidence**

Run:

```bash
mkdir -p docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames
ffmpeg -hide_banner -loglevel error -y -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4 -vf "fps=5,scale=384:216,tile=5x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames/full-timeline.png
ffmpeg -hide_banner -loglevel error -y -ss 0.8 -t 1.7 -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4 -vf "fps=12,scale=384:216,tile=5x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames/switch-window.png
ffmpeg -hide_banner -loglevel error -y -ss 2.1 -t 1.9 -i docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4 -vf "fps=8,scale=384:216,tile=5x3" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames/lightning-end-window.png
```

- [ ] **Step 3: Review Clip B against the hard gate**

Confirm:

- flash overlap material occupies the first second;
- top, then middle, then bottom knob visibly moves to the opposite side;
- exactly one switch changes per beat, each track turns green, and no switch reverts;
- whole Logo does not turn green;
- lightning completes a full wrap rather than an underline;
- final `FlyEnv` spelling and official Logo match `end-card.png`;
- final frame contains no extra text and holds at least 0.6 seconds;
- audio contains separate switch transients and a final impact.

Any wrong switch order, simultaneous glow-only activation, `FlyEnb`, off final switch, incomplete lightning, square frame, or extra text is FAIL and stops before composition.

- [ ] **Step 4: Write and commit Clip B verification on PASS**

Create `clip-b-verification.md` with exact metadata and checklist. If FAIL, report and request direction without composing.

If PASS:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/clip-b-submit.json docs/task/flyenv-dreamina-two-stage-intro/clip-b-latest.json docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification.md
git commit --only -m "docs: verify Dreamina FlyEnv Logo clip" -- docs/task/flyenv-dreamina-two-stage-intro/clip-b-submit.json docs/task/flyenv-dreamina-two-stage-intro/clip-b-latest.json docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification-frames docs/task/flyenv-dreamina-two-stage-intro/clip-b-verification.md
```

### Task 9: Compose the accepted clips into exactly eight seconds

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/compose.zsh`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4`

- [ ] **Step 1: Write the deterministic composition script**

Create `compose.zsh`:

```zsh
#!/usr/bin/env zsh
set -euo pipefail

if (( $# != 2 )); then
  print -u2 -- "Usage: $0 <clip-a.mp4> <clip-b.mp4>"
  exit 64
fi

root="${0:A:h}"
clip_a="$1"
clip_b="$2"
output="$root/flyenv-dreamina-intro.mp4"

[[ -f "$clip_a" ]] || { print -u2 -- "Missing Clip A: $clip_a"; exit 66; }
[[ -f "$clip_b" ]] || { print -u2 -- "Missing Clip B: $clip_b"; exit 66; }

fps_a="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$clip_a")"
fps_b="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$clip_b")"
target_fps="$fps_a"
if [[ "$fps_a" != "$fps_b" ]]; then
  target_fps="30"
fi

ffmpeg -y \
  -i "$clip_a" \
  -i "$clip_b" \
  -filter_complex "
    [0:v]setpts=PTS-STARTPTS,fps=${target_fps},settb=AVTB,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];
    [1:v]setpts=PTS-STARTPTS,fps=${target_fps},settb=AVTB,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];
    [v0][v1]xfade=transition=fade:duration=1:offset=4[v];
    [0:a]asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a0];
    [1:a]asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[a1];
    [a0][a1]acrossfade=d=1:c1=tri:c2=tri[a]
  " \
  -map "[v]" \
  -map "[a]" \
  -t 8 \
  -c:v libx264 \
  -preset slow \
  -crf 16 \
  -pix_fmt yuv420p \
  -c:a aac \
  -b:a 192k \
  -movflags +faststart \
  "$output"
```

- [ ] **Step 2: Validate script syntax and commit it**

Run:

```bash
chmod +x docs/task/flyenv-dreamina-two-stage-intro/compose.zsh
zsh -n docs/task/flyenv-dreamina-two-stage-intro/compose.zsh
git add docs/task/flyenv-dreamina-two-stage-intro/compose.zsh
git commit --only -m "feat: compose two-stage Dreamina intro" -- docs/task/flyenv-dreamina-two-stage-intro/compose.zsh
```

- [ ] **Step 3: Compose the accepted source clips**

Run:

```bash
docs/task/flyenv-dreamina-two-stage-intro/compose.zsh docs/task/flyenv-dreamina-two-stage-intro/generated/clip-a.mp4 docs/task/flyenv-dreamina-two-stage-intro/generated/clip-b.mp4
```

Expected: exit 0 and `flyenv-dreamina-intro.mp4` exists.

### Task 10: Verify and hand off the final composed intro

**Files:**
- Create: `docs/task/flyenv-dreamina-two-stage-intro/verification-frames/*.png`
- Create: `docs/task/flyenv-dreamina-two-stage-intro/verification.md`

- [ ] **Step 1: Verify exact final media properties**

Run:

```bash
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of json docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4
```

Expected: H.264 video at 1920×1080, AAC stereo audio, and duration between 7.99 and 8.01 seconds.

- [ ] **Step 2: Extract final review moments and timeline**

Run:

```bash
mkdir -p docs/task/flyenv-dreamina-two-stage-intro/verification-frames
ffmpeg -hide_banner -loglevel error -y -i docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4 -vf "fps=2,scale=480:270,tile=4x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/verification-frames/full-timeline.png
ffmpeg -hide_banner -loglevel error -y -ss 3.7 -t 1.6 -i docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4 -vf "fps=10,scale=384:216,tile=4x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/verification-frames/transition-window.png
ffmpeg -hide_banner -loglevel error -y -ss 4.8 -t 2.0 -i docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4 -vf "fps=10,scale=384:216,tile=5x4" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/verification-frames/switch-window.png
ffmpeg -hide_banner -loglevel error -y -ss 6.6 -t 1.4 -i docs/task/flyenv-dreamina-two-stage-intro/flyenv-dreamina-intro.mp4 -vf "fps=10,scale=384:216,tile=5x3" -frames:v 1 docs/task/flyenv-dreamina-two-stage-intro/verification-frames/end-window.png
```

- [ ] **Step 3: Review final continuity, visuals, and audio**

Use image-view on all four sheets and review the complete MP4. Verify:

- the 4.0–5.0 second overlap reads as one continuous cyan-white collapse/flash, with no visible cut or double Logo;
- audio crossfade has no click, gap, or volume jump;
- inside-sphere camera, exact module identities, switch order, green on-state, lightning wrap, and final `FlyEnv` satisfy both clip reports;
- no square padding or cropping artifact is present;
- final end card remains stable through 8.0 seconds.

- [ ] **Step 4: Write the final verification report**

Create `verification.md` containing both real `submit_id` values, final Dreamina task states, exact Clip A/Clip B/final ffprobe metadata, reference/model parameters, final PASS/PARTIAL/FAIL checklist, all observed defects, exact local output path, and a declaration that post-production used only normalization, one video/audio crossfade, and final encoding with no 24-plaque tracking.

- [ ] **Step 5: Run the complete local verification suite**

Run:

```bash
node --import tsx --test docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
yarn test:startup-groups
git diff --check -- docs/task/flyenv-dreamina-two-stage-intro docs/superpowers/specs/2026-07-14-flyenv-dreamina-two-stage-intro-design.md
git diff --cached --check -- docs/task/flyenv-dreamina-two-stage-intro docs/superpowers/specs/2026-07-14-flyenv-dreamina-two-stage-intro-design.md
```

Expected: renderer tests pass, startup-group tests pass, and both diff checks are silent.

- [ ] **Step 6: Commit verification artifacts but not MP4 files**

Run:

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/verification-frames docs/task/flyenv-dreamina-two-stage-intro/verification.md
git commit --only -m "docs: verify two-stage Dreamina FlyEnv intro" -- docs/task/flyenv-dreamina-two-stage-intro/verification-frames docs/task/flyenv-dreamina-two-stage-intro/verification.md
```

Expected: only verification PNGs and Markdown are committed. Downloaded Clip A, Clip B, and final MP4 remain local and ignored.

- [ ] **Step 7: Final handoff**

Report the final local clickable MP4 path; exact duration, resolution, frame rate, codecs, and audio presence; both `submit_id` values and the fact that each paid script ran once; acceptance summary and known defects; verification report path and relevant commits; and confirmation that no remote push, PR, or additional paid generation occurred.
