import path from 'node:path'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from './plugin-builder'
import type { FlyEnvPluginCatalog } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const DEFAULT_BASE_URL = 'https://oss.macphpstudy.com/plugins/'

type ReleaseEntry = {
  folder: string
  id: string
  version: string
  archive: string
}

const archiveFileName = (id: string, version: string) => `${id}-${version}.flyenv-plugin`

async function collectPluginFolders(only?: string[]): Promise<string[]> {
  const pluginsDir = path.resolve(root, 'plugins')
  const names: string[] = []
  for (const entry of await fs.readdir(pluginsDir)) {
    if (await fs.pathExists(path.join(pluginsDir, entry, 'plugin.json'))) {
      names.push(entry)
    }
  }
  names.sort()
  if (!only?.length) return names
  return only.map((name) => {
    if (!names.includes(name)) throw new Error(`Plugin not found: ${name}`)
    return name
  })
}

async function main() {
  const args = process.argv.slice(2)
  const baseUrlArg = args.find((a) => a.startsWith('--base-url='))?.slice('--base-url='.length)
  const baseUrl = (baseUrlArg || DEFAULT_BASE_URL).replace(/\/?$/, '/')
  const all = args.includes('--all')
  const names = args.filter((a) => !a.startsWith('--'))

  if (!all && names.length === 0) {
    throw new Error(
      'Usage: yarn plugin:release <plugin-name> [...more] [--base-url=URL]\n' +
        '       yarn plugin:release --all [--base-url=URL]'
    )
  }

  const folders = await collectPluginFolders(all ? undefined : names)
  const releaseRoot = path.resolve(root, 'dist/plugins-release')

  // A full release rebuilds the upload directory from scratch; a partial
  // release updates it in place so previously released archives stay.
  if (all) {
    await fs.remove(releaseRoot)
  }
  await fs.ensureDir(releaseRoot)

  const released: ReleaseEntry[] = []
  const failed: string[] = []
  for (const folder of folders) {
    try {
      await buildPlugin(folder, { minify: true, archive: true })
      const manifest = await fs.readJson(path.resolve(root, 'plugins', folder, 'plugin.json'))
      const archive = path.resolve(
        root,
        'dist/plugins',
        folder,
        archiveFileName(manifest.id, manifest.version)
      )
      if (!(await fs.pathExists(archive))) {
        throw new Error(`Archive missing after build: ${archive}`)
      }
      released.push({ folder, id: manifest.id, version: manifest.version, archive })
    } catch (error) {
      failed.push(folder)
      console.error(`Plugin release build failed: ${folder}`, error)
    }
  }
  if (released.length === 0) {
    throw new Error('No plugin was built successfully; release directory left untouched.')
  }

  // Copy fresh archives in and drop stale versions of the same plugin id.
  for (const item of released) {
    const fileName = archiveFileName(item.id, item.version)
    for (const existing of await fs.readdir(releaseRoot)) {
      if (existing.startsWith(`${item.id}-`) && existing.endsWith('.flyenv-plugin')) {
        await fs.remove(path.join(releaseRoot, existing))
      }
    }
    await fs.copy(item.archive, path.join(releaseRoot, fileName))
  }

  // Generate the upload-ready registry from the repo registry: archives present
  // in the release directory get `baseUrl + filename`; entries published earlier
  // keep their URL (their files already live on OSS); entries never published
  // and not built now are dropped with a warning.
  const registryPath = path.resolve(root, 'plugins/registry.json')
  const registry: FlyEnvPluginCatalog = (await fs.pathExists(registryPath))
    ? await fs.readJson(registryPath)
    : { schemaVersion: 1, plugins: [] }
  const archives = new Set(
    (await fs.readdir(releaseRoot)).filter((f) => f.endsWith('.flyenv-plugin'))
  )
  const plugins = registry.plugins.flatMap((entry) => {
    const fileName = archiveFileName(entry.id, entry.version)
    if (archives.has(fileName)) {
      return [{ ...entry, artifact: { ...entry.artifact, url: `${baseUrl}${fileName}` } }]
    }
    if (entry.artifact?.url) return [entry]
    console.warn(`[release] dropping unpublished entry without archive: ${entry.id}`)
    return []
  })
  const releaseRegistry: FlyEnvPluginCatalog = { schemaVersion: 1, plugins }
  await fs.writeFile(
    path.join(releaseRoot, 'registry.json'),
    JSON.stringify(releaseRegistry, null, 2) + '\n'
  )

  const files = await fs.readdir(releaseRoot)
  console.log(`\nRelease directory (upload as-is to ${baseUrl}):`)
  console.log(`  ${releaseRoot}`)
  for (const file of files.sort()) console.log(`  - ${file}`)
  if (failed.length > 0) {
    console.error(`\nPlugin release summary: ${failed.length} failed [${failed.join(', ')}]`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
