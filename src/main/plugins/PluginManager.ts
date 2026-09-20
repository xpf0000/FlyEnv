import { promises as fs } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { validatePluginManifest, type FlyEnvPluginManifest } from '@shared/plugin/PluginManifest'

export type FlyEnvPluginRecord = {
  manifest: FlyEnvPluginManifest
  rootPath: string
  renderEntry?: string
  forkEntry?: string
  development: boolean
}

export type ForkPluginSnapshot = Record<
  string,
  {
    id: string
    version: string
    module: string
    entry: string
  }
>

function resolveEntry(rootPath: string, entry?: string) {
  if (!entry) return undefined
  const target = resolve(rootPath, entry)
  const rel = relative(rootPath, target)
  if (rel.startsWith('..') || resolve(rootPath, rel) !== target) {
    throw new Error(`Plugin entry escapes plugin directory: ${entry}`)
  }
  return target
}

async function isDirectory(path: string) {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

export class PluginManager {
  private plugins = new Map<string, FlyEnvPluginRecord>()
  private moduleToPlugin = new Map<string, FlyEnvPluginRecord>()

  get pluginsRoot() {
    return join(dirname(global.Server.BaseDir!), 'plugins')
  }

  async refresh() {
    const records: FlyEnvPluginRecord[] = []
    const developmentPath = process.env.FLYENV_PLUGIN_PATH

    if (developmentPath) {
      records.push(await this.loadPlugin(resolve(developmentPath), true))
    } else {
      await fs.mkdir(this.pluginsRoot, { recursive: true })
      const entries = await fs.readdir(this.pluginsRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const rootPath = join(this.pluginsRoot, entry.name)
        try {
          records.push(await this.loadPlugin(rootPath, false))
        } catch (error) {
          console.warn('[PluginManager] ignore invalid plugin', rootPath, error)
        }
      }
    }

    this.plugins.clear()
    this.moduleToPlugin.clear()

    for (const record of records) {
      const moduleId = record.manifest.module.typeFlag
      if (this.plugins.has(record.manifest.id)) {
        throw new Error(`Duplicate plugin id: ${record.manifest.id}`)
      }
      if (this.moduleToPlugin.has(moduleId)) {
        throw new Error(`Duplicate plugin module: ${moduleId}`)
      }
      this.plugins.set(record.manifest.id, record)
      this.moduleToPlugin.set(moduleId, record)
    }

    return this.list()
  }

  list() {
    return [...this.plugins.values()].map((item) => ({
      id: item.manifest.id,
      name: item.manifest.name,
      version: item.manifest.version,
      description: item.manifest.description,
      author: item.manifest.author,
      module: item.manifest.module,
      development: item.development
    }))
  }

  getForkSnapshot(): ForkPluginSnapshot {
    const result: ForkPluginSnapshot = {}
    for (const record of this.plugins.values()) {
      if (!record.forkEntry) continue
      result[record.manifest.module.typeFlag] = {
        id: record.manifest.id,
        version: record.manifest.version,
        module: record.manifest.module.typeFlag,
        entry: record.forkEntry
      }
    }
    return result
  }

  async getRendererPlugins() {
    const result: Array<{
      id: string
      version: string
      module: FlyEnvPluginManifest['module']
      code: string
      css?: string
    }> = []

    for (const record of this.plugins.values()) {
      if (!record.renderEntry) continue
      const code = await fs.readFile(record.renderEntry, 'utf8')
      const cssPath = join(dirname(record.renderEntry), 'style.css')
      let css: string | undefined
      try {
        css = await fs.readFile(cssPath, 'utf8')
      } catch {}
      result.push({
        id: record.manifest.id,
        version: record.manifest.version,
        module: record.manifest.module,
        code,
        css
      })
    }
    return result
  }

  private async loadPlugin(rootPath: string, development: boolean): Promise<FlyEnvPluginRecord> {
    if (!(await isDirectory(rootPath))) {
      throw new Error(`Plugin directory not found: ${rootPath}`)
    }
    const manifestPath = join(rootPath, 'plugin.json')
    const manifest = validatePluginManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8')))
    return {
      manifest,
      rootPath,
      renderEntry: resolveEntry(rootPath, manifest.entry.render),
      forkEntry: resolveEntry(rootPath, manifest.entry.fork),
      development
    }
  }
}

export default PluginManager
