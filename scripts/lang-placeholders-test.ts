import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

function checkMessages(messages: Record<string, Record<string, unknown>>) {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-lang-placeholders-'))
  try {
    const langDir = join(root, 'src/lang')
    for (const locale of ['en', 'ja', 'zh']) {
      const directory = join(langDir, locale)
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'mcp.json'), JSON.stringify(messages[locale] ?? {}))
    }
    const script = join(langDir, 'check.mjs')
    copyFileSync(new URL('../src/lang/check.mjs', import.meta.url), script)
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    const section = result.stdout.lastIndexOf('🔍 占位符检查')
    assert.ok(section >= 0, result.stdout)
    return result.stdout.slice(section)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('reports machine translation markers in English nested messages', () => {
  const report = checkMessages({ en: { nested: { addToClient: 'Add to {client} __ PH0 __' } } })
  assert.ok(report.includes('[en/mcp.json] nested.addToClient: 机器翻译残留的占位符标记'), report)
  assert.ok(!report.includes('所有语言包占位符正常'), report)
})

test('reports bare @ in English messages', () => {
  const report = checkMessages({ en: { help: 'Send to @example.com' } })
  assert.ok(report.includes('[en/mcp.json] help: 未转义的 @'), report)
  assert.ok(!report.includes('所有语言包占位符正常'), report)
})

test('continues checking translated messages for markers and bare @', () => {
  const report = checkMessages({
    en: { addToClient: 'Add to {client}' },
    ja: { addToClient: '{client} __ PH0 __ @example.com' }
  })
  assert.ok(report.includes('[ja/mcp.json] addToClient: 机器翻译残留的占位符标记'), report)
  assert.ok(report.includes('[ja/mcp.json] addToClient: 未转义的 @'), report)
})

test('compares translated placeholder names against English', () => {
  const report = checkMessages({
    en: { addToClient: 'Add to {client}' },
    ja: { addToClient: '{tool}' }
  })
  assert.ok(report.includes('[ja/mcp.json] addToClient: 英文中不存在的占位符 {tool}'), report)
  assert.ok(!report.includes('[en/mcp.json]'), report)
})

test('accepts matching placeholders and escaped @ in all languages', () => {
  const report = checkMessages({
    en: { addToClient: "Add to {client} {'@'}example.com" },
    ja: { addToClient: "{client} {'@'}example.com" },
    zh: { addToClient: "{client} {'@'}example.com" }
  })
  assert.ok(report.includes('所有语言包占位符正常'), report)
  assert.ok(!report.includes('•'), report)
})
