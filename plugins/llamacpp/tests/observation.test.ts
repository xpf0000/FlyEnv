import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { observeRuntime } from '../fork/observation'
test('reports actual API modalities and treats failed observation as supplementary', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/props') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          modalities: ['text', 'image'],
          chat_template_caps: { supports_tools: true }
        })
      )
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    const port = (server.address() as any).port
    const result = await observeRuntime('http://127.0.0.1:' + port)
    assert.deepEqual(result.modalities, ['text', 'image'])
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
  const failed = await observeRuntime('http://127.0.0.1:1')
  assert.equal(failed.modalities, undefined)
  assert.ok(failed.reason)
})
test('reads current llama.cpp props boolean modalities and model architecture fallback', async () => {
  let mode = 'props'
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (mode === 'props')
      res.end(
        JSON.stringify({
          modalities: { vision: true, audio: false, video: false },
          chat_template_caps: { supports_tools: true }
        })
      )
    else if (req.url === '/props') {
      res.statusCode = 404
      res.end('{}')
    } else
      res.end(JSON.stringify({ data: [{ architecture: { input_modalities: ['text', 'audio'] } }] }))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    const url = 'http://127.0.0.1:' + (server.address() as any).port
    assert.deepEqual((await observeRuntime(url)).modalities, ['image'])
    mode = 'models'
    assert.deepEqual((await observeRuntime(url)).modalities, ['text', 'audio'])
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
