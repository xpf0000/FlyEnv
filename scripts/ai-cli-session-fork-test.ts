import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dedupeAiCliSessions } from '../src/fork/util/AiCliSession'

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
  const source = readFileSync(
    join(root, 'src', 'fork', 'module', module.directory, 'index.ts'),
    'utf-8'
  )
  const terminalStart = source.indexOf("runInTerminal(workDir: string, sessionId = '')")
  const terminalEnd = source.indexOf('// ==========', terminalStart + 1)
  const terminalSource = source.slice(terminalStart, terminalEnd)

  assert.match(source, /deleteSessions\(sessionIds: string\[\]\)/)
  assert.match(source, /const ids = \[\.\.\.new Set\(sessionIds\)\]/)
  assert.match(
    source,
    /Promise\.allSettled\(\s*ids\.map\(\(sessionId\) => this\.deleteSession\(sessionId\)\)\s*\)/
  )
  assert.match(source, /resolve\(\{ deletedIds, failedIds \}\)/)
  assert.match(source, /dedupeAiCliSessions\(list\)/)
  assert.notEqual(terminalStart, -1, `${module.directory}: session ID must be optional`)
  assert.match(terminalSource, /sessionId\s*\?/)
  assert.match(terminalSource, module.resume)
  assert.match(terminalSource, new RegExp(`: resolveAiCliTerminalCommand\\('${module.cli}'\\)`))
  assert.match(terminalSource, /ExecCommand\.runInTerminal\(terminalCommand\)/)
}

for (const directory of ['ClaudeCode', 'Codex', 'Kimi']) {
  const source = readFileSync(join(root, 'src', 'fork', 'module', directory, 'index.ts'), 'utf-8')
  assert.match(source, /runAiCliSessionTasks\(/)
}

const deduped = dedupeAiCliSessions([
  { id: 'older', title: 'older', updatedAt: '2026-08-16T10:00:00.000Z' },
  { id: 'same', title: 'old', updatedAt: '2026-08-16T10:00:00.000Z' },
  { id: 'same', title: 'new', updatedAt: '2026-08-16T11:00:00.000Z' },
  { id: '', title: 'missing id', updatedAt: '2026-08-16T12:00:00.000Z' }
])
assert.deepEqual(deduped, [
  { id: 'older', title: 'older', updatedAt: '2026-08-16T10:00:00.000Z' },
  { id: 'same', title: 'new', updatedAt: '2026-08-16T11:00:00.000Z' }
])

console.log('ai-cli session fork tests passed')
