# Dreamina Remove Camera Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the composition reference that polluted Dreamina trial 5392 and make Clip A use four uploaded images plus positive text-only inside-module-field camera direction.

**Architecture:** Retire `interior-camera.png` from the source generator, active reference arrays, tests, prompt, web guide, and on-disk deliverables. Preserve the three identity contact sheets and FlyEnv Logo reference, while changing camera instructions from schematic/negative vocabulary to a positive near–middle–far POV motion contract.

**Tech Stack:** TypeScript, Node test runner, Sharp SVG-to-PNG rendering, plain-text Chinese prompt, Markdown web guide, ImageMagick verification.

**Workspace constraint:** Execute in the current `master` workspace as requested. Use exact-path `git commit --only` commands because unrelated user changes exist elsewhere in the repository.

---

## File map

- Modify `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts`: reduce the generated bundle to five files and Clip A routing to four files; delete the retired camera SVG generator.
- Modify `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts`: lock exact active files, exact renderer output, four-image prompt routing, and positive camera language.
- Delete `docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png`: prevent accidental upload of the retired reference.
- Modify `docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt`: remove the fifth image and schematic vocabulary; describe desired POV motion positively.
- Modify `docs/task/flyenv-dreamina-two-stage-intro/web-execution.md`: document exactly four Clip A uploads and the tested readability tradeoff.

### Task 1: Remove the camera image from the generated reference bundle

**Files:**

- Modify: `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts`
- Modify: `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts`
- Delete: `docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png`

- [ ] **Step 1: Write the failing active-bundle tests**

In `reference-assets.test.ts`:

1. Change the `node:fs/promises` import to include `readdir`:

```ts
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
```

2. Remove `interiorCameraSvg` from the `./reference-assets.ts` import.

3. Replace the routing test with:

```ts
test('reference routing uses four Clip A images and two Clip B frames', () => {
  assert.deepEqual(REFERENCE_FILES, [
    'module-board-a.png',
    'module-board-b.png',
    'module-board-c.png',
    'logo-off.png',
    'end-card.png'
  ])
  assert.deepEqual(CLIP_A_REFERENCE_FILES, [
    'module-board-a.png',
    'module-board-b.png',
    'module-board-c.png',
    'logo-off.png'
  ])
  assert.deepEqual(CLIP_B_FRAME_FILES, ['logo-off.png', 'end-card.png'])
})
```

4. Delete the obsolete `interior camera reference is a layered POV rather than a flat ring diagram` test.

5. Replace the renderer test opening and add an exact directory assertion:

```ts
test('renderer creates only five compliant 1920x1080 PNG references', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'flyenv-dreamina-ref-'))
  try {
    await renderReferenceAssets(output)
    assert.deepEqual((await readdir(output)).sort(), [...REFERENCE_FILES].sort())
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

- [ ] **Step 2: Run the focused tests and verify the expected failure**

```bash
node --import tsx --test --test-name-pattern="reference routing|renderer creates only five" docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: the routing assertion fails because production still includes `interior-camera.png`.

- [ ] **Step 3: Reduce the active arrays to five total references and four Clip A uploads**

Replace the two arrays in `reference-assets.ts` with:

```ts
export const REFERENCE_FILES = [
  'module-board-a.png',
  'module-board-b.png',
  'module-board-c.png',
  'logo-off.png',
  'end-card.png'
] as const

export const CLIP_A_REFERENCE_FILES = [
  'module-board-a.png',
  'module-board-b.png',
  'module-board-c.png',
  'logo-off.png'
] as const
```

- [ ] **Step 4: Delete the retired SVG generator**

Delete all code from `type InteriorDepth = ...` through the closing brace of `interiorCameraSvg()`. The next declaration after `endCardSvg()` must be `renderReferenceAssets()`.

Remove the now-unused `dome` gradient and `glow` filter from `documentSvg()` so its `<defs>` block contains only:

```xml
<defs>
  <radialGradient id="bg"><stop stop-color="#143866"/><stop offset="0.48" stop-color="#07162f"/><stop offset="1" stop-color="#01040d"/></radialGradient>
</defs>
```

Replace the `svgs` array inside `renderReferenceAssets()` with:

```ts
const svgs = [
  await moduleBoardSvg(groups[0]),
  await moduleBoardSvg(groups[1]),
  await moduleBoardSvg(groups[2]),
  await logoOffSvg(),
  await endCardSvg()
]
```

