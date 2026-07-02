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
const commandPath = path.join(repoRoot, 'src', 'render', 'components', 'Codex', 'command.json')
const langRoot = path.join(repoRoot, 'src', 'lang')

const commandData = readJson(commandPath)

const expectedCategories = [
  {
    nameKey: 'common.category.basic',
    commands: {
      'codex --help': 'common.cli.help',
      'codex --version': 'common.cli.version',
      'codex update': 'codex.cmd.update',
      'codex doctor': 'common.cli.doctor'
    }
  },
  {
    nameKey: 'common.session.list',
    commands: {
      codex: 'common.cli.start',
      'codex resume --last': 'codex.cmd.continue',
      'codex resume': 'codex.cmd.resume',
      'codex exec': 'codex.cmd.exec',
      'codex review': 'codex.cmd.review'
    }
  },
  {
    nameKey: 'common.category.configuration',
    commands: {
      'codex mcp list': 'common.cli.mcpList',
      'codex plugin list': 'codex.cmd.pluginList',
      'codex login': 'codex.cmd.login'
    }
  }
]

assert.equal(
  commandData.categories.length,
  expectedCategories.length,
  'Codex command categories count changed unexpectedly'
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
  'common.cli.start',
  'common.cli.mcpList',
  'common.cli.doctor'
]

const requiredCodexKeys = [
  'codex.cmd.update',
  'codex.cmd.continue',
  'codex.cmd.resume',
  'codex.cmd.exec',
  'codex.cmd.review',
  'codex.cmd.pluginList',
  'codex.cmd.login'
]

const removedCodexKeys = [
  'codex.category.basic',
  'codex.category.session',
  'codex.category.config',
  'codex.cmd.help',
  'codex.cmd.version',
  'codex.cmd.start',
  'codex.cmd.mcpList',
  'codex.cmd.doctor'
]

const locales = fs
  .readdirSync(langRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((locale) => {
    return fs.existsSync(path.join(langRoot, locale, 'common.json')) &&
      fs.existsSync(path.join(langRoot, locale, 'codex.json'))
  })

for (const locale of locales) {
  const common = readJson(path.join(langRoot, locale, 'common.json'))
  const codex = readJson(path.join(langRoot, locale, 'codex.json'))

  for (const keyPath of requiredCommonKeys) {
    assert.equal(
      hasPath({ common }, keyPath),
      true,
      `${locale}: expected shared key ${keyPath} to exist`
    )
  }

  for (const keyPath of requiredCodexKeys) {
    assert.equal(
      hasPath({ codex }, keyPath),
      true,
      `${locale}: expected Codex key ${keyPath} to exist`
    )
  }

  for (const keyPath of removedCodexKeys) {
    assert.equal(
      hasPath({ codex }, keyPath),
      false,
      `${locale}: expected deprecated Codex key ${keyPath} to stay removed`
    )
  }
}

console.log('codex command i18n test passed')
