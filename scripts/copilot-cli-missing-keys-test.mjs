import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const langRoot = path.join(process.cwd(), 'src', 'lang')
const requiredKeys = [
  'skills.openSkillsDir',
  'skills.openSkillDir',
  'skills.revealSkillFile',
  'skills.skillFileMissing',
  'skills.skillLoadFailed'
]

const missingByLocale = new Map()
const duplicateByLocale = new Map()

function hasPath(obj, keyPath) {
  return keyPath.split('.').every((key) => ((obj = obj?.[key]), obj !== undefined))
}

for (const locale of fs.readdirSync(langRoot)) {
  const localeDir = path.join(langRoot, locale)
  if (!fs.statSync(localeDir).isDirectory()) {
    continue
  }

  const commonPath = path.join(localeDir, 'common.json')
  const copilotCliPath = path.join(localeDir, 'copilot-cli.json')
  if (!fs.existsSync(commonPath) || !fs.existsSync(copilotCliPath)) {
    continue
  }

  const common = JSON.parse(fs.readFileSync(commonPath, 'utf8'))
  const copilotCli = JSON.parse(fs.readFileSync(copilotCliPath, 'utf8'))

  const missing = requiredKeys.filter((key) => !hasPath(common, key))
  if (missing.length > 0) {
    missingByLocale.set(locale, missing)
  }

  const duplicates = requiredKeys
    .map((key) => key.split('.').at(-1))
    .filter((key) => key && key in copilotCli)
  if (duplicates.length > 0) {
    duplicateByLocale.set(locale, duplicates)
  }
}

assert.equal(
  missingByLocale.size,
  0,
  `common.skills is missing keys: ${JSON.stringify(Object.fromEntries(missingByLocale))}`
)

assert.equal(
  duplicateByLocale.size,
  0,
  `copilot-cli.json still contains duplicate keys: ${JSON.stringify(Object.fromEntries(duplicateByLocale))}`
)

console.log('copilot-cli missing keys test passed')
