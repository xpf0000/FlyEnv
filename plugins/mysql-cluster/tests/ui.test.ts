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

test('initial ports advance after existing SQL nodes and reserve existing GR ports for whole groups', () => {
  const existing = [
    { port: 13306, groupPort: 13406 },
    { port: 13307, groupPort: 13408 }
  ]
  assert.equal(api.suggestStartPort(existing, 'standalone', 1), 13308)
  assert.equal(api.suggestStartPort(existing, 'replication', 2), 13308)
  assert.equal(api.suggestStartPort(existing, 'group-replication', 3), 13309)
  assert.equal(api.suggestStartPort([{ port: 13307, groupPort: 13309 }], 'replication', 2), 13310)
})
test('port suggestions remain within TCP limits and fall back when the highest port is already used', () => {
  assert.equal(api.suggestStartPort([], 'standalone', 1), 13306)
  assert.equal(api.suggestStartPort([{ port: 65535 }], 'group-replication', 9), 13306)
  const all = Array.from({ length: 65535 }, (_, n) => ({ port: n + 1 }))
  assert.equal(api.suggestStartPort(all, 'standalone', 1), undefined)
})
