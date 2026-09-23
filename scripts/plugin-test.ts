import assert from 'node:assert/strict'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPlugin } from './plugin-builder'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

// import.meta.url pathname is '/E:/...' on Windows; fileURLToPath handles the drive letter.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = process.argv[2]

if (!name) throw new Error('Usage: yarn plugin:test <plugin-name>')

const tempRoot = await fs.mkdtemp(path.join(root, 'tmp/plugin-test-'))

try {
  const outputRoot = path.join(tempRoot, 'package')
  await buildPlugin(name, { outputRoot, minify: false })

  const manifest = validatePluginManifest(await fs.readJson(path.join(outputRoot, 'plugin.json')))
  assert.ok(manifest.entry.render || manifest.entry.fork, 'plugin must expose an entry')

  for (const entry of [manifest.entry.render, manifest.entry.fork]) {
    if (entry) {
      assert.equal(path.isAbsolute(entry), false, `entry must be relative: ${entry}`)
      assert.equal(
        await fs.pathExists(path.join(outputRoot, entry)),
        true,
        `missing entry: ${entry}`
      )
    }
  }

  if (manifest.entry.fork) {
    ;(globalThis as any).Server = {
      BaseDir: tempRoot,
      Static: path.join(root, 'static'),
      Cache: tempRoot,
      AppDir: tempRoot,
      BrewCellar: tempRoot
    }
    const fork = await import(pathToFileURL(path.join(outputRoot, manifest.entry.fork)).href)
    const module = fork.default
    assert.equal(typeof module?.exec, 'function', 'fork default export must expose exec()')
    assert.equal(typeof module?._startServer, 'function', 'fork must expose _startServer()')
    assert.equal(typeof module?.stopService, 'function', 'fork must expose stopService()')
  }

  console.log(`plugin contract passed: ${manifest.id}@${manifest.version}`)
} finally {
  await fs.remove(tempRoot)
}
