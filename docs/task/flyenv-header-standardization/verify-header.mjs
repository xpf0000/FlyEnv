import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const taskDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(taskDir, '../../..')
const source = path.join(root, 'docs/flyenv-header.mp4')
const output = path.join(root, 'docs/flyenv-header-master.mp4')
const wordmark = path.join(taskDir, 'flyenv-wordmark.png')
const renderScript = path.join(taskDir, 'render-header.sh')
const expectedSourceSha = 'e355298039326367e072b9d467e851eee3ed9a635adf43994d8f1eeb134c1c02'

function sha256(filename) {
  const result = execFileSync('openssl', ['dgst', '-sha256', filename], { encoding: 'utf8' })
  return result.trim().split('= ').at(-1)
}

function textAttribute(filename) {
  const relative = path.relative(root, filename)
  const result = execFileSync('git', ['check-attr', 'text', '--', relative], {
    cwd: root,
    encoding: 'utf8'
  })
  return result.trim().split(': ').at(-1)
}

function probe(filename) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,sample_rate,channels',
        '-of',
        'json',
        filename
      ],
      { encoding: 'utf8' }
    )
  )
}

assert.equal(sha256(source), expectedSourceSha, 'source checksum changed')
assert.equal(textAttribute(source), 'unset', 'source MP4 must be treated as binary by Git')
assert.equal(textAttribute(output), 'unset', 'master MP4 must be treated as binary by Git')
assert.equal(existsSync(output), true, 'standardized master is missing')
const trimmedWordmarkWidth = Number(
  execFileSync('magick', [wordmark, '-trim', '-format', '%w', 'info:'], { encoding: 'utf8' })
)
assert.ok(
  trimmedWordmarkWidth >= 240 && trimmedWordmarkWidth <= 360,
  `wordmark width=${trimmedWordmarkWidth}`
)
assert.match(readFileSync(renderScript, 'utf8'), /overlay=680:800:/)

const metadata = probe(output)
const video = metadata.streams.find((stream) => stream.codec_type === 'video')
const audio = metadata.streams.find((stream) => stream.codec_type === 'audio')
const duration = Number(metadata.format.duration)

assert.ok(duration >= 4.95 && duration <= 5.05, `duration=${duration}`)
assert.ok(video)
assert.equal(video.codec_name, 'h264')
assert.equal(video.profile, 'High')
assert.equal(video.width, 1920)
assert.equal(video.height, 1080)
assert.equal(video.pix_fmt, 'yuv420p')
assert.equal(video.r_frame_rate, '30/1')
assert.equal(video.avg_frame_rate, '30/1')
assert.ok(audio)
assert.equal(audio.codec_name, 'aac')
assert.equal(audio.sample_rate, '48000')
assert.equal(audio.channels, 2)

for (const filename of ['opening.png', 'wordmark.png', 'fade.png', 'tail.png']) {
  assert.equal(
    existsSync(path.join(taskDir, 'verification', filename)),
    true,
    `missing verification/${filename}`
  )
}

console.log('FlyEnv header master contract verified')