- [ ] **Step 5: Delete the retired binary reference**

```bash
git rm docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png
```

Expected: Git stages deletion of only `interior-camera.png`.

- [ ] **Step 6: Format and run the focused tests**

```bash
npx prettier --write docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
node --import tsx --test --test-name-pattern="reference routing|renderer creates only five" docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: two tests pass, zero fail. The temporary renderer directory contains exactly five PNG files.

- [ ] **Step 7: Commit the active-bundle change with path isolation**

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png
git commit --only -m "fix: retire Dreamina camera reference" -- docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/references/interior-camera.png
```

Expected: one commit with two modified TypeScript files and one deleted PNG.

### Task 2: Convert Clip A to four-image positive camera direction

**Files:**

- Modify: `docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts`
- Modify: `docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt`
- Modify: `docs/task/flyenv-dreamina-two-stage-intro/web-execution.md`

- [ ] **Step 1: Write the failing prompt and guide tests**

Replace `Clip A web prompt locks the inside-sphere camera and omits the wordmark` with:

```ts
test('Clip A uses positive center-POV camera language and omits the wordmark', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /球心向外/)
  assert.match(prompt, /摄影机固定在球心/)
  assert.match(prompt, /原地旋转扫描约 120 度/)
  assert.match(prompt, /不要生成 FlyEnv 字标/)
})
```

Replace the topology-reference test with:

```ts
test('Clip A has no camera image or schematic vocabulary', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  for (const forbidden of [
    '@interior-camera.png',
    '空间关系示意图',
    '椭圆',
    '圆圈',
    '线框',
    '占位铭牌',
    '二维环形排布',
    '二维圆环',
    '平面信息图',
    '外部球体视角'
  ]) {
    assert.equal(prompt.includes(forbidden), false, forbidden)
  }
  assert.match(prompt, /近景.*画面边缘/)
  assert.match(prompt, /中景.*完整可读/)
  assert.match(prompt, /远景.*轮廓清楚/)
})
```

Replace the web-guide test with:

```ts
test('web guide uses exactly four Clip A filenames and requires UI-level 16:9', async () => {
  const guide = await readFile(path.join(import.meta.dirname, 'web-execution.md'), 'utf8')
  assert.match(guide, /@module-board-a\.png/)
  assert.match(guide, /@logo-off\.png/)
  assert.match(guide, /以上四个文件名/)
  assert.doesNotMatch(guide, /interior-camera\.png/)
  assert.doesNotMatch(guide, /图片\s*\d/)
  assert.match(guide, /必须在网页参数中选择 `16:9`/)
  assert.match(guide, /不要只在提示词里写 16:9/)
})
```

- [ ] **Step 2: Run the focused tests and verify the expected failure**

