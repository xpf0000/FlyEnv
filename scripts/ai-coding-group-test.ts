import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { AppModuleTypeEnum, AppModuleTypeList } from '../src/render/core/type'

const repoRoot = process.cwd()

const readText = (...segments: string[]) => {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8')
}

const readJson = <T>(...segments: string[]) => {
  return JSON.parse(readText(...segments)) as T
}

const expectModuleType = (componentName: string, moduleType: string) => {
  const content = readText('src', 'render', 'components', componentName, 'Module.ts')
  assert.match(
    content,
    new RegExp(`moduleType:\\s*'${moduleType}'`),
    `${componentName} should be assigned to ${moduleType}`
  )
}

assert.equal(AppModuleTypeEnum.aiCoding, 'aiCoding', 'AppModuleTypeEnum should expose aiCoding')
assert.ok(AppModuleTypeList.includes('aiCoding'), 'AppModuleTypeList should include aiCoding')

const aiCodingIndex = AppModuleTypeList.indexOf('aiCoding')
const aiIndex = AppModuleTypeList.indexOf('ai')

assert.ok(aiCodingIndex >= 0, 'aiCoding should exist in AppModuleTypeList')
assert.ok(aiIndex >= 0, 'ai should exist in AppModuleTypeList')
assert.ok(aiCodingIndex < aiIndex, 'aiCoding should render before ai')

expectModuleType('Kimi', 'aiCoding')
expectModuleType('ClaudeCode', 'aiCoding')
expectModuleType('Codex', 'aiCoding')
expectModuleType('OpenCode', 'aiCoding')

expectModuleType('Hermes', 'ai')
expectModuleType('OpenClaw', 'ai')
expectModuleType('Ollama', 'ai')
expectModuleType('MCP', 'ai')
expectModuleType('CliProxyAPI', 'ai')
expectModuleType('N8N', 'ai')

const enAside = readJson<Record<string, string>>('src', 'lang', 'en', 'aside.json')
const zhAside = readJson<Record<string, string>>('src', 'lang', 'zh', 'aside.json')

assert.equal(enAside.aiCoding, 'AI Coding', 'English aside label should define aiCoding')
assert.equal(zhAside.aiCoding, 'AI 编码', 'Chinese aside label should define aiCoding')

console.log('ai-coding-group: configuration verified')
