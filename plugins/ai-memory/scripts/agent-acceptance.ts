import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

type Context = {
  endpoint: string
  token: string
  output: string
  projectA: string
  projectB: string
  childProject: string
  call: (method: string, args: any) => Promise<any>
  restart: () => Promise<void>
  audit: () => Promise<any>
}

export function automaticMetrics(client: string, initial: any, changed: any, projectPath: string) {
  const expected = ['lock', 'copy', 'reports'].map((key) => `acceptance/automatic/${client}/${key}`)
  const committed = (run: any): any[] => {
    const records = new Map<string, any>()
    for (const call of run.calls) {
      if (call.name !== 'flyenv_memory_store') continue
      const receipt = run.audit.find(
        (row: any) =>
          row.request_id === call.arguments.request_id && row.outcome === 'success' && row.id
      )
      if (receipt) records.set(receipt.id, call.arguments)
    }
    return [...records.values()]
  }
  const saved = committed(initial)
  return {
    client,
    name: 'automatic-metrics',
    opportunities: expected.length,
    covered: expected.filter((topic) =>
      saved.some(
        (row) => row.topic === topic && row.scope === 'project' && row.project_path === projectPath
      )
    ).length,
    incidental: saved.filter((row) => !expected.includes(row.topic)).length,
    contextChangeGet: changed.calls.some((call: any) => call.name === 'flyenv_memory_get'),
    newRecordsWithoutOpportunity: committed(changed).length
  }
}