```bash
node --import tsx --test --test-name-pattern="positive center-POV|no camera image|exactly four Clip A" docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: failures report the still-present `@interior-camera.png`, schematic vocabulary, and five-file guide.

- [ ] **Step 3: Remove the fifth reference and use positive camera language in Clip A**

Delete the complete paragraph beginning with `@interior-camera.png`.

Replace the complete `0.6–2.4 秒` paragraph with:

```text
0.6–2.4 秒：从三张模块身份素材索引表中提取 20 张以上相互独立的深色玻璃模块铭牌，从显示器屏幕连续向外喷涌，代表完整的 24 模块生态。最初几张间隔明显、动作清楚，随后间隔持续缩短、速度逐渐加快，形成一次连贯的 Boom 式空间爆发。选择 6–8 张位于近景和中景的英雄铭牌，严格保留参考图中的官方 Logo 和精确英文名称并保持完整可读；其余铭牌分布在远景，只表现玻璃牌轮廓和技术 Logo 色块。所有铭牌飞向不同 Z 轴深度并始终朝向摄影机，形成从屏幕向镜头和四周扩散的立体爆发。
```

Replace the complete `2.4–3.9 秒` paragraph with:

```text
2.4–3.9 秒：摄影机正面穿过显示器屏幕，进入由模块铭牌从近到远包围而成的三维空间中心。摄影机固定在球心，从球心向外看向四周铭牌，显示器留在摄影机身后并退出视野。摄影机在球心原地旋转扫描约 120 度：近景铭牌巨大并快速从画面边缘掠过，中景英雄铭牌完整可读，远景铭牌移动较慢但轮廓清楚。前景遮挡中景，中景遮挡远景，产生强烈近大远小、Z 轴纵深和多层速度视差。镜头全程保持在模块群中心，只做原地旋转，不发生平移。
```

Replace the final `整体：` paragraph with:

```text
整体：深海蓝、青蓝霓虹、少量紫色，电影级体积光和高级物理材质。使用一个严格连续镜头，画面只保留一台显示器、官方模块身份和 FlyEnv Logo；保持文字边缘清楚、前中远三层分明、运动视差强烈。禁止切镜、智能分镜、随机文字、额外品牌、额外显示器、重度景深、过强运动模糊、绿色主色和水印。
```

- [ ] **Step 4: Update the web guide to exactly four Clip A uploads**

Change the opening sentence to `不要把五张图片一次性全部交给同一个任务。`

Use this exact Clip A upload list:

```markdown
1. `module-board-a.png`
2. `module-board-b.png`
3. `module-board-c.png`
4. `logo-off.png`
```

Delete the complete paragraph that assigns a role to `interior-camera.png`.

Replace the upload-confirmation paragraph with:

```markdown
上传后确认网页显示以上四个文件名，然后粘贴 `clip-a-prompt-zh.txt`。提示词使用 `@module-board-a.png`、`@module-board-b.png`、`@module-board-c.png` 和 `@logo-off.png` 直接引用对应素材。
```

Replace the first-segment review sentence with:

```markdown
生成后先检查：输出是否真的是 16:9；是否出现 20 张以上独立铭牌并形成前慢后快的连续爆发；6–8 张近中景英雄铭牌的名称和 Logo 是否正确；摄影机是否穿过屏幕后固定在模块群中心原地旋转；是否存在近景裁切、中景可读、远景缩小的多层视差；最后是否收成居中 Logo 与青白闪光。第一段不合格时不要急着生成第二段。
```

- [ ] **Step 5: Format and run the focused tests**

```bash
npx prettier --write docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/web-execution.md
node --import tsx --test --test-name-pattern="positive center-POV|no camera image|exactly four Clip A" docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: three tests pass, zero fail.

- [ ] **Step 6: Commit the four-image prompt with path isolation**

```bash
git add docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/web-execution.md
git commit --only -m "fix: use text-only Dreamina camera direction" -- docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/web-execution.md
```

Expected: one commit containing only these three paths.

### Task 3: Final verification

**Files:**

- Verify: `docs/task/flyenv-dreamina-two-stage-intro/`

- [ ] **Step 1: Check formatting**

```bash
npx prettier --check docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts docs/task/flyenv-dreamina-two-stage-intro/web-execution.md
```

Expected: all matched files use Prettier style.

- [ ] **Step 2: Run the complete reference suite**

```bash
node --import tsx --test docs/task/flyenv-dreamina-two-stage-intro/reference-assets.test.ts
```

Expected: 13 tests pass, 0 fail.

- [ ] **Step 3: Verify exactly five active PNG references**

```bash
magick identify -format '%f %m %wx%h %b\n' docs/task/flyenv-dreamina-two-stage-intro/references/*.png
```

Expected: exactly five PNG lines, all 1920×1080: three module boards, `logo-off.png`, and `end-card.png`.

- [ ] **Step 4: Scan for the retired file and schematic prompt vocabulary**

```bash
rg -n "interior-camera|空间关系示意图|椭圆|圆圈|线框|占位铭牌|二维环形排布|二维圆环|平面信息图|外部球体视角" docs/task/flyenv-dreamina-two-stage-intro/clip-a-prompt-zh.txt docs/task/flyenv-dreamina-two-stage-intro/web-execution.md docs/task/flyenv-dreamina-two-stage-intro/reference-assets.ts
```

Expected: no matches and exit status 1.

- [ ] **Step 5: Verify diffs and task-path cleanliness**

```bash
git diff --check -- docs/task/flyenv-dreamina-two-stage-intro
git status --short -- docs/task/flyenv-dreamina-two-stage-intro
git log -3 --oneline -- docs/task/flyenv-dreamina-two-stage-intro
```

Expected: diff check exits 0, scoped status is empty, and the two implementation commits are the newest task-path commits.
