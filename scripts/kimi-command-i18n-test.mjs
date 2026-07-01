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
const commandPath = path.join(repoRoot, 'src', 'render', 'components', 'Kimi', 'command.json')
const langRoot = path.join(repoRoot, 'src', 'lang')

const commandData = readJson(commandPath)

const expectedCategories = [
  {
    nameKey: 'common.category.basic',
    commands: {
      'kimi --help': 'common.cli.help',
      'kimi --version': 'common.cli.version',
      'kimi upgrade': 'kimi.cmd.upgrade'
    }
  },
  {
    nameKey: 'common.session.list',
    commands: {
      kimi: 'common.cli.start',
      'kimi --continue': 'kimi.cmd.continue',
      'kimi --session': 'kimi.cmd.sessionSelect',
      'kimi --plan': 'kimi.cmd.plan',
      'kimi --yolo': 'kimi.cmd.yolo',
      'kimi export': 'kimi.cmd.export',
      'kimi vis': 'kimi.cmd.vis'
    }
  },
  {
    nameKey: 'common.category.configuration',
    commands: {
      'kimi provider list': 'kimi.cmd.providerList',
      'kimi provider add': 'kimi.cmd.providerAdd',
      'kimi provider remove': 'kimi.cmd.providerRemove'
    }
  }
]

assert.equal(
  commandData.categories.length,
  expectedCategories.length,
  'Kimi command categories count changed unexpectedly'
)

expectedCategories.forEach((expectedCategory, index) => {
  const actualCategory = commandData.categories[index]
  assert.equal(
    actualCategory.nameKey,
    expectedCategory.nameKey,
    `Category ${index} should use ${expectedCategory.nameKey}`
  )

  const actualCommands = Object.fromEntries(
    actualCategory.commands.map((command) => [command.label, command.descriptionKey])
  )
  assert.deepEqual(
    actualCommands,
    expectedCategory.commands,
    `Category ${expectedCategory.nameKey} command descriptions do not match expected i18n keys`
  )
})

const requiredCommonKeys = [
  'common.category.basic',
  'common.category.configuration',
  'common.session.list',
  'common.cli.help',
  'common.cli.version',
  'common.cli.start'
]

const requiredKimiKeys = [
  'kimi.cmd.upgrade',
  'kimi.cmd.continue',
  'kimi.cmd.sessionSelect',
  'kimi.cmd.plan',
  'kimi.cmd.yolo',
  'kimi.cmd.export',
  'kimi.cmd.vis',
  'kimi.cmd.providerList',
  'kimi.cmd.providerAdd',
  'kimi.cmd.providerRemove'
]

const removedKimiKeys = [
  'kimi.category.basic',
  'kimi.category.session',
  'kimi.category.config',
  'kimi.cmd.help',
  'kimi.cmd.version',
  'kimi.cmd.start'
]

const locales = fs
  .readdirSync(langRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((locale) => {
    return fs.existsSync(path.join(langRoot, locale, 'common.json')) &&
      fs.existsSync(path.join(langRoot, locale, 'kimi.json'))
  })

for (const locale of locales) {
  const common = readJson(path.join(langRoot, locale, 'common.json'))
  const kimi = readJson(path.join(langRoot, locale, 'kimi.json'))

  for (const keyPath of requiredCommonKeys) {
    assert.equal(
      hasPath({ common }, keyPath),
      true,
      `${locale}: expected shared key ${keyPath} to exist`
    )
  }

  for (const keyPath of requiredKimiKeys) {
    assert.equal(
      hasPath({ kimi }, keyPath),
      true,
      `${locale}: expected Kimi key ${keyPath} to exist`
    )
  }

  for (const keyPath of removedKimiKeys) {
    assert.equal(
      hasPath({ kimi }, keyPath),
      false,
      `${locale}: expected deprecated Kimi key ${keyPath} to stay removed`
    )
  }
}

console.log('kimi command i18n test passed')