// External clients operate only on constructed records in the parent's temporary host.
// Neither client's global configuration is edited. This is not an implementation agent.
export async function runAgentAcceptance(ctx: Context) {
  const baselineOnly = process.argv.includes('--retrieval-baseline-only')
  const retrievalOnly = baselineOnly || process.argv.includes('--retrieval-only')
  const output = join(ctx.output, 'agents')
  await mkdir(output, { recursive: true })
  const rules = await readFile('plugins/ai-memory/assets/memory-rules.md', 'utf8')
  const tools = ['flyenv_memory_search', 'flyenv_memory_get', 'flyenv_memory_store']
  const runs: any[] = []
  let calls: any[] = []
  let replaceReceipt = false
  let replaced = 0
  // A transport-edge fixture replaces one committed receipt with unknown. Production
  // storage is unchanged; the next identical request must confirm the original commit.
  const proxy = createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString()
      const rpc = body ? JSON.parse(body) : undefined
      if (rpc?.method === 'tools/call') calls.push(structuredClone(rpc.params))
      const upstream = await fetch(ctx.endpoint, {
        method: req.method,
        headers: {
          authorization: `Bearer ${ctx.token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...(req.headers['mcp-protocol-version']
            ? { 'mcp-protocol-version': String(req.headers['mcp-protocol-version']) }
            : {})
        },
        ...(body ? { body } : {})
      })
      let text = await upstream.text()
      if (
        replaceReceipt &&
        rpc?.params?.name === 'flyenv_memory_store' &&
        text.includes('success')
      ) {
        const transform = (value: any) => {
          if (value.result?.content) {
            value.result = {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ outcome: 'unknown', error_code: 'receipt_lost' })
                }
              ],
              isError: true
            }
            replaceReceipt = false
            replaced++
          }
          return value
        }
        text = text.startsWith('{')
          ? JSON.stringify(transform(JSON.parse(text)))
          : text.replace(
              /^data: (.+)$/gm,
              (_line, json) => `data: ${JSON.stringify(transform(JSON.parse(json)))}`
            )
      }
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json'
      })
      res.end(text)
    } catch {
      res.writeHead(502)
      res.end('fixture_proxy_error')
    }
  })
  await new Promise<void>((yes) => proxy.listen(0, '127.0.0.1', yes))
  const url = `http://127.0.0.1:${(proxy.address() as any).port}/mcp`
  const versions = Object.fromEntries(
    ['codex', 'kimi'].map((name) => [
      name,
      execFileSync(name, ['--version'], { encoding: 'utf8' }).trim()
    ])
  )
  const source = {
    kind: 'document',
    agent: 'acceptance',
    description: 'Constructed fixture; not user history'
  }
  const draft = (topic: string, content: string, path = ctx.projectA) => ({
    scope: 'project',
    project_path: path,
    request_id: randomUUID(),
    type: 'decision',
    topic,
    title: topic,
    summary: content,
    content,
    tags: ['acceptance'],
    source
  })
  const scope = { scope: 'project', project_path: ctx.projectA }
  const search = async (topic: string, target = scope) =>
    (await ctx.call('search', { ...target, topic })).data.results
  async function run(
    client: 'codex' | 'kimi',
    name: string,
    prompt: string,
    options: { baseline?: boolean; cwd?: string; projectRoot?: string } = {}
  ) {
    const cwd = options.cwd || ctx.projectA
    await mkdir(join(cwd, '.kimi-code'), { recursive: true })
    await mkdir(join(cwd, 'empty-skills'), { recursive: true })
    await writeFile(
      join(cwd, '.kimi-code/mcp.json'),
      JSON.stringify({
        mcpServers: options.baseline
          ? {}
          : { memory: { url, headers: { Authorization: `Bearer ${ctx.token}` } } }
      })
    )
    const agentFile = join(cwd, 'acceptance-agent.md')
    await writeFile(
      agentFile,
      `---\nname: memory-acceptance\ndescription: Constructed temporary memory fixture only\ntools: ${JSON.stringify(options.baseline ? [] : tools.map((tool) => `mcp__memory__${tool}`))}\nsubagents: []\n---\nUse only supplied fixture facts and memory tools. No shell, web, files, skills or other agents.\n`
    )
    const fullPrompt = `Isolated synthetic acceptance. Only supplied facts and memory tools are allowed. Do not use shell, web, files, skills, external data or other agents. Confirmed project root: ${options.projectRoot || ctx.projectA}. Current working directory: ${cwd}.\n${options.baseline ? '' : rules}\n${prompt}`
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
            cwd,
            '--json',
            '-c',
            'model_reasoning_effort="low"',
            ...(!options.baseline
              ? [
                  '-c',
                  `mcp_servers.memory.url=${JSON.stringify(url)}`,
                  '-c',
                  `mcp_servers.memory.http_headers={Authorization=${JSON.stringify(`Bearer ${ctx.token}`)}}`,
                  '-c',
                  `mcp_servers.memory.enabled_tools=${JSON.stringify(tools)}`,
                  ...tools.flatMap((tool) => [
                    '-c',
                    `mcp_servers.memory.tools.${tool}.approval_mode="approve"`
                  ])
                ]
              : []),
            '-'
          ]
        : [
            '-p',
            fullPrompt,
            '--output-format',
            'stream-json',
            '--agent-file',
            agentFile,
            '--skills-dir',
            join(cwd, 'empty-skills')
          ]
    const started = Date.now()
    calls = []
    const result = await new Promise<any>((done) => {
      const child = spawn(client, args, {
        cwd,
        env: { ...process.env, KIMI_DISABLE_TELEMETRY: '1', KIMI_CODE_TRUST_WORKSPACE: '1' },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = '',
        stderr = '',
        timeout = false
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
        done({ code: -1, stdout, stderr: error.message, timeout })
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        done({ code, stdout, stderr, timeout })
      })
      child.stdin.end(client === 'codex' ? fullPrompt : '')
    })
    const events = result.stdout.split('\n').flatMap((line: string) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
    const answers = events.flatMap((event: any) =>
      event.item?.type === 'agent_message'
        ? [event.item.text]
        : event.role === 'assistant' && typeof event.content === 'string'
          ? [event.content]
          : []
    )
    const final = answers.at(-1) || ''
    const answerText = answers.join('\n')
    const usage = events.filter((event: any) => event.usage || event.type === 'usage')
    const record = {
      client,
      name,
      version: versions[client],
      duration_ms: Date.now() - started,
      ...result,
      final,
      answerText,
      usage,
      calls: [...calls],
      audit: await ctx.audit()
    }
    await writeFile(join(output, `${client}-${name}.json`), JSON.stringify(record, null, 2))
    runs.push({
      client,
      name,
      code: result.code,
      timeout: result.timeout,
      duration_ms: record.duration_ms,
      calls: calls.length,
      usage
    })
    console.log(JSON.stringify(runs.at(-1)))
    assert.equal(result.code, 0, `${client} ${name}: ${result.stderr.slice(-500)}`)
    assert.equal(result.timeout, false)
    return record
  }
  const readPrompt = (topic: string) =>
    `Search topic ${topic} in the confirmed project root, get the matching record's complete content, and report its fact and actual ID/revision. Do not write a duplicate.`
  try {
    if (!retrievalOnly) {
      const first = draft('acceptance/cross/codex', 'The fixture release code is CORAL-742.')
      const written = await run(
        'codex',
        'explicit',
        `Explicit request: remember this fact using these exact store fields after searching for existing evidence, then get the saved ID: ${JSON.stringify(first)}. Report the actual outcome/ID/revision.`
      )
      assert.ok(
        written.calls.some(
          (c: any) =>
            c.name === 'flyenv_memory_store' && c.arguments.request_id === first.request_id
        )
      )
      const firstRows = await search(first.topic)
      assert.equal(firstRows.length, 1)
      const second = draft('acceptance/cross/kimi', 'The fixture rollback code is AMBER-519.')
      const read = await run(
        'kimi',
        'cross-write',
        `${readPrompt(first.topic)}\nThen explicitly remember this second independent fact using exactly these fields, and get its saved record: ${JSON.stringify(second)}`
      )
      assert.ok(read.answerText.includes('CORAL-742'))
      assert.ok(
        read.calls.some(
          (c: any) => c.name === 'flyenv_memory_get' && c.arguments.id === firstRows[0].id
        )
      )
      const secondRows = await search(second.topic)
      assert.equal(secondRows.length, 1)
      await ctx.restart()
      const restored = await run('codex', 'restart-child-cwd', readPrompt(second.topic), {
        cwd: ctx.childProject
      })
      assert.ok(restored.final.includes('AMBER-519'))
      assert.ok(
        restored.calls.some(
          (c: any) =>
            c.name === 'flyenv_memory_get' &&
            c.arguments.id === secondRows[0].id &&
            c.arguments.project_path === ctx.projectA
        )
      )
      assert.equal(
        (await search(first.topic, { scope: 'project', project_path: ctx.childProject })).length,
        0
      )

      const independent = draft(
        'acceptance/child',
        'Independent child fixture uses PEARL-308.',
        ctx.childProject
      )
      const childRun = await run(
        'kimi',
        'independent-child',
        `This task belongs to the already registered independent child project ${ctx.childProject}; use that exact scope instead of the parent. Explicitly remember with these exact fields and get it: ${JSON.stringify(independent)}`,
        { cwd: ctx.childProject }
      )
      assert.ok(
        childRun.calls.some(
          (c: any) =>
            c.name === 'flyenv_memory_store' && c.arguments.project_path === ctx.childProject
        )
      )
      assert.equal((await search(independent.topic)).length, 0)

      for (const agent of ['codex', 'kimi'] as const) {
        const invalid = draft(
          `acceptance/rejected/${agent}`,
          'Rejected fixture must not be saved elsewhere.',
          join(ctx.projectA, 'does-not-exist')
        )
        const failure = await run(
          agent,
          'explicit-failure',
          `Negative acceptance: explicitly store these exact fields once. The nonexistent path is intentional; report its rejection accurately. Do not correct the path, invent success, or retry another scope: ${JSON.stringify(invalid)}`
        )
        assert.ok(
          failure.calls.some(
            (c: any) =>
              c.name === 'flyenv_memory_store' && c.arguments.project_path === invalid.project_path
          )
        )
        assert.equal((await search(invalid.topic)).length, 0)
        const uncertain = draft(
          `acceptance/lost/${agent}`,
          `Constructed lost-receipt fixture ${agent}.`
        )
        replaceReceipt = true
        const confirmed = await run(
          agent,
          'unknown-receipt',
          `Explicitly remember with these exact fields, following the copied rules for any unknown result. Verify using get and report the actual receipt: ${JSON.stringify(uncertain)}`
        )
        assert.equal(replaceReceipt, false)
        const stores = confirmed.calls.filter((c: any) => c.name === 'flyenv_memory_store')
        assert.ok(stores.length >= 2, `${agent}: unknown must confirm same request`)
        for (const store of stores) assert.deepEqual(store.arguments, stores[0].arguments)
        assert.equal((await search(uncertain.topic)).length, 1)

        const prefix = `acceptance/automatic/${agent}`
        // Three stable opportunities embedded among 90 transient lines; next run starts a
        // fresh client context. This measures long supplied context, not forced compaction.
        const log = Array.from({ length: 90 }, (_, i) => {
          if (i === 12)
            return `Confirmed decision: fixture snapshots use a fixed OS-held lock. Topic ${prefix}/lock; project scope.`
          if (i === 45)
            return `Verified reusable procedure: stop fixture worker, copy the whole fixture data directory, re-enable. Topic ${prefix}/copy; project scope.`
          if (i === 78)
            return `Confirmed user preference: fixture reports lead with results. Topic ${prefix}/reports; project scope.`
          return `Temporary progress ${i}: opened fixture pane ${i % 7}, observed a spinner, checked transient item ${i}. This is incidental activity without a lasting decision.`
        }).join('\n')
        const automatic = await run(
          agent,
          'automatic-long',
          `Work log of the just-completed task:\n${log}\nThe task is complete. Give a brief completion summary.`
        )
        const changed = await run(
          agent,
          'automatic-context-change',
          `A fresh task context follows the earlier fixture maintenance work. Retrieve the fixture copy procedure from topic ${prefix}/copy and explain it, using get for the source. No new durable fact is supplied.`
        )
        runs.push(automaticMetrics(agent, automatic, changed, ctx.projectA))
      }
    }
    const fixturesText = await readFile('plugins/ai-memory/tests/fixtures/memories.json', 'utf8')
    const questionsText = await readFile('plugins/ai-memory/tests/fixtures/queries.json', 'utf8')
    const fixtures = JSON.parse(fixturesText),
      questions = JSON.parse(questionsText)
    // Earlier lifecycle checks used a global fixture. Remove it before comparing
    // the frozen corpus with the full-text baseline so both see identical data.
    const globalBefore = (await ctx.call('search', { scope: 'global', limit: 20 })).data.results
    for (const row of globalBefore) {
      assert.equal(
        (
          await ctx.call('forget', {
            scope: 'global',
            id: row.id,
            expected_revision: row.revision,
            request_id: randomUUID()
          })
        ).outcome,
        'success'
      )
    }
    assert.equal((await ctx.call('search', { scope: 'global' })).data.results.length, 0)
    // Dedicated third project and clean global scope make the frozen corpus comparable.
    const evaluationProject = join(ctx.projectB, 'evaluation')
    await mkdir(evaluationProject)
    const idMap: Record<string, string> = {}
    for (const fixture of fixtures) {
      const {
        id,
        revision: _revision,
        projectId: _projectId,
        created_at: _created,
        updated_at: _updated,
        ...fields
      } = fixture
      const result = await ctx.call('store', {
        ...fields,
        request_id: id,
        ...(fixture.scope === 'project'
          ? { project_path: evaluationProject, create_project: true }
          : {})
      })
      assert.equal(result.outcome, 'success')
      idMap[id] = result.data.id
    }
    const retrieval: any[] = []
    for (const q of questions) {
      const target =
        q.scope === 'project'
          ? { scope: 'project', project_path: evaluationProject }
          : { scope: 'global' }
      const raw = (
        await ctx.call('search', { ...target, queries: [q.question], limit: 5 })
      ).data.results.map((row: any) => row.id)
      const aliases = (
        await ctx.call('search', { ...target, queries: q.expanded_queries, limit: 5 })
      ).data.results.map((row: any) => row.id)
      retrieval.push({ ...q, gold: q.gold.map((id: string) => idMap[id]), raw, aliases })
    }
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
    const selected = retrieval.filter((q) => selectedIds.includes(q.id))
    const baseline = fixtures
      .map(
        (row: any) =>
          `ID ${idMap[row.id]}; scope ${row.scope}${row.scope === 'project' ? `; project_path ${evaluationProject}` : ''}; topic ${row.topic}\n${row.title}\n${row.summary}\n${row.content}`
      )
      .join('\n\n')
    const scores = []
    for (const agent of ['codex', 'kimi'] as const) {
      for (const mode of ['baseline', 'memory'] as const) {
        if (baselineOnly && mode !== 'baseline') continue
        const prompt = `For this retrieval task only the confirmed project is ${evaluationProject}. Answer these frozen questions using relevant memory IDs or [] if there is no evidence. Do not write memory. Return JSON {answers:[{question_id,ids:[]}]}. Questions: ${JSON.stringify(selected.map(({ id, scope, question }) => ({ id, scope, question })))}\n${mode === 'baseline' ? `Entire MEMORY.md baseline:\n${baseline}` : 'Search and get memory using the copied rules.'}`
        const result = await run(agent, `retrieval-${mode}`, prompt, {
          baseline: mode === 'baseline',
          projectRoot: evaluationProject
        })
        const match = result.final.match(/\{[\s\S]*\}/)
        const answer = match ? JSON.parse(match[0]) : { answers: [] }
        const rows = selected.map((q) => {
          const ids = answer.answers?.find((a: any) => a.question_id === q.id)?.ids || []
          return {
            id: q.id,
            gold: q.gold,
            ids,
            correct: JSON.stringify([...ids].sort()) === JSON.stringify([...q.gold].sort())
          }
        })
        scores.push({
          client: agent,
          mode,
          correct: rows.filter((row) => row.correct).length,
          total: rows.length,
          rows
        })
      }
    }
    const metrics = ['raw', 'aliases'].flatMap((method) =>
      ['tune', 'heldout'].map((split) => {
        const group = retrieval.filter((q) => q.split === split)
        const positive = group.filter((q) => q.gold.length),
          negative = group.filter((q) => !q.gold.length)
        return {
          method,
          split,
          recallAt5:
            positive.reduce(
              (n, q) =>
                n + q.gold.filter((id: string) => q[method].includes(id)).length / q.gold.length,
              0
            ) / positive.length,
          negativeFalsePositives: negative.filter((q) => q[method].length).length,
          negativeCount: negative.length
        }
      })
    )
    await writeFile(
      join(output, 'summary.json'),
      JSON.stringify(
        {
          versions,
          fixture_sha256: createHash('sha256').update(fixturesText).digest('hex'),
          questions_sha256: createHash('sha256').update(questionsText).digest('hex'),
          replacedReceipts: replaced,
          runs,
          retrieval,
          metrics,
          scores
        },
        null,
        2
      )
    )
    assert.equal(replaced, retrievalOnly ? 0 : 2)
    assert.ok(
      scores
        .filter((score) => score.mode === 'memory')
        .every((score) => score.correct === score.total),
      'frozen production end-to-end retrieval failed; inspect scored evidence'
    )
  } finally {
    proxy.closeAllConnections()
    await new Promise<void>((yes, no) => proxy.close((error) => (error ? no(error) : yes())))
    // Both paths live beneath the parent harness's disposable fixture root.
    for (const path of [ctx.projectA, ctx.childProject]) {
      await rm(join(path, '.kimi-code'), { recursive: true, force: true })
    }
  }
}
