# i18n Common Key Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `common.json` across all locales, migrate the first shared AI/MCP i18n keys to `common.*`, remove the replaced duplicate module keys, and add duplicate-candidate reporting to the language check script.

**Architecture:** Add a new locale-level `common` namespace that is assembled alongside existing module namespaces, then migrate only Wave 1 AI/MCP call sites and translations to the canonical shared keys. Keep the rollout narrow: update the type union in `src/lang/index.ts`, patch all locale `index.ts` files, switch only the confirmed shared UI strings in AI/MCP components, and extend `src/lang/check.mjs` with a non-blocking duplicate-value report.

**Tech Stack:** TypeScript, Vue 3, Vue I18n, JSON locale files, Node.js validation script

---

## File Map

**Create**

- `src/lang/ar/common.json`
- `src/lang/az/common.json`
- `src/lang/bg/common.json`
- `src/lang/bn/common.json`
- `src/lang/cs/common.json`
- `src/lang/da/common.json`
- `src/lang/de/common.json`
- `src/lang/el/common.json`
- `src/lang/en/common.json`
- `src/lang/es/common.json`
- `src/lang/fi/common.json`
- `src/lang/fr/common.json`
- `src/lang/hr/common.json`
- `src/lang/hu/common.json`
- `src/lang/id/common.json`
- `src/lang/it/common.json`
- `src/lang/ja/common.json`
- `src/lang/ko/common.json`
- `src/lang/nl/common.json`
- `src/lang/no/common.json`
- `src/lang/pl/common.json`
- `src/lang/pt/common.json`
- `src/lang/pt-br/common.json`
- `src/lang/ro/common.json`
- `src/lang/ru/common.json`
- `src/lang/sv/common.json`
- `src/lang/tr/common.json`
- `src/lang/uk/common.json`
- `src/lang/vi/common.json`
- `src/lang/zh/common.json`
- `src/lang/zh-hant/common.json`

**Modify**

