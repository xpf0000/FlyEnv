import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const assetRoot = join(root, 'dist/electron/static/lang')
const manifest = JSON.parse(readFileSync(join(assetRoot, 'manifest.json'), 'utf8'))
const runs = 9

const memoryFooter = String.raw`
if (global.gc) global.gc()
await new Promise((resolve) => setTimeout(resolve, 80))
if (global.gc) global.gc()
const memory = process.memoryUsage()
console.log(JSON.stringify({ rss: memory.rss, heapUsed: memory.heapUsed }))
`

const optimizedChildSource =
  String.raw`
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createI18n } from 'vue-i18n'
const assetRoot = process.argv[2]
const locales = JSON.parse(process.argv[3])
const messages = {}
for (const locale of locales) {
  const asset = JSON.parse(readFileSync(join(assetRoot, locale + '.json'), 'utf8'))
  messages[locale] = asset.messages
}
globalThis.__keep = createI18n({
  locale: locales.at(-1),
  fallbackLocale: 'en',
  messages
})
` + memoryFooter

type MemorySample = { rss: number; heapUsed: number }

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const summarize = (samples: MemorySample[]) => ({
  rss: median(samples.map((sample) => sample.rss)),
  heapUsed: median(samples.map((sample) => sample.heapUsed))
})

const measureOptimized = () => {
  const samples: MemorySample[] = []
  for (let index = 0; index < runs; index += 1) {
    const result = spawnSync(
      process.execPath,
      ['--expose-gc', '--input-type=module', '-', assetRoot, JSON.stringify(['en', 'zh'])],
      { cwd: root, input: optimizedChildSource, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    )
    if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    samples.push(JSON.parse(result.stdout.trim()))
  }
  return summarize(samples)
}

const buildEagerFixture = async (outfile: string, locales: string[]) => {
  const imports = locales
    .map((locale, index) => {
      const sourceDirectory = locale === 'zhhant' ? 'zh-hant' : locale
      return `import Locale${index} from './src/lang/${sourceDirectory}/index.ts'`
    })
    .join('\n')
  const spreads = locales.map((_locale, index) => `...Locale${index}`).join(', ')
  const source = `${imports}
import { createI18n } from 'vue-i18n'
const messages = { ${spreads} }
globalThis.__keep = createI18n({ locale: 'zh', fallbackLocale: 'en', messages })
${memoryFooter}`

  await build({
    stdin: { contents: source, resolveDir: root, sourcefile: 'eager-language-runtime.ts' },
    outfile,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'esnext',
    minify: true,
    logLevel: 'silent'
  })
}

const measureEagerBundle = (file: string) => {
  const samples: MemorySample[] = []
  for (let index = 0; index < runs; index += 1) {
    const result = spawnSync(process.execPath, ['--expose-gc', file], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    })
    if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    samples.push(JSON.parse(result.stdout.trim()))
  }
  return summarize(samples)
}

const mib = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100
const benchmarkRoot = await mkdtemp(join(root, '.language-memory-benchmark-'))
const eagerBundle = join(benchmarkRoot, 'eager-language-runtime.mjs')

let result: {
  runs: number
  eagerBundleMiB: number
  optimized: { rssMiB: number; heapUsedMiB: number }
  eagerBundled: { rssMiB: number; heapUsedMiB: number }
  rssSavedMiB: number
  heapSavedMiB: number
}

try {
  const allLocales = Object.keys(manifest.locales).sort()
  await buildEagerFixture(eagerBundle, allLocales)
  const optimized = measureOptimized()
  const eager = measureEagerBundle(eagerBundle)
  result = {
    runs,
    eagerBundleMiB: mib((await stat(eagerBundle)).size),
    optimized: { rssMiB: mib(optimized.rss), heapUsedMiB: mib(optimized.heapUsed) },
    eagerBundled: { rssMiB: mib(eager.rss), heapUsedMiB: mib(eager.heapUsed) },
    rssSavedMiB: mib(eager.rss - optimized.rss),
    heapSavedMiB: mib(eager.heapUsed - optimized.heapUsed)
  }
} finally {
  await rm(benchmarkRoot, { recursive: true, force: true })
}

console.log(JSON.stringify(result, null, 2))
if (result.eagerBundleMiB < 5) throw new Error('Eager comparison bundle is incomplete')
if (result.optimized.rssMiB > 80) throw new Error('Optimized locale RSS exceeded 80 MiB')
if (result.optimized.heapUsedMiB > 9) throw new Error('Optimized locale heap exceeded 9 MiB')
if (result.rssSavedMiB < 15) throw new Error('Locale RSS improvement was below 15 MiB')
if (result.heapSavedMiB < 9) throw new Error('Locale heap improvement was below 9 MiB')
