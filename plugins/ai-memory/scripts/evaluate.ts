import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { rankMetadata } from '../core/search'
import type { SearchHit, SearchInput } from '../shared'

type Question = {
  id: string
  split: string
  scope: 'project' | 'global'
  question: string
  gold: string[]
  expanded_queries: string[]
}
const arg = (name: string, fallback: string) =>
  (process.argv.indexOf(name) > 0 && process.argv[process.argv.indexOf(name) + 1]) || fallback
const fixtures = resolve(arg('--fixtures', 'plugins/ai-memory/tests/fixtures'))
const rows = JSON.parse(await readFile(join(fixtures, 'memories.json'), 'utf8')) as SearchHit[]
const queries = JSON.parse(await readFile(join(fixtures, 'queries.json'), 'utf8')) as Question[]
const results = queries.map((question) => {
  const scope: SearchInput =
    question.scope === 'global'
      ? { scope: 'global' }
      : { scope: 'project', project_path: '/fixture/atlas' }
  const search = (terms: string[]) =>
    rankMetadata(rows, { ...scope, queries: terms })
      .slice(0, 5)
      .map((r) => r.id)
  return {
    ...question,
    raw: search([question.question]),
    aliases: search(question.expanded_queries)
  }
})
const stats = (items: typeof results, key: 'raw' | 'aliases') => {
  const positive = items.filter((q) => q.gold.length)
  const negative = items.filter((q) => !q.gold.length)
  return {
    recallAt5: positive.length
      ? positive.reduce(
          (n, q) => n + q.gold.filter((id) => q[key].includes(id)).length / q.gold.length,
          0
        ) / positive.length
      : null,
    negativeFalsePositives: negative.filter((q) => q[key].length).length,
    negativeCount: negative.length,
    misses: positive.filter((q) => !q.gold.every((id) => q[key].includes(id))).map((q) => q.id)
  }
}
const report =
  `# AI Memory effect experiment\n\n` +
  `Status: synthetic retrieval experiment only. Fixtures are constructed Atlas examples, not user history.\n\n` +
  `${queries.length} pre-labelled questions; ${rows.length} records. Gold labels are frozen before running.\n\n` +
  `| Split | Method | Recall@5 | No-answer false positives | Misses |\n| --- | --- | --- | --- | --- |\n` +
  ['tune', 'heldout']
    .flatMap((split) =>
      (['raw', 'aliases'] as const).map((key) => {
        const s = stats(
          results.filter((q) => q.split === split),
          key
        )
        return `| ${split} | ${key} | ${s.recallAt5} | ${s.negativeFalsePositives}/${s.negativeCount} | ${s.misses.join(', ') || 'none'} |`
      })
    )
    .join('\n') +
  `\n\nAliases are hand-authored fixture expansions, **not measured Agent expansion**. Raw and alias results must remain separate.\n\n` +
  `Actual Codex/Kimi tool calls, Explicit receipts, short-task Automatic coverage and baseline answers are recorded separately in [client evidence](2026-11-03-flyenv-ai-memory-effect-clients.md). This synthetic table alone is not final product acceptance; long tasks and controlled token comparison remain for stage D.\n`
const output = resolve(
  arg('--report', 'docs/superpowers/reports/2026-11-03-flyenv-ai-memory-effect.md')
)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, report)
console.log(report)
