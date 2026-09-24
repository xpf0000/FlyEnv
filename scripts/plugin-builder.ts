import { build as viteBuild, type Plugin as VitePlugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { build as esbuild } from 'esbuild'
import fs from 'fs-extra'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  validatePluginManifest,
  type FlyEnvPluginCatalog,
  type FlyEnvPluginCatalogItem,
  type FlyEnvPluginManifest
} from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const sevenZip = require('7zip-min-electron') as {
  pack(source: string, target: string, callback: (error?: Error | null) => void): void
}

const HOST_RUNTIME_PACKAGES = [
  'vue',
  'pinia',
  'vue-router',
  'element-plus',
  '@element-plus/icons-vue'
] as const

function validExportName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && name !== 'default'
}

export async function createHostRuntimePlugin(): Promise<VitePlugin> {
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
    '@/core/ASide': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AsideSetup = host?.aside?.AsideSetup\nexport const AppServiceModule = host?.aside?.AppServiceModule`,
    '@/core/Module': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppModuleSetup = host?.coreModule?.AppModuleSetup\nexport const AppModuleTab = host?.coreModule?.AppModuleTab\nexport const AppCustomerModule = host?.coreModule?.AppCustomerModule`,
    '@/store/brew': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const BrewStore = (...args) => host?.stores?.BrewStore?.(...args)`,
    '@/core/VueExtend': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const VueExtend = host?.vueExtend`,
    '@/core/App': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppModules = host?.appModules`,
    '@/core/AppModules': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppModules = host?.appModules`,
    '@/components/ServiceManager/index.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.ServiceManager`,
    '@/components/VersionManager/index.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.VersionManager`,
    '@/components/Conf/index.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.Conf`,
    '@/components/Conf/common.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.ConfCommon`,
    '@/components/Log/index.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.Log`,
    '@/components/Log/tool.vue': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.components?.LogTool`,
    '@lang/index': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppAllLang = host?.lang?.AppAllLang\nexport const BuiltInLocaleCatalog = host?.lang?.BuiltInLocaleCatalog\nexport const FALLBACK_LOCALE = host?.lang?.FALLBACK_LOCALE\nexport const normalizeLocale = host?.lang?.normalizeLocale\nexport const AppI18n = host?.lang?.AppI18n\nexport const I18nT = host?.lang?.I18nT\nexport const applyLanguagePayload = host?.lang?.applyLanguagePayload\nexport const getActiveLocale = host?.lang?.getActiveLocale\nexport const releaseLocalePayload = host?.lang?.releaseLocalePayload`,
    'flyenv:ipc': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.ipc`,
    'flyenv:router': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport default host?.router`,
    'flyenv:app-store': `const host = globalThis.__FLYENV_PLUGIN_HOST__\nexport const AppStore = (...args) => host?.stores?.AppStore?.(...args)`
  }

  // Vite applies resolve.alias before user pre-plugins, so resolveId may receive
  // the raw specifier ('@/store/brew'), the alias-resolved absolute path
  // ('<root>/src/render/store/brew'), or a relative id ('./AppModules') from an
  // already-bundled src file. Normalize all three forms back to the alias
  // specifier before matching bridgeModules.
  const aliasTargets: Array<[string, string]> = [
    ['@', path.resolve(root, 'src/render')],
    ['@shared', path.resolve(root, 'src/shared')],
    ['@lang', path.resolve(root, 'src/lang')]
  ]
  const normalizeBridgeId = (id: string, importer?: string): string => {
    let candidate = id.split('?')[0]
    if (candidate.startsWith('.') && importer) {
      candidate = path.resolve(path.dirname(importer.split('?')[0]), candidate)
    }
    // Vite's string alias does a naive prefix replace, so on Windows the id
    // arrives with mixed separators ('<root>\src\render/core/ASide'). Compare
    // in slash-normalized form or every bridge lookup misses here.
    const slash = (value: string) => value.split(path.sep).join('/')
    const normalized = slash(candidate)
    for (const [alias, target] of aliasTargets) {
      const slashedTarget = slash(target)
      if (normalized === slashedTarget) return alias
      if (normalized.startsWith(slashedTarget + '/')) {
        return alias + normalized.slice(slashedTarget.length)
      }
    }
    return id
  }

  return {
    name: 'flyenv-plugin-host-runtime',
    enforce: 'pre',
    resolveId(id, importer) {
      const bridgeId = bridgeModules[id] ? id : normalizeBridgeId(id, importer)
      if (bridgeModules[bridgeId]) return '\0flyenv-plugin-bridge:' + bridgeId
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

async function updateOfficialRegistry(manifest: FlyEnvPluginManifest, archivePath: string) {
  const registryPath = path.resolve(root, 'plugins/registry.json')
  let registry: FlyEnvPluginCatalog = { schemaVersion: 1, plugins: [] }
  if (await fs.pathExists(registryPath)) {
    registry = await fs.readJson(registryPath)
  }
  if (typeof registry.schemaVersion !== 'number') registry.schemaVersion = 1
  if (!Array.isArray(registry.plugins)) registry.plugins = []

  const sha256 = crypto
    .createHash('sha256')
    .update(await fs.readFile(archivePath))
    .digest('hex')

  const existing = registry.plugins.find((item) => item.id === manifest.id)
  const entry: FlyEnvPluginCatalogItem = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.author ? { author: manifest.author } : {}),
    ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
    ...(manifest.icon ? { icon: manifest.icon } : {}),
    module: manifest.module,
    ...(manifest.module.platform ? { platforms: manifest.module.platform } : {}),
    artifact: {
      // Keep an already-published URL; rebuilding must not clear it. The URL is
      // the only field filled by hand, after the release asset is uploaded.
      url: existing?.artifact?.url ? existing.artifact.url : '',
      sha256
    },
    official: true
  }
  const index = registry.plugins.findIndex((item) => item.id === manifest.id)
  if (index >= 0) {
    registry.plugins[index] = entry
  } else {
    registry.plugins.push(entry)
  }
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n')
  const urlNote = entry.artifact.url
    ? `artifact.url kept: ${entry.artifact.url}`
    : 'artifact.url is empty — fill it in after uploading the release asset.'
  console.log(`Registry updated: plugins/registry.json (${entry.id}@${entry.version}). ${urlNote}`)

  const registryCopy = path.join(path.dirname(archivePath), 'registry.json')
  await fs.copy(registryPath, registryCopy)
  console.log(`Registry copied: ${registryCopy}`)
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
  const pluginDistRoot = path.resolve(root, 'dist/plugins', name)
  const outputRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : path.join(pluginDistRoot, sourceManifest.id)

  if (!options.outputRoot && !options.archivePath) {
    // Default-path build owns the whole per-plugin dist directory: wipe it so
    // stale versioned archives do not accumulate.
    await fs.remove(pluginDistRoot)
  } else {
    await fs.remove(outputRoot)
  }
  await fs.ensureDir(outputRoot)

  const builtManifest = structuredClone(sourceManifest)

  if (sourceManifest.entry.render) {
    const renderEntry = path.resolve(pluginRoot, sourceManifest.entry.render)
    const hostRuntimePlugin = await createHostRuntimePlugin()
    await viteBuild({
      configFile: false,
      root: pluginRoot,
      plugins: [hostRuntimePlugin, vue(), vueJsx({ transformOn: true, mergeProps: true })],
      define: {
        // Library mode does not replace process.env.NODE_ENV, but the artifact
        // is blob-imported into the renderer where `process` does not exist.
        'process.env.NODE_ENV': JSON.stringify(options.minify ? 'production' : 'development'),
        __INTLIFY_PROD_DEVTOOLS__: 'false'
      },
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
    // Runtime require() calls that survive bundling (for example
    // 7zip-min-electron in fork/util/Zip.ts, whose 7za binary must resolve from
    // the app's own node_modules) are anchored at global.Server.Static — the
    // same resolution base the built-in fork bundle has (it is always a
    // sibling of dist/electron/fork.mjs) — instead of the plugin install
    // directory, which has no node_modules. import.meta.url remains the
    // fallback before the server broadcast arrives.
    const forkBanner = [
      "import { createRequire as __flyenvPluginCreateRequire } from 'node:module';",
      "import { pathToFileURL as __flyenvPluginPathToFileURL } from 'node:url';",
      'const __flyenvPluginRequireAnchor = (fallbackUrl) => {',
      '  const anchor = globalThis.Server?.Static;',
      "  return anchor ? __flyenvPluginPathToFileURL(anchor + '/index.js') : fallbackUrl;",
      '};',
      'let __flyenvPluginRequire;',
      'const require = (id) => {',
      '  if (!__flyenvPluginRequire) {',
      '    __flyenvPluginRequire = __flyenvPluginCreateRequire(',
      '      __flyenvPluginRequireAnchor(import.meta.url)',
      '    );',
      '  }',
      '  return __flyenvPluginRequire(id);',
      '};'
    ].join('\n')
    const forkOutput = path.join(outputRoot, 'fork', 'index.mjs')
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
        js: forkBanner
      },
      plugins: [
        {
          name: 'flyenv-plugin-host-lang',
          setup(build) {
            // Fork plugin bundles must share the fork process's live i18n
            // instance (a bundled copy never receives language payloads and is
            // stuck on the fallback locale). The fork process exposes it on
            // `globalThis.__FLYENV_PLUGIN_HOST__.lang` (src/fork/index.ts);
            // rewrite every `@lang/runtime` import to read from that bridge.
            build.onResolve({ filter: /^@lang\/runtime$/ }, () => ({
              path: '@lang/runtime',
              namespace: 'flyenv-plugin-host-lang'
            }))
            build.onLoad({ filter: /.*/, namespace: 'flyenv-plugin-host-lang' }, () => ({
              contents: [
                'const host = globalThis.__FLYENV_PLUGIN_HOST__',
                'export const AppI18n = host?.lang?.AppI18n',
                'export const FALLBACK_LOCALE = host?.lang?.FALLBACK_LOCALE',
                'export const getActiveLocale = host?.lang?.getActiveLocale',
                'export const I18nT = host?.lang?.I18nT'
              ].join('\n'),
              loader: 'js'
            }))
          }
        },
        {
          name: 'flyenv-plugin-require-anchor',
          setup(build) {
            // Fork sources hold their own `createRequire(import.meta.url)`
            // bindings (Zip.ts, DNS, Host, ...). esbuild inlines them into the
            // bundle where the banner's require shim cannot reach, so rewrite
            // the anchor to resolve against the app's node_modules at runtime.
            build.onLoad({ filter: /\.ts$/ }, async (args) => {
              if (!args.path.startsWith(root)) return undefined
              const contents = await fs.readFile(args.path, 'utf8')
              if (!contents.includes('createRequire(import.meta.url)')) return undefined
              return {
                contents: contents.replaceAll(
                  'createRequire(import.meta.url)',
                  'createRequire(__flyenvPluginRequireAnchor(import.meta.url))'
                ),
                loader: 'ts'
              }
            })
          }
        }
      ]
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
      path.join(pluginDistRoot, `${sourceManifest.id}-${sourceManifest.version}.flyenv-plugin`)
    await packPlugin(outputRoot, archivePath)
    console.log(`Plugin package: ${archivePath}`)
    await updateOfficialRegistry(sourceManifest, archivePath)
  }
  console.log(`Plugin built: ${sourceManifest.id} -> ${outputRoot}`)
  return outputRoot
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--all')) {
    const pluginsDir = path.resolve(root, 'plugins')
    const names: string[] = []
    for (const entry of await fs.readdir(pluginsDir)) {
      if (await fs.pathExists(path.join(pluginsDir, entry, 'plugin.json'))) {
        names.push(entry)
      }
    }
    names.sort()
    if (names.length === 0) throw new Error('No plugins found under plugins/')
    const succeeded: string[] = []
    const failed: string[] = []
    for (const name of names) {
      try {
        await buildPlugin(name, { minify: true, archive: true })
        succeeded.push(name)
      } catch (error) {
        failed.push(name)
        console.error(`Plugin build failed: ${name}`, error)
      }
    }
    console.log(`Plugin build summary: ${succeeded.length} succeeded [${succeeded.join(', ')}]`)
    if (failed.length > 0) {
      console.error(`Plugin build summary: ${failed.length} failed [${failed.join(', ')}]`)
      process.exit(1)
    }
  } else {
    const name = args[0]
    if (!name) throw new Error('Usage: yarn plugin:build <plugin-name> | yarn plugin:build --all')
    await buildPlugin(name, { minify: true, archive: true })
  }
}
