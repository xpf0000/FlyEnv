import { build as viteBuild } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { build as esbuild } from 'esbuild'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePluginManifest } from '../src/shared/plugin/PluginManifest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

export type BuildPluginOptions = {
  outputRoot?: string
  minify?: boolean
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
    await viteBuild({
      configFile: false,
      root: pluginRoot,
      plugins: [vue(), vueJsx({ transformOn: true, mergeProps: true })],
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
      tsconfig: path.resolve(root, 'tsconfig.json')
    })
    builtManifest.entry.fork = 'fork/index.mjs'
  }

  await fs.writeJson(path.join(outputRoot, 'plugin.json'), builtManifest, { spaces: 2 })
  console.log(`Plugin built: ${sourceManifest.id} -> ${outputRoot}`)
  return outputRoot
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: yarn plugin:build <plugin-name>')
  await buildPlugin(name, { minify: process.env.NODE_ENV === 'production' })
}
