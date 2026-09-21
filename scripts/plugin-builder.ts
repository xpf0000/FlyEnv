import { build as viteBuild, type Plugin as VitePlugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { build as esbuild } from 'esbuild'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  pack(source: string, target: string, callback: (error?: Error | null) => void): void
}

const HOST_RUNTIME_PACKAGES = ['vue', 'pinia', 'vue-router'] as const

function validExportName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && name !== 'default'
}

async function createHostRuntimePlugin(): Promise<VitePlugin> {
  const exportNames = new Map<string, string[]>()
  for (const packageName of HOST_RUNTIME_PACKAGES) {
    const runtime = await import(packageName)
    exportNames.set(packageName, Object.keys(runtime).filter(validExportName))
  }
  const bridgeModules: Record<string, string> = {
    '@/util/IPC': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.ipc`,
    '@/router': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.router`,
    '@/router/index': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.router`,
    '@/store/app': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppStore = (...args) => host?.stores?.AppStore?.(...args)`,
    'flyenv:ipc': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.ipc`,
    'flyenv:router': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.router`,
    'flyenv:app-store': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppStore = (...args) => host?.stores?.AppStore?.(...args)`,
    'flyenv:mailpit': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.Mailpit`,
    'flyenv:mailpit-aside': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.MailpitAside`
  }

  return {
    name: 'flyenv-plugin-host-runtime',
    enforce: 'pre',
    resolveId(id) {
      if (bridgeModules[id]) return '\0flyenv-plugin-bridge:' + id
      if (id.endsWith('json_typegen_wasm_bg.wasm')) {
        return '\0flyenv-plugin-wasm-stub'
      }
      if (HOST_RUNTIME_PACKAGES.includes(id as any)) {
        return '\0flyenv-plugin-host-runtime:' + id
      }
      return undefined
    },
    load(id) {
      if (id === '\0flyenv-plugin-wasm-stub') {
        return 'export default {}; export const memory = new WebAssembly.Memory({ initial: 1 })'
      }
      const bridgePrefix = '\0flyenv-plugin-bridge:'
      if (id.startsWith(bridgePrefix)) {
        return bridgeModules[id.slice(bridgePrefix.length)]
      }
      const prefix = '\0flyenv-plugin-host-runtime:'
      if (!id.startsWith(prefix)) return undefined
      const packageName = id.slice(prefix.length)
      const names = exportNames.get(packageName) ?? []
      const lines = [
        'const runtime = globalThis.__FLYENV_PLUGIN_HOST__?.[' + JSON.stringify(packageName) + ']',
        'if (!runtime) throw new Error(' +
          JSON.stringify('FlyEnv plugin host runtime unavailable: ' + packageName) +
          ')',
        ...names.map((name) => 'export const ' + name + ' = runtime[' + JSON.stringify(name) + ']'),
        'export default runtime'
      ]
      return lines.join('\n')
    }
  }
}

export type BuildPluginOptions = {
  outputRoot?: string
  minify?: boolean
  archive?: boolean
  archivePath?: string
}

export async function packPlugin(outputRoot: string, archivePath: string) {
  await fs.ensureDir(path.dirname(archivePath))
  await new Promise<void>((resolve, reject) => {
    sevenZip.pack(outputRoot, archivePath, (error) => (error ? reject(error) : resolve()))
  })
  return archivePath
}

export async function buildPlugin(name: string, options: BuildPluginOptions = {}) {
  const pluginRoot = path.resolve(root, 'plugins', name)
  const manifestPath = path.join(pluginRoot, 'plugin.json')
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`Plugin not found: ${name}`)
  }

  const sourceManifest = validatePluginManifest(await fs.readJson(manifestPath))
  const outputRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : path.resolve(root, 'dist/plugins', sourceManifest.id)

  await fs.remove(outputRoot)
  await fs.ensureDir(outputRoot)

  const builtManifest = structuredClone(sourceManifest)

  if (sourceManifest.entry.render) {
    const renderEntry = path.resolve(pluginRoot, sourceManifest.entry.render)
    const hostRuntimePlugin = await createHostRuntimePlugin()
    await viteBuild({
      configFile: false,
      root: pluginRoot,
      plugins: [hostRuntimePlugin, vue(), vueJsx({ transformOn: true, mergeProps: true })],
      resolve: {
        alias: {
          '@': path.resolve(root, 'src/render'),
          '@shared': path.resolve(root, 'src/shared'),
          '@lang': path.resolve(root, 'src/lang')
        }
      },
      build: {
        outDir: path.join(outputRoot, 'render'),
        emptyOutDir: true,
        minify: options.minify ?? false,
        cssCodeSplit: false,
        lib: {
          entry: renderEntry,
          formats: ['es'],
          fileName: () => 'index.mjs',
          cssFileName: 'style'
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true
          }
        }
      }
    })
    builtManifest.entry.render = 'render/index.mjs'
  }

  if (sourceManifest.entry.fork) {
    const forkEntry = path.resolve(pluginRoot, sourceManifest.entry.fork)
    // Fork plugins are loaded by Node's dynamic import inside Electron's
    // utility process.  Provide a native require bridge so bundled CommonJS
    // dependencies (for example axios/form-data) work from the ESM artifact.
    const forkOutput = path.join(outputRoot, 'fork/index.mjs')
    await fs.ensureDir(path.dirname(forkOutput))
    await esbuild({
      entryPoints: [forkEntry],
      outfile: forkOutput,
      platform: 'node',
      bundle: true,
      format: 'esm',
      target: 'node18',
      minify: options.minify ?? false,
      tsconfig: path.resolve(root, 'tsconfig.json'),
      alias: {
        '@fork': path.resolve(root, 'src/fork'),
        '@shared': path.resolve(root, 'src/shared'),
        '@lang': path.resolve(root, 'src/lang')
      },
      banner: {
        js: "import { createRequire as __flyenvPluginCreateRequire } from 'node:module'; const require = __flyenvPluginCreateRequire(import.meta.url);"
      }
    })
    builtManifest.entry.fork = 'fork/index.mjs'
  }

  await fs.writeJson(path.join(outputRoot, 'plugin.json'), builtManifest, { spaces: 2 })
  for (const asset of ['assets', 'locales', 'README.md', 'LICENSE']) {
    const source = path.join(pluginRoot, asset)
    if (await fs.pathExists(source)) await fs.copy(source, path.join(outputRoot, asset))
  }
  if (options.archive) {
    const archivePath =
      options.archivePath ??
      path.resolve(
        root,
        'dist/plugins',
        `${sourceManifest.id}-${sourceManifest.version}.flyenv-plugin`
      )
    await packPlugin(outputRoot, archivePath)
    console.log(`Plugin package: ${archivePath}`)
  }
  console.log(`Plugin built: ${sourceManifest.id} -> ${outputRoot}`)
  return outputRoot
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: yarn plugin:build <plugin-name>')
  await buildPlugin(name, { minify: process.env.NODE_ENV === 'production', archive: true })
}
