import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = ['zh', 'en']

const expectedCommonKeys = [
  'common.skills.openSkillsDir',
  'common.skills.openSkillDir',
  'common.skills.revealSkillFile',
  'common.skills.noSkills',
  'common.skills.skillFileMissing',
  'common.skills.skillLoadFailed',
  'common.cli.help',
  'common.cli.version',
  'common.cli.mcpList'
]

const removedModuleKeys = [
  'antigravity.openSkillsDir',
  'copilot-cli.openSkillsDir',
  'hermes.openSkillsDir',
  'antigravity.openSkillDir',
  'copilot-cli.openSkillDir',
  'antigravity.revealSkillFile',
  'copilot-cli.revealSkillFile',
  'antigravity.noSkills',
  'copilot-cli.noSkills',
  'antigravity.skillFileMissing',
  'copilot-cli.skillFileMissing',
  'antigravity.skillLoadFailed',
  'copilot-cli.skillLoadFailed',
  'claude-code.cmd.help',
  'copilot-cli.cmd.help',
  'hermes.cmd.help',
  'opencode.cmd.help',
  'openclaw.cmd.help',
  'claude-code.cmd.version',
  'copilot-cli.cmd.version',
  'hermes.cmd.version',
  'opencode.cmd.version',
  'openclaw.cmd.version',
  'claude-code.cmd.mcpList',
  'copilot-cli.cmd.mcpList',
  'hermes.cmd.mcpList'
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function hasPath(obj, keyPath) {
  return keyPath.split('.').every((key) => ((obj = obj?.[key]), obj !== undefined))
}

for (const locale of locales) {
  const localeDir = path.join(root, locale)

  const common = readJson(path.join(localeDir, 'common.json'))
  for (const keyPath of expectedCommonKeys) {
    assert.equal(
      hasPath({ common }, keyPath),
      true,
      `${locale}: expected canonical key ${keyPath} to exist`
    )
  }

  for (const keyPath of removedModuleKeys) {
    const [fileName, ...rest] = keyPath.split('.')
    const filePath = path.join(localeDir, `${fileName}.json`)
    const json = readJson(filePath)
    assert.equal(
      hasPath(json, rest.join('.')),
      false,
      `${locale}: expected duplicate key ${keyPath} to be removed`
    )
  }
}

console.log('i18n global dedup test passed')