- `src/lang/index.ts`
- `src/lang/ar/index.ts`
- `src/lang/az/index.ts`
- `src/lang/bg/index.ts`
- `src/lang/bn/index.ts`
- `src/lang/cs/index.ts`
- `src/lang/da/index.ts`
- `src/lang/de/index.ts`
- `src/lang/el/index.ts`
- `src/lang/en/index.ts`
- `src/lang/es/index.ts`
- `src/lang/fi/index.ts`
- `src/lang/fr/index.ts`
- `src/lang/hr/index.ts`
- `src/lang/hu/index.ts`
- `src/lang/id/index.ts`
- `src/lang/it/index.ts`
- `src/lang/ja/index.ts`
- `src/lang/ko/index.ts`
- `src/lang/nl/index.ts`
- `src/lang/no/index.ts`
- `src/lang/pl/index.ts`
- `src/lang/pt/index.ts`
- `src/lang/pt-br/index.ts`
- `src/lang/ro/index.ts`
- `src/lang/ru/index.ts`
- `src/lang/sv/index.ts`
- `src/lang/tr/index.ts`
- `src/lang/uk/index.ts`
- `src/lang/vi/index.ts`
- `src/lang/zh/index.ts`
- `src/lang/zh-hant/index.ts`
- `src/lang/ai.json` in every locale where `model` is currently duplicated
- `src/lang/antigravity.json` in every locale
- `src/lang/codex.json` in every locale
- `src/lang/kimi.json` in every locale
- `src/lang/hermes.json` in every locale
- `src/lang/mcp.json` in every locale
- `src/render/components/AI/OllamaSetup/index.vue`
- `src/render/components/Antigravity/Config.vue`
- `src/render/components/Antigravity/Index.vue`
- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/Antigravity/Sessions.vue`
- `src/render/components/Antigravity/setup.ts`
- `src/render/components/Codex/Config.vue`
- `src/render/components/Codex/Index.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/Codex/Plugins.vue`
- `src/render/components/Codex/Sessions.vue`
- `src/render/components/Codex/setup.ts`
- `src/render/components/Kimi/Index.vue`
- `src/render/components/Kimi/MCP.vue`
- `src/render/components/Kimi/Sessions.vue`
- `src/render/components/Kimi/setup.ts`
- `src/render/components/Hermes/Index.vue`
- `src/render/components/Hermes/Sessions.vue`
- `src/render/components/Hermes/Skills.vue`
- `src/render/components/Hermes/SkillsInstalled.vue`
- `src/render/components/MCP/Service.vue`
- `src/render/components/MCP/setup.ts`
- `src/lang/check.mjs`

**Verify**

- `node src/lang/check.mjs`
- targeted `rg` searches to confirm old Wave 1 keys are gone from code references

## Task 1: Create the Canonical `common.json` Shape

**Files:**
- Create: `src/lang/<locale>/common.json` for every locale
- Modify: `src/lang/zh/common.json` first as the source structure
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Write the failing structural check target**

Define the exact Wave 1 `common.json` shape in `zh`:

```json
{
  "label": {
    "model": "模型"
  },
  "action": {
    "enable": "启用",
    "disable": "禁用",
    "resume": "恢复",
    "uninstall": "卸载"
  },
  "state": {
    "running": "运行中",
    "installed": "已安装",
    "enabled": "已启用",
    "disabled": "已禁用"
  },
  "session": {
    "list": "会话",
    "title": "标题",
    "id": "会话 ID",
    "lastPrompt": "最后提示词",
    "search": "搜索会话",
    "deleted": "会话已删除",
    "resumed": "已在终端中恢复会话"
  },
  "mcp": {
    "name": "名称",
    "type": "类型",
    "commandOrUrl": "命令 / URL",
    "scope": "范围",
    "addServer": "添加服务器"
  },
  "category": {
    "basic": "基础"
  }
}
```

This step is intentionally incomplete for other locales so the next verification should fail until every locale gets the same file.

- [ ] **Step 2: Run the check to verify it fails due to missing files**

Run: `node src/lang/check.mjs`

Expected: FAIL-like output in the structure report showing `common.json` missing from most locale directories.

- [ ] **Step 3: Add `common.json` to all locales with Wave 1 values**

Use a one-off script so every locale is built from the same source map and no key is hand-copied differently.

Exact source map:

```js
const FIELD_SOURCES = {
  'label.model': ['ai.model', 'codex.model', 'antigravity.model'],
  'action.enable': ['codex.enable', 'hermes.enable'],
  'action.disable': ['codex.disable', 'hermes.disable'],
  'action.resume': ['codex.resume', 'kimi.resume', 'antigravity.resume'],
  'action.uninstall': ['codex.uninstall'],
  'state.running': ['mcp.running'],
  'state.installed': ['codex.installed', 'hermes.installed'],
  'state.enabled': ['codex.enabled', 'hermes.enabled'],
  'state.disabled': ['codex.disabled', 'hermes.disabled'],
  'session.list': ['codex.sessions', 'kimi.sessions', 'hermes.sessions'],
  'session.title': ['codex.sessionTitle', 'kimi.sessionTitle'],
  'session.id': ['codex.sessionId', 'kimi.sessionId'],
  'session.lastPrompt': ['codex.lastPrompt', 'kimi.lastPrompt'],
  'session.search': ['codex.searchSession', 'kimi.searchSession', 'hermes.searchSession'],
  'session.deleted': ['codex.sessionDeleted', 'kimi.sessionDeleted'],
  'session.resumed': ['codex.sessionResumed', 'kimi.sessionResumed'],
  'mcp.name': ['codex.mcpName', 'kimi.mcpName', 'antigravity.mcpName'],
  'mcp.type': ['codex.mcpType', 'kimi.mcpType', 'antigravity.mcpType'],
  'mcp.commandOrUrl': [
    'codex.mcpCommandOrUrl',
    'kimi.mcpCommandOrUrl',
    'antigravity.mcpCommandOrUrl'
  ],
  'mcp.scope': ['codex.mcpScope', 'kimi.mcpScope', 'antigravity.mcpScope'],
  'mcp.addServer': ['codex.addServer', 'kimi.addServer', 'antigravity.addServer'],
  'category.basic': ['codex.category.basic', 'kimi.category.basic', 'antigravity.category.basic']
}
```

Use this exact script content:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())

const FIELD_SOURCES = {
  'label.model': ['ai.model', 'codex.model', 'antigravity.model'],
  'action.enable': ['codex.enable', 'hermes.enable'],
  'action.disable': ['codex.disable', 'hermes.disable'],
  'action.resume': ['codex.resume', 'kimi.resume', 'antigravity.resume'],
  'action.uninstall': ['codex.uninstall'],
  'state.running': ['mcp.running'],
  'state.installed': ['codex.installed', 'hermes.installed'],
  'state.enabled': ['codex.enabled', 'hermes.enabled'],
  'state.disabled': ['codex.disabled', 'hermes.disabled'],
  'session.list': ['codex.sessions', 'kimi.sessions', 'hermes.sessions'],
  'session.title': ['codex.sessionTitle', 'kimi.sessionTitle'],
  'session.id': ['codex.sessionId', 'kimi.sessionId'],
  'session.lastPrompt': ['codex.lastPrompt', 'kimi.lastPrompt'],
  'session.search': ['codex.searchSession', 'kimi.searchSession', 'hermes.searchSession'],
  'session.deleted': ['codex.sessionDeleted', 'kimi.sessionDeleted'],
  'session.resumed': ['codex.sessionResumed', 'kimi.sessionResumed'],
  'mcp.name': ['codex.mcpName', 'kimi.mcpName', 'antigravity.mcpName'],
  'mcp.type': ['codex.mcpType', 'kimi.mcpType', 'antigravity.mcpType'],
  'mcp.commandOrUrl': [
    'codex.mcpCommandOrUrl',
    'kimi.mcpCommandOrUrl',
    'antigravity.mcpCommandOrUrl'
  ],
  'mcp.scope': ['codex.mcpScope', 'kimi.mcpScope', 'antigravity.mcpScope'],
  'mcp.addServer': ['codex.addServer', 'kimi.addServer', 'antigravity.addServer'],
  'category.basic': ['codex.category.basic', 'kimi.category.basic', 'antigravity.category.basic']
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '')
}

function readJson(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')))
}

function getPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}

function setPath(obj, keyPath, value) {
  const parts = keyPath.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {}
    cur = cur[key]
  }
  cur[parts.at(-1)] = value
}

for (const locale of locales) {
  const files = {
    ai: readJson(path.join(root, locale, 'ai.json')),
    antigravity: readJson(path.join(root, locale, 'antigravity.json')),
    codex: readJson(path.join(root, locale, 'codex.json')),
    kimi: readJson(path.join(root, locale, 'kimi.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    mcp: readJson(path.join(root, locale, 'mcp.json'))
  }

  const common = {}

  for (const [target, sources] of Object.entries(FIELD_SOURCES)) {
    const value = sources.map((source) => getPath(files, source)).find(Boolean)
    if (!value) {
      throw new Error(`Missing source for ${locale}:${target}`)
    }
    setPath(common, target, value)
  }

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(common, null, 2)}\n`)
}
```

- [ ] **Step 4: Run the check to verify structural parity passes**

Run: `node src/lang/check.mjs`

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`

