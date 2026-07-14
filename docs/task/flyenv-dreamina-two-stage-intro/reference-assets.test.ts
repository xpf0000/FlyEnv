import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
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
  interiorCameraSvg,
  moduleBoardSvg,
  renderReferenceAssets
} from './reference-assets.ts'

test('reference routing uses five Clip A images and two Clip B frames', () => {
  assert.deepEqual(REFERENCE_FILES, [
    'module-board-a.png',
    'module-board-b.png',
    'module-board-c.png',
    'logo-off.png',
    'end-card.png',
    'interior-camera.png'
  ])
  assert.deepEqual(CLIP_A_REFERENCE_FILES, [
    'module-board-a.png',
    'module-board-b.png',
    'module-board-c.png',
    'logo-off.png',
    'interior-camera.png'
  ])
  assert.deepEqual(CLIP_B_FRAME_FILES, ['logo-off.png', 'end-card.png'])
})

test('interior camera reference contains no text element', () => {
  const svg = interiorCameraSvg()
  assert.equal(svg.includes('<text'), false)
  assert.match(svg, /data-camera="inside-sphere"/)
})

test('end card contains one exact FlyEnv wordmark and three on-state switches', async () => {
  const svg = await endCardSvg()
  assert.equal(svg.match(/data-switch-on=/g)?.length, 3)
  assert.equal(svg.match(/>FlyEnv<\/text>/g)?.length, 1)
  assert.equal(svg.includes('FlyEnb'), false)
})

test('module boards place every dark-default SVG on a high-contrast icon tile', async () => {
  const svg = await moduleBoardSvg(partitionModules(MODULES)[0])
  assert.equal(svg.match(/data-icon-tile=/g)?.length, 8)
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

test('Clip A web prompt locks the inside-sphere camera and omits the wordmark', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-a-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /球心向外/)
  assert.match(prompt, /禁止从球体外部观察/)
  assert.match(prompt, /不要生成 FlyEnv 字标/)
})

test('Clip B web prompt locks switch mechanics and the exact end card', async () => {
  const prompt = await readFile(path.join(import.meta.dirname, 'clip-b-prompt-zh.txt'), 'utf8')
  assert.match(prompt, /从上到下/)
  assert.match(prompt, /滑块清楚滑到轨道另一侧/)
  assert.match(prompt, /底色变为绿色/)
  assert.match(prompt, /完整环绕一圈/)
  assert.match(prompt, /不得重新绘制或改写尾帧中的 FlyEnv/)
})

test('web guide fixes upload order and requires UI-level 16:9', async () => {
  const guide = await readFile(path.join(import.meta.dirname, 'web-execution.md'), 'utf8')
  assert.match(guide, /图片 1.*module-board-a\.png/s)
  assert.match(guide, /图片 5.*interior-camera\.png/s)
  assert.match(guide, /必须在网页参数中选择 `16:9`/)
  assert.match(guide, /不要只在提示词里写 16:9/)
})
