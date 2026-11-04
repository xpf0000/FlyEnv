import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
test('plugin errors and success call public Element helpers with escaped text', async () => {
  const notices: unknown[] = []
  ;(globalThis as any).__mcNotices = notices
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/render/notice.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'public-element',
        setup(builder) {
          builder.onResolve({ filter: /^@\/util\/Element$/ }, () => ({
            path: 'Element',
            namespace: 'public'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'public' }, () => ({
            contents:
              "export const MessageError=x=>globalThis.__mcNotices.push(['error',x]);export const MessageSuccess=x=>globalThis.__mcNotices.push(['success',x])"
          }))
        }
      }
    ]
  })
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
  api.MessageError('<img src=x> & "error"')
  api.MessageSuccess('Saved')
  assert.deepEqual(notices, [
    ['error', '&lt;img src=x&gt; &amp; &quot;error&quot;'],
    ['success', 'Saved']
  ])
  delete (globalThis as any).__mcNotices
})
