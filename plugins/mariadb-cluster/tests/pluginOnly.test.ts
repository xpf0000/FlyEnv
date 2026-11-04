import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const local = await import('../render/services').catch(() => ({}) as any)
test('local lifecycle entries keep stable identities without populating the host installed collection', () => {
  const host = { installed: [], isOnlyRunOne: false, onItemStart: async () => host }
  let created = 0
  const entries = new local.InstanceServices(
    () => host,
    (row: any) => {
      created++
      return { ...row }
    }
  )
  const a = { bin: '/mc/a/my.cnf', path: '/mc/a', version: '10.11.10' }
  entries.sync([a])
  const first = entries.item(a.bin)
  first.run = true
  entries.sync([{ ...a }])
  assert.equal(entries.item(a.bin), first)
  assert.equal(first.run, true)
  assert.equal(created, 1)
  assert.equal(host.installed.length, 0)
})
test('plugin correction leaves every host runtime source unchanged from the original host', () => {
  const changed = execFileSync('git', ['diff', '619d7c8d', '--name-only', '--', 'src', 'scripts'], {
    encoding: 'utf8'
  }).trim()
  assert.equal(changed, '')
})
test('entry views and metadata do not request the paired-host hooks', async () => {
  for (const file of ['Index.vue', 'Module.ts', 'manager.ts', 'Services.vue', 'Versions.vue']) {
    const source = await readFile(new URL('../render/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(
      source,
      /persistCurrentVersion|hostUpdateRequired|show-service-controls|@\/components\/(?:ServiceManager|VersionManager)\/index\.vue/
    )
  }
})

test('Fork exposes instance descriptors only through the plugin query, never host installation scans', async () => {
  const { MariadbClusterModule } = await import('../fork/index')
  const module = new MariadbClusterModule()
  Object.defineProperty(module, 'catalog', {
    value: { read: async () => ({ instances: [{ id: 'a' }] }) }
  })
  Object.defineProperty(module, 'runtime', {
    value: { descriptor: (item: any) => ({ bin: '/a/my.cnf', id: item.id }) }
  })
  assert.deepEqual(await module.allInstalledVersions(), [])
  assert.deepEqual(await module.instanceDescriptors(), [{ bin: '/a/my.cnf', id: 'a' }])
})
test('plugin entry views delegate operation ownership to module singletons', async () => {
  const { readdir } = await import('node:fs/promises')
  const root = new URL('../render/', import.meta.url)
  for (const name of (await readdir(root)).filter((name) => name.endsWith('.vue'))) {
    const source = await readFile(new URL(name, root), 'utf8')
    assert.doesNotMatch(
      source,
      /\b(?:IPC\.send|forkTerminalRequest\(|Storage(?:Get|Set)Async\(|Message(?:Error|Success)\()/,
      name
    )
  }
})
