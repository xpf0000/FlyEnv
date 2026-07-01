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
const commandPath = path.join(repoRoot, 'src', 'render', 'components', 'OpenClaw', 'command.json')
const langRoot = path.join(repoRoot, 'src', 'lang')

const commandData = readJson(commandPath)

const backupCategory = commandData.categories.find(
  (category) => category.nameKey === 'openclaw.category.backup'
)

assert.ok(backupCategory, 'OpenClaw backup category should exist in command.json')
assert.deepEqual(
  Object.fromEntries(backupCategory.commands.map((command) => [command.label, command.descriptionKey])),
  {
    'openclaw backup create': 'openclaw.cmd.backupCreate',
    'openclaw backup verify': 'openclaw.cmd.backupVerify',
    'openclaw update': 'openclaw.cmd.update',
    'openclaw update status': 'openclaw.cmd.updateStatus',
    'openclaw update --dry-run': 'openclaw.cmd.updateDryRun'
  },
  'OpenClaw backup category command descriptions do not match expected i18n keys'
)

const referencedKeys = [
  ...new Set(
    commandData.categories.flatMap((category) => [
      category.nameKey,
      ...category.commands.map((command) => command.descriptionKey)
    ])
  )
]

const locales = fs
  .readdirSync(langRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((locale) => {
    return fs.existsSync(path.join(langRoot, locale, 'common.json')) &&
      fs.existsSync(path.join(langRoot, locale, 'openclaw.json'))
  })

for (const locale of locales) {
  const common = readJson(path.join(langRoot, locale, 'common.json'))
  const openclaw = readJson(path.join(langRoot, locale, 'openclaw.json'))

  for (const keyPath of referencedKeys) {
    assert.equal(
      hasPath({ common, openclaw }, keyPath),
      true,
      `${locale}: expected OpenClaw key ${keyPath} to exist`
    )
  }
}

console.log('openclaw command i18n test passed')
