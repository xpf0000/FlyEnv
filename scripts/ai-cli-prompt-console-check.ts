import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const htmlPath = resolve('docs/task/ai-cli-mcp-demo-prompt-console.html')

assert.equal(
  existsSync(htmlPath),
  true,
  `expected prompt console HTML to exist at ${htmlPath}, but it does not exist yet`
)

const html = readFileSync(htmlPath, 'utf8')
const normalizedHtml = html.replace(/\s+/g, ' ').trim()

const requiredStrings = [
  'Use FlyEnv MCP and Codex to turn a local MySQL environment into a working PHP CRUD demo site.',
  'Start MySQL Through FlyEnv MCP',
  'Create the Demo Database and Table',
  'Seed Three Demo Rows',
  'Generate a Minimal PHP CRUD App',
  'Create the FlyEnv Site and Start PHP / Nginx',
  'Summarize the Local Setup',
  'Prepare the Browser Test Checklist',
  'Copy Prompt',
  'Previous',
  'Next',
  'Mark Done',
  'Reset to Step 1',
  'navigator.clipboard.writeText',
  'localStorage',
  'Use FlyEnv MCP to inspect the local MySQL service.',
  'Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.',
  'Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen.'
]

for (const entry of requiredStrings) {
  const normalizedEntry = entry.replace(/\s+/g, ' ').trim()
  assert.match(normalizedHtml, new RegExp(normalizedEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(html, /const steps = \[/)
assert.match(html, /function render\(/)
assert.match(html, /function copyPrompt\(/)
assert.match(html, /function saveState\(/)
assert.match(html, /function loadState\(/)

console.log('ai-cli-prompt-console-check: ok')
