import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const langRoot = path.join(projectRoot, 'src', 'lang')
const mcpToolCatalogPath = path.join(projectRoot, 'src', 'shared', 'mcpToolCatalog.ts')
const mcpServerPath = path.join(projectRoot, 'src', 'main', 'core', 'MCPServer.ts')

function parseStringArray(source, exportName) {
  const match = source.match(
    new RegExp(`export const ${exportName}(?::[^=]+)?\\s*=\\s*\\[(.*?)\\]`, 's')
  )
  assert.ok(match, `Unable to find ${exportName}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).sort()
}

function parseObjectKeys(source, exportName) {
  const match = source.match(
    new RegExp(`export const ${exportName}(?::[^=]+)?\\s*=\\s*\\{(.*?)\\}`, 's')
  )
  assert.ok(match, `Unable to find ${exportName}`)
  return [...match[1].matchAll(/([a-z_]+):\s*'[^']+'/g)].map((item) => item[1]).sort()
}

function parseServerToolNames(source) {
  return [
    ...source.matchAll(/name:\s*'([^']+)'\s*,\s*\n\s*description:\s*MCP_TOOL_DESCRIPTIONS\./g)
  ]
    .map((item) => item[1])
    .sort()
}

function hasPath(obj, keyPath) {
  return keyPath.split('.').every((key) => ((obj = obj?.[key]), obj !== undefined))
}

const mcpToolCatalogSource = fs.readFileSync(mcpToolCatalogPath, 'utf8')
const mcpServerSource = fs.readFileSync(mcpServerPath, 'utf8')

const frontendTools = parseStringArray(mcpToolCatalogSource, 'MCP_ALL_TOOLS')
const frontendRiskyTools = parseStringArray(mcpToolCatalogSource, 'MCP_RISKY_TOOLS')
const backendTools = parseServerToolNames(mcpServerSource)
const backendRiskyTools = parseObjectKeys(mcpToolCatalogSource, 'MCP_DEFAULT_APPROVAL')

assert.deepEqual(
  frontendTools,
  backendTools,
  `MCP frontend ALL_TOOLS is out of sync with backend tools.\nfrontend=${JSON.stringify(frontendTools)}\nbackend=${JSON.stringify(backendTools)}`
)

assert.deepEqual(
  frontendRiskyTools,
  backendRiskyTools,
  `MCP frontend RISKY_TOOLS is out of sync with backend risky tools.\nfrontend=${JSON.stringify(frontendRiskyTools)}\nbackend=${JSON.stringify(backendRiskyTools)}`
)

const missingByLocale = {}

for (const locale of fs.readdirSync(langRoot)) {
  const localeDir = path.join(langRoot, locale)
  if (!fs.statSync(localeDir).isDirectory()) {
    continue
  }

  const mcpJsonPath = path.join(localeDir, 'mcp.json')
  if (!fs.existsSync(mcpJsonPath)) {
    continue
  }

  const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'))
  const missing = backendTools
    .map((tool) => `toolDescriptions.${tool}`)
    .filter((keyPath) => !hasPath(mcpJson, keyPath))

  if (missing.length) {
    missingByLocale[locale] = missing
  }
}

assert.deepEqual(
  missingByLocale,
  {},
  `MCP locale files are missing tool description keys: ${JSON.stringify(missingByLocale)}`
)

console.log('mcp i18n keys test passed')