- [ ] **Step 5: Commit**

```bash
git add src/lang/*/common.json
git commit -m "feat: add shared i18n common namespace"
```

## Task 2: Assemble `common` Into the Locale Registry and Typed Keys

**Files:**
- Modify: `src/lang/index.ts`
- Modify: `src/lang/<locale>/index.ts` for all locales
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Write the failing type/assembly expectation**

Add the `zh` import target in `src/lang/index.ts`:

```ts
import type common from './zh/common.json'
```

and plan to extend `LangKey` with:

```ts
| AppendStringToKeys<typeof common, 'common'>
```

Before locale `index.ts` files are wired, TypeScript usage of `I18nT('common.mcp.addServer')` will not resolve at runtime.

- [ ] **Step 2: Run a targeted search to confirm no locale currently exports `common`**

Run: `rg -n "common," src/lang/*/index.ts`

Expected: no matches.

- [ ] **Step 3: Update all locale `index.ts` files to import and export `common`**

Pattern to apply in each locale file:

```ts
import common from './common.json'

export default {
  en: {
    common,
    kimi,
    claudeCode,
    codex
  }
}
```

Also update `src/lang/index.ts`:

```ts
import type common from './zh/common.json'

type LangKey =
  | AppendStringToKeys<typeof common, 'common'>
  | AppendStringToKeys<typeof ai, 'ai'>
  | AppendStringToKeys<typeof apache, 'apache'>
```

In every locale `index.ts`, place `common` near the top of the exported namespace object so the structure remains visually consistent across directories.

- [ ] **Step 4: Run the language check to verify registry changes did not break structure**

Run: `node src/lang/check.mjs`

Expected:

- structure consistent
- keys consistent
- no new unused keys yet until call sites migrate and old keys are deleted together

