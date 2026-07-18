import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildLanguageAssets } from './build-language-assets'

const root = await mkdtemp(join(tmpdir(), 'flyenv-language-assets-'))
const sourceRoot = join(root, 'source')
const outputRoot = join(root, 'output')

const writeLocale = async (directory: string, baseValue: string) => {
  const localeRoot = join(sourceRoot, directory)
  await mkdir(localeRoot, { recursive: true })
  await writeFile(join(localeRoot, 'base.json'), JSON.stringify({ title: baseValue }))
  await writeFile(join(localeRoot, 'menu.json'), JSON.stringify({ exit: `${baseValue}-exit` }))
}

try {
  await writeLocale('en', 'English')
  await writeLocale('zh', '中文')
  await writeLocale('zh-hant', '繁體中文')

  const result = await buildLanguageAssets({
    sourceRoot,
    outputRoot,
    catalog: {
      en: { label: 'English', sourceDir: 'en' },
      zh: { label: '中文-简体', sourceDir: 'zh' },
      zhhant: { label: '中文-繁体', sourceDir: 'zh-hant' }
    }
  })

  assert.deepEqual(result.locales, ['en', 'zh', 'zhhant'])

  const manifest = JSON.parse(await readFile(join(outputRoot, 'manifest.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.fallbackLocale, 'en')
  assert.equal(manifest.locales.zhhant.file, 'zhhant.json')

  const chinese = JSON.parse(await readFile(join(outputRoot, 'zh.json'), 'utf8'))
  assert.deepEqual(chinese, {
    schemaVersion: 1,
    locale: 'zh',
    messages: {
      base: { title: '中文' },
      menu: { exit: '中文-exit' }
    }
  })

  await assert.rejects(
    () =>
      buildLanguageAssets({
        sourceRoot,
        outputRoot: join(root, 'missing-fallback'),
        catalog: { zh: { label: '中文-简体', sourceDir: 'zh' } }
      }),
    /English fallback locale is required/
  )

  await writeFile(join(sourceRoot, 'zh', 'broken.json'), '{')
  await assert.rejects(
    () =>
      buildLanguageAssets({
        sourceRoot,
        outputRoot: join(root, 'broken-output'),
        catalog: {
          en: { label: 'English', sourceDir: 'en' },
          zh: { label: '中文-简体', sourceDir: 'zh' }
        }
      }),
    /Invalid locale JSON/
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('language asset tests passed')
