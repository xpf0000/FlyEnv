import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LanguageRepository } from '../src/main/core/LanguageRepository'

const root = await mkdtemp(join(tmpdir(), 'flyenv-language-repository-'))
const builtInRoot = join(root, 'built-in')
const customRoot = join(root, 'custom')
await mkdir(builtInRoot, { recursive: true })
await mkdir(join(customRoot, 'pirate'), { recursive: true })

const manifest = {
  schemaVersion: 1,
  fallbackLocale: 'en',
  locales: {
    en: { file: 'en.json', label: 'English' },
    zh: { file: 'zh.json', label: '中文-简体' }
  }
}
await writeFile(join(builtInRoot, 'manifest.json'), JSON.stringify(manifest))
await writeFile(
  join(builtInRoot, 'en.json'),
  JSON.stringify({ schemaVersion: 1, locale: 'en', messages: { base: { title: 'English' } } })
)
await writeFile(
  join(builtInRoot, 'zh.json'),
  JSON.stringify({ schemaVersion: 1, locale: 'zh', messages: { base: { title: '中文' } } })
)
await writeFile(
  join(customRoot, 'pirate', 'index.json'),
  JSON.stringify({ lang: 'pirate', label: 'Pirate' })
)
await writeFile(join(customRoot, 'pirate', 'base.json'), JSON.stringify({ title: 'Ahoy' }))

let readCount = 0
const repository = new LanguageRepository({
  builtInRoot,
  customRoot,
  onRead: () => {
    readCount += 1
  }
})

try {
  await repository.ready()
  assert.deepEqual(repository.listBuiltIn(), [
    { locale: 'en', label: 'English' },
    { locale: 'zh', label: '中文-简体' }
  ])

  await repository.load('en')
  const beforeConcurrent = readCount
  const first = repository.load('zh')
  const second = repository.load('zh')
  assert.strictEqual(await first, await second)
  assert.equal(readCount - beforeConcurrent, 1)

  assert.deepEqual((await repository.load('pirate')).messages, {
    base: { title: 'Ahoy' }
  })
  assert.deepEqual(await repository.listCustom(), [{ locale: 'pirate', label: 'Pirate' }])

  const templateDirectory = await repository.initializeCustomTemplate('en')
  assert.equal(templateDirectory, join(customRoot, 'en'))
  assert.deepEqual(await repository.listCustom(), [{ locale: 'pirate', label: 'Pirate' }])
  await writeFile(join(customRoot, 'pirate', 'base.json'), JSON.stringify({ title: 'Ahoy again' }))
  repository.invalidate('pirate')
  assert.deepEqual((await repository.load('pirate')).messages, {
    base: { title: 'Ahoy again' }
  })

  await assert.rejects(() => repository.load('../en'), /Unsupported or unsafe locale/)
  await assert.rejects(() => repository.load('missing'), /Unsupported or unsafe locale/)

  repository.retain('zh')
  assert.deepEqual(repository.cachedLocales(), ['en', 'zh'])
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('language repository tests passed')
