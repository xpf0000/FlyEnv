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
  endCardSvg,
  interiorCameraSvg,
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
