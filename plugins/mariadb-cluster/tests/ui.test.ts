import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, compileScript } from '@vue/compiler-sfc'
const api = await import('../render/form').catch(() => ({}) as any)
test('all plugin views compile their real template expressions after formatting', async () => {
  const root = join(import.meta.dirname, '../render')
  const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.vue'))
  for (const file of files) {
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
      name: 'dev',
      mode: 'replication',
      count: 2,
      startPort: 13307,
      rootDir: '/tmp/my data',
      password: 'pw',
      engine: { version: '10.11.10', path: '/mariadb', bin: '/mariadb/bin/mariadbd', source: 'Static' }
    },
    'macOS'
  )
  assert.deepEqual(
    request?.instances.map((i: any) => i.port),
    [13307, 13308, 13309]
  )
  assert.equal(new Set(request.instances.map((i: any) => i.socket)).size, 3)
  assert.equal(request.instances[0].socket, '/tmp/flyenv-mdbc-abc-1.sock')
  assert.equal(request.instances[0].dataDir, '/tmp/my data/abc/node-1')
  assert.equal(request.cluster.memberIds.length, 3)
})
test('replica count adds a source and Windows previews use pipe names', () => {
  const request = api.createDraftRequest(
    {
      id: 'abc',
      name: 'dev',
      mode: 'replication',
      count: 2,
      startPort: 13307,
      rootDir: 'C:/My Data',
      password: 'pw',
      engine: {
        version: '10.11.10',
        path: 'C:/mariadb',
        bin: 'C:/mariadb/bin/mariadbd.exe',
        source: 'Static'
      }
    },
    'Windows'
  )
  assert.equal(request.instances.length, 3)
  assert.equal(request.instances[0].socket, 'FlyEnvMDBC_abc_1')
  assert.equal(request.credentials.abc_1.password, 'pw')
})

test('draft changes preserve custom member directories and use the application data root', () => {
  assert.equal(api.defaultDataRoot('/server/'), '/server/mariadb-cluster/data')
  assert.equal(api.defaultDataRoot('C:\\server\\'), 'C:/server/mariadb-cluster/data')
  const draft = {
    id: 'abc',
    name: 'dev',
    mode: 'standalone',
    count: 1,
    startPort: 13307,
    rootDir: api.defaultDataRoot('/server'),
    password: 'pw',
    engine: { version: '10.11.10', path: '/mariadb', bin: '/mariadb/bin/mariadbd', source: 'Static' },
    dataDirs: { abc_1: '/user/custom data' }
  }
  assert.equal(api.createDraftRequest(draft, 'macOS').instances[0].dataDir, '/user/custom data')
  const changed = api.createDraftRequest(
    { ...draft, mode: 'replication', count: 2, startPort: 14400 },
    'macOS'
  )
  assert.equal(changed.instances[0].dataDir, '/user/custom data')
  assert.equal(changed.instances[1].dataDir, '/server/mariadb-cluster/data/abc/node-2')
  assert.equal(changed.instances[2].port, 14402)
})

test('initial ports advance after existing SQL nodes and keep whole replica groups contiguous', () => {
  const existing = [{ port: 13307 }, { port: 13308 }]
  assert.equal(api.suggestStartPort(existing, 'standalone', 1), 13309)
  assert.equal(api.suggestStartPort(existing, 'replication', 2), 13309)
  assert.equal(api.suggestStartPort([{ port: 13308 }, { port: 13310 }], 'replication', 2), 13311)
})
test('port suggestions remain within TCP limits and fall back when the highest port is already used', () => {
  assert.equal(api.suggestStartPort([], 'standalone', 1), 13307)
  assert.equal(api.suggestStartPort([{ port: 65535 }], 'replication', 9), 13307)
  const all = Array.from({ length: 65535 }, (_, n) => ({ port: n + 1 }))
  assert.equal(api.suggestStartPort(all, 'standalone', 1), undefined)
})
