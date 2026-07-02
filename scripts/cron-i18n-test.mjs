import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function hasPath(obj, keyPath) {
  return keyPath.split('.').every((key) => ((obj = obj?.[key]), obj !== undefined))
}

const repoRoot = process.cwd()
const langRoot = path.join(repoRoot, 'src', 'lang')
const dialogAddPath = path.join(repoRoot, 'src', 'render', 'components', 'Cron', 'DialogAdd.vue')
const scheduleHelperPath = path.join(
  repoRoot,
  'src',
  'render',
  'components',
  'Cron',
  'ScheduleHelper.vue'
)

const dialogAddSource = fs.readFileSync(dialogAddPath, 'utf8')
const scheduleHelperSource = fs.readFileSync(scheduleHelperPath, 'utf8')

for (const [fileName, source] of [
  ['DialogAdd.vue', dialogAddSource],
  ['ScheduleHelper.vue', scheduleHelperSource]
]) {
  assert.match(
    source,
    /labelKey:\s*'common\.schedule\.everyMinute'/,
    `${fileName} should reuse common.schedule.everyMinute for the every-minute preset`
  )
  assert.match(
    source,
    /labelKey:\s*'common\.schedule\.everyHour'/,
    `${fileName} should reuse common.schedule.everyHour for the every-hour preset`
  )
  assert.doesNotMatch(
    source,
    /labelKey:\s*'cron\.presetEveryMinute'/,
    `${fileName} should not reference cron.presetEveryMinute`
  )
  assert.doesNotMatch(
    source,
    /labelKey:\s*'cron\.presetEveryHour'/,
    `${fileName} should not reference cron.presetEveryHour`
  )
}

const referencedKeys = [
  ...new Set(
    [dialogAddSource, scheduleHelperSource]
      .flatMap((source) => [...source.matchAll(/'(base|common|cron)\.[^']+'/g)])
      .map((match) => match[0].slice(1, -1))
  )
]

const locales = fs
  .readdirSync(langRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((locale) => {
    return ['base.json', 'common.json', 'cron.json'].every((fileName) =>
      fs.existsSync(path.join(langRoot, locale, fileName))
    )
  })

for (const locale of locales) {
  const base = readJson(path.join(langRoot, locale, 'base.json'))
  const common = readJson(path.join(langRoot, locale, 'common.json'))
  const cron = readJson(path.join(langRoot, locale, 'cron.json'))

  for (const keyPath of referencedKeys) {
    assert.equal(
      hasPath({ base, common, cron }, keyPath),
      true,
      `${locale}: expected Cron UI key ${keyPath} to exist`
    )
  }
}

console.log('cron i18n test passed')
