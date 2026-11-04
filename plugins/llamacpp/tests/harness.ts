import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
export const pluginRoot = fileURLToPath(new URL('../', import.meta.url))
export const loadBundle = async (entry: string, sources: Record<string, string>, sfc = false) => {
  const dir = await mkdtemp(join(pluginRoot, 'tests/.bundle-'))
  try {
    const out = join(dir, 'bundle.mjs')
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile: out,
      plugins: [
        {
          name: 'test-boundaries',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) => {
              const key = Object.keys(sources).find(
                (k) => k === a.path || (k.startsWith('/') && resolve(a.resolveDir, a.path) === k)
              )
              return key ? { path: key, namespace: 'boundary' } : undefined
            })
            b.onLoad({ filter: /.*/, namespace: 'boundary' }, (a) => ({
              contents: sources[a.path],
              loader: 'ts',
              resolveDir: pluginRoot
            }))
            if (sfc)
              b.onLoad({ filter: /\.vue$/ }, async (a) => {
                const source = await readFile(a.path, 'utf8')
                const { descriptor } = parse(source, { filename: a.path })
                return {
                  contents: compileScript(descriptor, { id: a.path, inlineTemplate: true }).content,
                  loader: 'ts',
                  resolveDir: resolve(a.path, '..')
                }
              })
          }
        }
      ]
    })
    const value = await import(pathToFileURL(out).href)
    return value
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