- [ ] **Step 5: Commit**

```bash
git add src/lang/index.ts src/lang/*/index.ts
git commit -m "refactor: register shared common i18n namespace"
```

## Task 3: Migrate Wave 1 AI/MCP Call Sites to `common.*`

**Files:**
- Modify: `src/render/components/AI/OllamaSetup/index.vue`
- Modify: `src/render/components/Antigravity/Config.vue`
- Modify: `src/render/components/Antigravity/Index.vue`
- Modify: `src/render/components/Antigravity/MCP.vue`
- Modify: `src/render/components/Antigravity/Sessions.vue`
- Modify: `src/render/components/Antigravity/setup.ts`
- Modify: `src/render/components/Codex/Config.vue`
- Modify: `src/render/components/Codex/Index.vue`
- Modify: `src/render/components/Codex/MCP.vue`
- Modify: `src/render/components/Codex/Plugins.vue`
- Modify: `src/render/components/Codex/Sessions.vue`
- Modify: `src/render/components/Codex/setup.ts`
- Modify: `src/render/components/Kimi/Index.vue`
- Modify: `src/render/components/Kimi/MCP.vue`
- Modify: `src/render/components/Kimi/Sessions.vue`
- Modify: `src/render/components/Kimi/setup.ts`
- Modify: `src/render/components/Hermes/Index.vue`
- Modify: `src/render/components/Hermes/Sessions.vue`
- Modify: `src/render/components/Hermes/Skills.vue`
- Modify: `src/render/components/Hermes/SkillsInstalled.vue`
- Modify: `src/render/components/MCP/Service.vue`
- Modify: `src/render/components/MCP/setup.ts`
- Test: `rg -n "I18nT\\('(antigravity|codex|kimi|hermes|mcp|ai)\\." src/render`

- [ ] **Step 1: Write the failing replacement target**

Replace only the confirmed Wave 1 keys. Examples:

```ts
I18nT('codex.mcpName') -> I18nT('common.mcp.name')
I18nT('kimi.resume') -> I18nT('common.action.resume')
I18nT('mcp.running') -> I18nT('common.state.running')
I18nT('ai.model') -> I18nT('common.label.model')
```

Do not migrate out-of-scope keys such as:

```ts
I18nT('mcp.host')
I18nT('mcp.stopped')
I18nT('hermes.id')
I18nT('antigravity.sessionId')
I18nT('antigravity.sessionDeleted')
```

Those remain module-specific in Wave 1.

- [ ] **Step 2: Run a targeted search to capture the pre-migration references**

Run:

```bash
rg -n "I18nT\('(?:antigravity|codex|kimi|hermes|mcp|ai)\.(?:model|resume|enable|disable|uninstall|enabled|disabled|installed|sessions|sessionTitle|sessionId|lastPrompt|searchSession|sessionDeleted|sessionResumed|addServer|mcpName|mcpType|mcpCommandOrUrl|mcpScope|category\.basic|running)'\)" src/render
```

Expected: matches in the AI/MCP components listed above.

- [ ] **Step 3: Implement the call-site replacements**

Examples of the exact replacement patterns:

```ts
I18nT('ai.model') -> I18nT('common.label.model')
I18nT('codex.enable') -> I18nT('common.action.enable')
I18nT('codex.disable') -> I18nT('common.action.disable')
I18nT('codex.uninstall') -> I18nT('common.action.uninstall')
I18nT('codex.enabled') -> I18nT('common.state.enabled')
I18nT('codex.disabled') -> I18nT('common.state.disabled')
I18nT('codex.installed') -> I18nT('common.state.installed')
I18nT('codex.sessions') -> I18nT('common.session.list')
I18nT('codex.sessionTitle') -> I18nT('common.session.title')
I18nT('codex.lastPrompt') -> I18nT('common.session.lastPrompt')
I18nT('codex.searchSession') -> I18nT('common.session.search')
I18nT('codex.addServer') -> I18nT('common.mcp.addServer')
I18nT('codex.mcpName') -> I18nT('common.mcp.name')
I18nT('codex.mcpType') -> I18nT('common.mcp.type')
I18nT('codex.mcpCommandOrUrl') -> I18nT('common.mcp.commandOrUrl')
I18nT('codex.mcpScope') -> I18nT('common.mcp.scope')
I18nT('codex.category.basic') -> I18nT('common.category.basic')
```

