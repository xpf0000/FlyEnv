import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PluginManager from '../../src/main/plugins/PluginManager'

const manifest = {
  apiVersion: 1,
  id: 'dev-fixture',
  name: 'Dev Fixture',
  version: '0.0.1',
  description: 'dev-mode regression fixture',
  author: 'FlyEnv',
  module: {
    typeFlag: 'dev-fixture',
    moduleType: 'other',
    label: 'Dev Fixture',
    asideIndex: 999,
    isService: false,
    isTray: false,
    platform: ['Windows', 'macOS', 'Linux']
  },
  entry: {
    render: 'render/index.mjs',
    fork: 'fork/index.mjs'
  }
}

/**
 * Layout mirroring the real shared data directory: installed-plugin records
 * carry install tokens and the secret is safeStorage-encrypted by a different
 * build identity (production FlyEnv.app vs the unsigned dev Electron), so
 * THIS instance cannot decrypt it.
 */
async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-plugin-manager-'))
  const pluginsRoot = join(root, 'plugins')
  await mkdir(pluginsRoot, { recursive: true })
  await writeFile(
    join(root, 'plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        kafka: { enabled: true, activeVersion: '0.1.4', installToken: 'stale-token' }
      }
    })
  )
  await writeFile(join(root, '.plugin-install-secret'), 'enc:undecryptable-by-this-instance')
  const dev = join(root, 'dev-plugin')
  await mkdir(join(dev, 'render'), { recursive: true })
  await mkdir(join(dev, 'fork'), { recursive: true })
  await writeFile(join(dev, 'plugin.json'), JSON.stringify(manifest))
  await writeFile(join(dev, 'render', 'index.mjs'), 'export default {}\n')
  await writeFile(join(dev, 'fork', 'index.mjs'), 'export default {}\n')
  return { pluginsRoot, statePath: join(root, 'plugins.json'), dev }
}

test('development mode does not require the install secret', async () => {
  const fixture = await makeFixture()
  process.env.FLYENV_PLUGIN_PATH = fixture.dev
  try {
    const manager = new PluginManager({
      pluginsRoot: fixture.pluginsRoot,
      statePath: fixture.statePath,
      licenseCheck: () => false
    })
    await manager.refresh()
    const rendererPlugins = await manager.getRendererPlugins()
    assert.equal(rendererPlugins.length, 1)
    assert.equal(rendererPlugins[0].id, 'dev-fixture')
  } finally {
    delete process.env.FLYENV_PLUGIN_PATH
  }
})

test('installed mode still fails closed when the install secret cannot be decrypted', async () => {
  const fixture = await makeFixture()
  delete process.env.FLYENV_PLUGIN_PATH
  const manager = new PluginManager({
    pluginsRoot: fixture.pluginsRoot,
    statePath: fixture.statePath,
    licenseCheck: () => false
  })
  await assert.rejects(manager.refresh(), /install secret/i)
})
