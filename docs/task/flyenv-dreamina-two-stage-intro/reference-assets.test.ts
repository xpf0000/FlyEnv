import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { MODULES, partitionModules } from '../flyenv-kling-intro/module-manifest.ts'
import {
  CLIP_A_REFERENCE_FILES,
  CLIP_B_FRAME_FILES,
  REFERENCE_FILES,
  endCardSvg,
  logoOffSvg,
  moduleBoardSvg,
  renderReferenceAssets
} from './reference-assets.ts'

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

test('end card contains one exact FlyEnv wordmark and three on-state switches', async () => {
  const svg = await endCardSvg()
  assert.equal(svg.match(/data-switch-on=/g)?.length, 3)
  assert.equal(svg.match(/>FlyEnv<\/text>/g)?.length, 1)
  assert.equal(svg.includes('FlyEnb'), false)
})

test('brand anchor frames omit non-brand ring decorations', async () => {
  const logoOff = await logoOffSvg()
  const endCard = await endCardSvg()
  assert.equal(logoOff.includes('<circle'), false)
  assert.equal(endCard.includes('<ellipse'), false)
})

test('module boards place every dark-default SVG on a high-contrast icon tile', async () => {
  const svg = await moduleBoardSvg(partitionModules(MODULES)[0])
  assert.equal(svg.match(/data-icon-tile=/g)?.length, 8)
})

test('module boards use a solid outer background without gradients', async () => {
  const svg = await moduleBoardSvg(partitionModules(MODULES)[0])
  assert.match(svg, /data-board-background="solid"/)
  assert.equal(svg.includes('<radialGradient id="bg">'), false)
})

test('module boards leave at least 64px between icon tile and module name', async () => {
  const svg = await moduleBoardSvg(partitionModules(MODULES)[0])
  const tile = svg.match(/data-icon-tile="Nginx" x="(\d+)" y="\d+" width="(\d+)"/)
  const text = svg.match(/data-module="Nginx"[\s\S]*?<text x="(\d+)"/)
  assert.ok(tile)
  assert.ok(text)
  const tileRight = Number(tile[1]) + Number(tile[2])
  const textStart = Number(text[1])
  assert.ok(textStart - tileRight >= 64, `gap=${textStart - tileRight}`)
})

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

test('Clip A uses positive center-POV camera language and omits the wordmark', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /球心向外/)
  assert.match(prompt, /摄影机固定在球心/)
  assert.match(prompt, /原地旋转扫描约 120 度/)
  assert.match(prompt, /不要生成 FlyEnv 字标/)
})

test('Clip A prompt references uploads by filename instead of numbered image labels', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  for (const filename of CLIP_A_REFERENCE_FILES) {
    assert.ok(prompt.includes(`@${filename}`), filename)
  }
  assert.doesNotMatch(prompt, /@图片\d+/)
})

test('Clip A treats module boards as identity contact sheets rather than complete scenes', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /模块身份素材索引表/)
  assert.match(prompt, /不是场景画面、构图参考、UI 面板/)
  assert.match(prompt, /24 组.*相互独立/)
  assert.match(prompt, /严禁.*整张素材表/)
  assert.match(prompt, /2×4 网格/)
})

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

test('Clip B web prompt locks switch mechanics and the exact end card', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-b-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /从上到下/)
  assert.match(prompt, /滑块清楚滑到轨道另一侧/)
  assert.match(prompt, /底色变为绿色/)
  assert.match(prompt, /完整环绕一圈/)
  assert.match(prompt, /不得重新绘制或改写尾帧中的 FlyEnv/)
})

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
