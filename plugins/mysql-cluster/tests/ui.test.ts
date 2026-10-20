import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, compileScript } from '@vue/compiler-sfc'
const api = await import('../render/form').catch(() => ({}) as any)
test('all plugin views compile their real template expressions after formatting', async () => {
  const root = join(import.meta.dirname, '../render')
  for (const file of (await readdir(root)).filter((f) => f.endsWith('.vue'))) {
    const { descriptor, errors } = parse(await readFile(join(root, file), 'utf8'), {
      filename: file
    })
    assert.deepEqual(errors, [], file)
    assert.doesNotThrow(() => compileScript(descriptor, { id: file, inlineTemplate: true }), file)
  }
})
test('one-click node previews allocate independent identities, sockets, ports and data directories', () => {
  const request = api.createDraftRequest?.(
    {
      id: 'abc',
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'dev',
      mode: 'group-replication',
      count: 3,
      startPort: 13306,
      rootDir: '/tmp/my data',
      password: 'pw',
      engine: { version: '8.4.8', path: '/mysql', bin: '/mysql/bin/mysqld', source: 'Static' }
    },
    'macOS'
  )
  assert.deepEqual(
    request?.instances.map((i: any) => [i.port, i.groupPort]),
    [
      [13306, 13406],
      [13307, 13407],
      [13308, 13408]
    ]
  )
  assert.equal(new Set(request.instances.map((i: any) => i.socket)).size, 3)
  assert.equal(request.instances[0].dataDir, '/tmp/my data/abc/node-1')
  assert.equal(request.cluster.memberIds.length, 3)
})
test('replica count adds a source and Windows previews use pipe names', () => {
  const request = api.createDraftRequest(
    {
      id: 'abc',
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'dev',
      mode: 'replication',
      count: 2,
      startPort: 13306,
      rootDir: 'C:/My Data',
      password: 'pw',
      engine: {
        version: '8.4.8',
        path: 'C:/mysql',
        bin: 'C:/mysql/bin/mysqld.exe',
        source: 'Static'
      }
    },
    'Windows'
  )
  assert.equal(request.instances.length, 3)
  assert.equal(request.instances[0].socket, 'FlyEnvMC_abc_1')
  assert.equal(request.credentials.abc_1.password, 'pw')
})
