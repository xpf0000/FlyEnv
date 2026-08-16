import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

const modules = [
  { directory: 'ClaudeCode', cli: 'claude', resume: /--resume \$\{sessionId\}/ },
  { directory: 'Codex', cli: 'codex', resume: /resume \$\{sessionId\}/ },
  { directory: 'OpenCode', cli: 'opencode', resume: /--session \$\{sessionId\}/ },
  { directory: 'CopilotCli', cli: 'copilot', resume: /--resume=\$\{sessionId\}/ },
  { directory: 'Kimi', cli: 'kimi', resume: /--session "\$\{sessionId\}"/ },
  { directory: 'Antigravity', cli: 'agy', resume: /--conversation \$\{sessionId\}/ }
]

for (const module of modules) {
  const source = readFileSync(join(root, 'src', 'fork', 'module', module.directory, 'index.ts'), 'utf-8')
  const terminalStart = source.indexOf("runInTerminal(workDir: string, sessionId = '')")
  const terminalEnd = source.indexOf('// ==========', terminalStart + 1)
  const terminalSource = source.slice(terminalStart, terminalEnd)

  assert.match(source, /deleteSessions\(sessionIds: string\[\]\)/)
  assert.match(source, /const ids = \[\.\.\.new Set\(sessionIds\)\]/)
  assert.match(
    source,
    /Promise\.allSettled\(ids\.map\(\(sessionId\) => this\.deleteSession\(sessionId\)\)\)/
  )
  assert.match(source, /resolve\(\{ deletedIds, failedIds \}\)/)
  assert.notEqual(terminalStart, -1, `${module.directory}: session ID must be optional`)
  assert.match(terminalSource, /sessionId\s*\?/)
  assert.match(terminalSource, module.resume)
  assert.match(terminalSource, new RegExp(`: resolveAiCliTerminalCommand\\('${module.cli}'\\)`))
  assert.match(terminalSource, /ExecCommand\.runInTerminal\(terminalCommand\)/)
}

console.log('ai-cli session fork tests passed')