For `antigravity`, migrate only:

```ts
I18nT('antigravity.model') -> I18nT('common.label.model')
I18nT('antigravity.resume') -> I18nT('common.action.resume')
I18nT('antigravity.sessions') -> I18nT('common.session.list')
I18nT('antigravity.searchSession') -> I18nT('common.session.search')
I18nT('antigravity.addServer') -> I18nT('common.mcp.addServer')
I18nT('antigravity.mcpName') -> I18nT('common.mcp.name')
I18nT('antigravity.mcpType') -> I18nT('common.mcp.type')
I18nT('antigravity.mcpCommandOrUrl') -> I18nT('common.mcp.commandOrUrl')
I18nT('antigravity.mcpScope') -> I18nT('common.mcp.scope')
I18nT('antigravity.category.basic') -> I18nT('common.category.basic')
```

Do not replace Antigravity session-specific strings because their wording is intentionally different from Codex/Kimi.

- [ ] **Step 4: Run the targeted search to verify the migrated old call-site keys are gone**

Run the same `rg` command from Step 2.

Expected:

- no matches for the migrated keys
- remaining matches should only be explicitly out-of-scope keys

- [ ] **Step 5: Commit**

```bash
git add src/render/components/AI/OllamaSetup/index.vue src/render/components/Antigravity src/render/components/Codex src/render/components/Kimi src/render/components/Hermes src/render/components/MCP
git commit -m "refactor: switch wave1 ai mcp ui to common i18n keys"
```

## Task 4: Remove Replaced Duplicate Keys From Locale Module Files

**Files:**
- Modify: `src/lang/<locale>/ai.json`
- Modify: `src/lang/<locale>/antigravity.json`
- Modify: `src/lang/<locale>/codex.json`
- Modify: `src/lang/<locale>/kimi.json`
- Modify: `src/lang/<locale>/hermes.json`
- Modify: `src/lang/<locale>/mcp.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Write the failing cleanup target**

After Task 3, these keys should be removable from module files:

```text
ai.model
antigravity.model
antigravity.resume
antigravity.sessions
antigravity.searchSession
antigravity.addServer
antigravity.mcpName
antigravity.mcpType
antigravity.mcpCommandOrUrl
antigravity.mcpScope
antigravity.category.basic
codex.model
codex.resume
codex.enable
codex.disable
codex.uninstall
codex.enabled
codex.disabled
codex.installed
codex.sessions
codex.sessionTitle
codex.lastPrompt
codex.searchSession
codex.addServer
codex.mcpName
codex.mcpType
codex.mcpCommandOrUrl
codex.mcpScope
codex.category.basic
kimi.resume
kimi.sessions
kimi.sessionTitle
kimi.lastPrompt
kimi.searchSession
kimi.addServer
kimi.mcpName
kimi.mcpType
kimi.mcpCommandOrUrl
kimi.mcpScope
kimi.category.basic
hermes.enable
hermes.disable
hermes.enabled
hermes.disabled
hermes.installed
hermes.sessions
hermes.searchSession
mcp.running
```

- [ ] **Step 2: Run the language check before deletion to confirm the repo is still green**

Run: `node src/lang/check.mjs`

Expected: pass before deletion begins.

- [ ] **Step 3: Delete only the replaced Wave 1 keys from every locale**

Rules:

- remove the exact migrated keys listed above
- keep adjacent module-specific strings
- keep nested object structure valid after deletion
- if a container object becomes empty, remove the empty object too

Examples:

```json
// remove from codex.json
"model": "模型",
"sessions": "会话",
"sessionTitle": "标题",
"lastPrompt": "最后提示词",
"resume": "恢复",
"searchSession": "搜索会话",
"installed": "已安装",
"enabled": "已启用",
"disabled": "已禁用",
"enable": "启用",
"disable": "禁用",
"uninstall": "卸载",
"addServer": "添加服务器",
"mcpName": "名称",
"mcpType": "类型",
"mcpCommandOrUrl": "命令 / URL",
"mcpScope": "范围",
"category": { "basic": "基础" }
```

- [ ] **Step 4: Run the language check to verify there are no missing references or stale keys**

Run: `node src/lang/check.mjs`

Expected:

- structure consistent
- keys consistent
- no unused keys introduced by the migration

- [ ] **Step 5: Commit**

```bash
git add src/lang/*/ai.json src/lang/*/antigravity.json src/lang/*/codex.json src/lang/*/kimi.json src/lang/*/hermes.json src/lang/*/mcp.json
git commit -m "refactor: remove duplicated wave1 module i18n keys"
```

## Task 5: Add Duplicate-Candidate Reporting to `src/lang/check.mjs`

**Files:**
- Modify: `src/lang/check.mjs`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Write the failing report target**

Add a new reporting pass that:

1. scans `zh` and `en`
2. flattens leaf values per file
3. groups identical string values
4. prints clusters with 3 or more occurrences
5. excludes known acceptable duplicates from a local allowlist structure

Suggested allowlist seed:

```js
const DUPLICATE_KEY_ALLOWLIST = new Set([
  'podman.common.yes',
  'podman.common.no'
])
```

Store allowlist by full key, not by raw value, so intentional exceptions remain precise.

- [ ] **Step 2: Run the current check to confirm the report does not exist yet**

Run: `node src/lang/check.mjs`

Expected: current output has no duplicate-candidate section.

- [ ] **Step 3: Implement the duplicate-candidate report**

Add a function shaped like:

```js
function reportDuplicateCandidates() {
  const seedLangs = ['zh', 'en']
  const byValue = new Map()

  for (const lang of seedLangs) {
    const langDir = path.join(LANG_DIR, lang)
    const files = fs.readdirSync(langDir).filter((file) => file.endsWith('.json'))
    for (const file of files) {
      const fileName = path.basename(file, '.json')
      const content = require(path.join(langDir, file))
      for (const key of getFlattenedKeys(content)) {
        const value = key.split('.').reduce((cur, part) => cur?.[part], content)
        const fullKey = `${fileName}.${key}`
        if (DUPLICATE_KEY_ALLOWLIST.has(fullKey) || typeof value !== 'string') continue
        if (!byValue.has(value)) byValue.set(value, new Set())
        byValue.get(value).add(fullKey)
      }
    }
  }

  const candidates = Array.from(byValue.entries())
    .map(([value, keys]) => [value, Array.from(keys).sort()])
    .filter(([, keys]) => keys.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)

  console.log('\n🔍 重复文案候选（zh/en）\n')
  if (candidates.length === 0) {
    console.log('✅ 没有发现需要关注的重复文案候选')
    return
  }

  for (const [value, keys] of candidates) {
    console.log(`• ${JSON.stringify(value)}`)
    for (const key of keys) {
      console.log(`  - ${key}`)
    }
  }
}
```

Output format:

```text
🔍 重复文案候选（zh/en）
• "添加服务器"
  - antigravity.addServer
  - codex.addServer
  - kimi.addServer
