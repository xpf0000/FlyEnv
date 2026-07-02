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
const commandPath = path.join(repoRoot, 'src', 'render', 'components', 'Antigravity', 'command.json')
const langRoot = path.join(repoRoot, 'src', 'lang')

const commandData = readJson(commandPath)

const expectedCategories = [
  {
    nameKey: 'common.category.basic',
    commands: {
      'agy --help': 'common.cli.help',
      'agy --version': 'common.cli.version',
      'agy update': 'antigravity.cmd.update',
      'agy models': 'antigravity.cmd.models'
    }
  },
  {
    nameKey: 'common.session.list',
    commands: {
      agy: 'common.cli.start',
      'agy --continue': 'antigravity.cmd.continue',
      'agy --conversation': 'antigravity.cmd.resume',
      'agy -p': 'antigravity.cmd.prompt'
    }
  },
  {
    nameKey: 'common.category.configuration',
    commands: {
      'agy plugin list': 'antigravity.cmd.pluginList',
      'agy plugin import': 'antigravity.cmd.pluginImport',
      'agy install': 'antigravity.cmd.install'
    }
  }
]

assert.equal(
  commandData.categories.length,
  expectedCategories.length,
  'Antigravity command categories count changed unexpectedly'
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

const requiredAntigravityKeys = [
  'antigravity.cmd.update',
  'antigravity.cmd.models',
  'antigravity.cmd.continue',
  'antigravity.cmd.resume',
  'antigravity.cmd.prompt',
  'antigravity.cmd.pluginList',
  'antigravity.cmd.pluginImport',
  'antigravity.cmd.install'
]

const removedAntigravityKeys = [
  'antigravity.category.basic',
  'antigravity.category.session',
  'antigravity.category.config',
  'antigravity.cmd.help',
  'antigravity.cmd.version',
  'antigravity.cmd.start'
]

const locales = fs
  .readdirSync(langRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((locale) => {
    return fs.existsSync(path.join(langRoot, locale, 'common.json')) &&
      fs.existsSync(path.join(langRoot, locale, 'antigravity.json'))
  })

for (const locale of locales) {
  const common = readJson(path.join(langRoot, locale, 'common.json'))
  const antigravity = readJson(path.join(langRoot, locale, 'antigravity.json'))

  for (const keyPath of requiredCommonKeys) {
    assert.equal(
      hasPath({ common }, keyPath),
      true,
      `${locale}: expected shared key ${keyPath} to exist`
    )
  }

  for (const keyPath of requiredAntigravityKeys) {
    assert.equal(
      hasPath({ antigravity }, keyPath),
      true,
      `${locale}: expected Antigravity key ${keyPath} to exist`
    )
  }

  for (const keyPath of removedAntigravityKeys) {
    assert.equal(
      hasPath({ antigravity }, keyPath),
      false,
      `${locale}: expected deprecated Antigravity key ${keyPath} to stay removed`
    )
  }
}

console.log('antigravity command i18n test passed')
