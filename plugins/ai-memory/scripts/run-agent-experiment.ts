import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

// External-client acceptance, not an implementation agent. Uses only constructed test data.
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(pluginRoot, '../..')
const output = resolve(
  process.argv[2] || '.superpowers/sdd/2026-11-03-flyenv-ai-memory/agent-experiment'
)
await mkdir(output, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'flyenv-memory-effect-'))
const fixtures = JSON.parse(
  await readFile(join(pluginRoot, 'tests/fixtures/memories.json'), 'utf8')
)
const questions = JSON.parse(
  await readFile(join(pluginRoot, 'tests/fixtures/queries.json'), 'utf8')
)
const selectedIds = [
  'q01-0',
  'q03-0',
  'q04-1',
  'q05-0',
  'q08-1',
  'q09-0',
  'negative-0',
  'negative-4'
]
const selected = questions.filter((q: { id: string }) => selectedIds.includes(q.id))
const rules = await readFile(join(pluginRoot, 'assets/memory-rules.md'), 'utf8')
const baseline = fixtures
  .map(
    (r: Record<string, unknown>) =>
      `ID ${r.id}; scope ${r.scope}; topic ${r.topic}\n${r.title}\n${r.summary}\n${r.content}`
  )
  .join('\n\n')
await writeFile(join(scratch, 'MEMORY.md'), baseline)
const basePrompt = `This is an isolated synthetic retrieval acceptance test, not a repository task. Do not use shell, web, files, skills, agents, or outside data. You may only use the supplied memory data or memory MCP tools. The project root is /fixture/atlas. Answer these questions using the relevant memory IDs, or [] for no evidence. Do not guess IDs. Return JSON {answers:[{question_id,ids:[]}],explicit:{outcome,id,revision}}. Questions:\n${JSON.stringify(selected.map(({ id, scope, question }: { id: string; scope: string; question: string }) => ({ id, scope, question })))}\n`

async function run(client: 'codex' | 'kimi', mode: 'baseline' | 'memory' | 'automatic') {
  const evidence = join(output, `${client}-${mode}-calls.jsonl`)
  await writeFile(evidence, '')
  const config = join(output, `${client}-${mode}-mcp.json`)
  const server = {
    command: join(repoRoot, 'node_modules/.bin/tsx'),
    args: [join(pluginRoot, 'scripts/experiment-server.ts'), '--evidence', evidence]
  }
  await writeFile(
    config,
    JSON.stringify({ mcpServers: mode !== 'baseline' ? { memory: server } : {} })
  )
  const prompt =
    mode === 'baseline'
      ? basePrompt +
        `\nRead this entire MEMORY.md baseline. There are no writes requested; explicit.outcome should be not_requested.\n${baseline}`
      : basePrompt +
        `\n${rules}\nAfter answering, explicitly remember this new global preference: In the Atlas acceptance fixture, the user wants brief reports. Use topic acceptance/style. Call store, then get that ID to verify it. Report the actual receipt; do not claim success without tools.`
  await mkdir(join(scratch, '.kimi-code'), { recursive: true })
  await mkdir(join(scratch, 'empty-skills'), { recursive: true })
  await writeFile(
    join(scratch, '.kimi-code/mcp.json'),
    JSON.stringify({ mcpServers: mode !== 'baseline' ? { memory: server } : {} })
  )
  await writeFile(
    join(scratch, `${mode}-agent.md`),
    `---\nname: memory-effect-test\ndescription: Synthetic memory acceptance only\ntools: ${mode !== 'baseline' ? '["mcp__memory__flyenv_memory_search","mcp__memory__flyenv_memory_get","mcp__memory__flyenv_memory_store"]' : '[]'}\nsubagents: []\n---\nUse only the supplied fixture and memory tools. No repository work or other tools.\n`
  )
  const automaticPrompt = `This is an isolated synthetic task-completion test. Only the supplied memory tools are available. ${rules}
The project root is /fixture/atlas. Work log:
- Temporary progress: opened the build page; a spinner appeared once.
- Confirmed durable user preference: acceptance reports should explain results before implementation details. Topic acceptance/result-first, scope global.
- Confirmed project decision: use a fixed OS-held file lock for the acceptance data directory. Topic acceptance/process-lock, scope project.
- Verified reusable procedure: stop the fixture worker, copy the whole fixture data directory, then re-enable it. Topic acceptance/offline-copy, scope project.
- Temporary progress: completed step 3 of today's checklist.
The task is complete. Give the user a brief completion summary. Do not use any other tools or data.`
  const finalPrompt = mode === 'automatic' ? automaticPrompt : prompt
  const args =
    client === 'codex'
      ? [
          'exec',
          '--ignore-user-config',
          '--ephemeral',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '-C',
          scratch,
          '--json',
          '-c',
          'model_reasoning_effort="low"',
          ...(mode !== 'baseline'
            ? [
                '-c',
                `mcp_servers.effect.command=${JSON.stringify(server.command)}`,
                '-c',
                `mcp_servers.effect.args=${JSON.stringify(server.args)}`,
                '-c',
                'mcp_servers.effect.enabled_tools=["flyenv_memory_search","flyenv_memory_get","flyenv_memory_store"]',
                ...['search', 'get', 'store'].flatMap((method) => [
                  '-c',
                  `mcp_servers.effect.tools.flyenv_memory_${method}.approval_mode="approve"`
                ])
              ]
            : []),
          '-'
        ]
      : [
          '-p',
          finalPrompt,
          '--output-format',
          'stream-json',
          '--agent-file',
          join(scratch, `${mode}-agent.md`),
          '--skills-dir',
          join(scratch, 'empty-skills')
        ]

  const started = Date.now()
  const result = await new Promise<{
    code: number | null
    stdout: string
    stderr: string
    timeout: boolean
  }>((resolveRun) => {
    const child = spawn(client, args, {
      cwd: scratch,
      env: { ...process.env, KIMI_DISABLE_TELEMETRY: '1', KIMI_CODE_TRUST_WORKSPACE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timeout = false
    const timer = setTimeout(() => {
      timeout = true
      child.kill('SIGTERM')
    }, 180_000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      resolveRun({ code: -1, stdout, stderr: error.message, timeout })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolveRun({ code, stdout, stderr, timeout })
    })
    child.stdin.end(client === 'codex' ? finalPrompt : '')
  })
  await writeFile(
    join(output, `${client}-${mode}.json`),
    JSON.stringify(
      {
        client,
        mode,
        duration_ms: Date.now() - started,
        fixture_sha256: createHash('sha256').update(baseline).digest('hex'),
        ...result
      },
      null,
      2
    )
  )
  console.log(
    JSON.stringify({
      client,
      mode,
      code: result.code,
      timeout: result.timeout,
      duration_ms: Date.now() - started,
      output
    })
  )
}
for (const client of ['codex', 'kimi'] as const) {
  if (process.argv[3] && process.argv[3] !== client) continue
  for (const mode of ['baseline', 'memory', 'automatic'] as const) {
    if (process.argv[4] && process.argv[4] !== mode) continue
    await run(client, mode)
  }
}

await rm(scratch, { recursive: true, force: true })