```

This report must never change exit behavior or mark the run as failed.

- [ ] **Step 4: Run the check to verify the report appears and the main checks still pass**

Run: `node src/lang/check.mjs`

Expected:

- existing structure/key/unused-key checks still pass
- duplicate-candidate section prints informational clusters

- [ ] **Step 5: Commit**

```bash
git add src/lang/check.mjs
git commit -m "feat: report duplicate i18n candidates"
```

## Task 6: Final Verification and Handoff

**Files:**
- Verify only

- [ ] **Step 1: Run the full validation command**

Run: `node src/lang/check.mjs`

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`
- `🎉 没有发现未使用的国际化键！`
- duplicate-candidate section present as informational output

- [ ] **Step 2: Run a targeted grep to confirm old Wave 1 code references are gone**

Run:

```bash
rg -n "I18nT\('(?:antigravity|codex|kimi|hermes|mcp|ai)\.(?:model|resume|enable|disable|uninstall|enabled|disabled|installed|sessions|sessionTitle|lastPrompt|searchSession|addServer|mcpName|mcpType|mcpCommandOrUrl|mcpScope|category\.basic|running)'\)" src/render src/main src/fork
```

Expected: no matches.

- [ ] **Step 3: Inspect git diff scope**

Run: `git diff --stat`

Expected:

- `common.json` added for all locales
- locale registry files updated
- Wave 1 AI/MCP components updated
- duplicated keys removed from module locale files
- `src/lang/check.mjs` enhanced

- [ ] **Step 4: Commit the final verification checkpoint if needed**

```bash
git add -A
git commit -m "chore: verify wave1 common i18n migration"
```

Only create this commit if the previous task commits do not already cover the final state cleanly.
