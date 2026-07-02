# i18n Common Key Wave 7 Action Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared label key for generic action-column headings, migrate the remaining safe action-label call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave limited to the noun label used for action columns and action sections: `base.action`, `host.action`, and `podman.Action`. Do not merge `base.operation` or `util.ftpTableHeadSetup`; they only collide in Chinese and drift semantically in multiple locales. Introduce `common.label.action`, populate it with a deterministic majority rule across the three safe sources, switch all matching UI references to the new key, then remove the replaced locale keys.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave7-action-column.md`
- `src/lang/*/common.json`
- `src/lang/*/base.json`
- `src/lang/*/host.json`
- `src/lang/*/podman.json`
- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/Antigravity/Sessions.vue`
- `src/render/components/Antigravity/Service.vue`
- `src/render/components/ClaudeCode/MCP.vue`
- `src/render/components/ClaudeCode/Sessions.vue`
- `src/render/components/ClaudeCode/Service.vue`
- `src/render/components/CloudflareTunnel/List.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/Codex/Sessions.vue`
- `src/render/components/Codex/Service.vue`
- `src/render/components/CopilotCli/MCP.vue`
- `src/render/components/CopilotCli/Sessions.vue`
- `src/render/components/CopilotCli/Service.vue`
- `src/render/components/Cron/ListTable.vue`
- `src/render/components/Cron/SystemTaskTable.vue`
- `src/render/components/CustomerModule/List.vue`
- `src/render/components/FTP/Service.vue`
- `src/render/components/Hermes/Service.vue`
- `src/render/components/Hermes/SkillsAll.vue`
- `src/render/components/Hermes/SkillsInstalled.vue`
- `src/render/components/Host/ListTable.vue`
- `src/render/components/Host/Tomcat/ListTable.vue`
- `src/render/components/Kimi/MCP.vue`
- `src/render/components/Kimi/Sessions.vue`
- `src/render/components/Kimi/Service.vue`
- `src/render/components/Mysql/Manage/database.vue`
- `src/render/components/N8N/Manager.vue`
- `src/render/components/Nodejs/default/index.vue`
- `src/render/components/Nodejs/fnm/index.vue`
- `src/render/components/Nodejs/nvm/index.vue`
- `src/render/components/Ollama/models/all/index.vue`
- `src/render/components/OpenCode/MCP.vue`
- `src/render/components/OpenCode/Sessions.vue`
- `src/render/components/OpenCode/Service.vue`
- `src/render/components/OpenClaw/Service.vue`
- `src/render/components/PHP/DisableFunction.vue`
- `src/render/components/PHP/Extension/Homebrew/index.vue`
- `src/render/components/PHP/Extension/Macports/index.vue`
- `src/render/components/PHP/List.vue`
- `src/render/components/Podman/compose/compose.vue`
- `src/render/components/Podman/container/container.vue`
- `src/render/components/Podman/image/image.vue`
- `src/render/components/PostgreSql/Extension/index.vue`
- `src/render/components/Rust/rustup.vue`
- `src/render/components/ServiceManager/EXT/alias.vue`
- `src/render/components/ServiceManager/base.vue`
- `src/render/components/ServiceManager/index.vue`
- `src/render/components/Setup/Licenses/index.vue`
- `src/render/components/VersionManager/brew/index.vue`
- `src/render/components/VersionManager/local/index.vue`
- `src/render/components/VersionManager/podman/index.vue`
- `src/render/components/VersionManager/port/index.vue`
- `src/render/components/VersionManager/sdkman/index.vue`
- `src/render/components/VersionManager/static/index.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.label\\.action" src/render src/main src/fork`
- `rg -n "I18nT\\('base\\.action'\\)|I18nT\\('host\\.action'\\)|I18nT\\('podman\\.Action'\\)" src/render src/main src/fork`

## Task 1: Capture the Wave 7 Red State

**Files:**

- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old app references exist before editing**

Run:

```bash
rg -n "I18nT\('base\.action'\)|I18nT\('host\.action'\)|I18nT\('podman\.Action'\)" src/render src/main src/fork
```

Expected:

- matches in the files listed in the file map

- [ ] **Step 2: Record the locale drift and the excluded collisions**

Run a one-off script shaped like:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function getPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}

for (const locale of locales) {
  const files = {
    base: readJson(path.join(root, locale, 'base.json')),
    host: readJson(path.join(root, locale, 'host.json')),
    podman: readJson(path.join(root, locale, 'podman.json')),
    util: readJson(path.join(root, locale, 'util.json'))
  }

  const values = {
    base: getPath(files, 'base.action'),
    host: getPath(files, 'host.action'),
    podman: getPath(files, 'podman.Action'),
    operation: getPath(files, 'base.operation'),
    setup: getPath(files, 'util.ftpTableHeadSetup')
  }

  const safeUniq = [...new Set([values.base, values.host, values.podman])]
  if (safeUniq.length > 1 || values.operation === values.base || values.setup === values.base) {
    console.log(locale, JSON.stringify(values))
  }
}
```

Expected:

- a small set of locales with drift across the three safe sources
- evidence that `base.operation` and `util.ftpTableHeadSetup` should stay out of this wave

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.label.action` with a deterministic majority rule**

Use these rules:

1. Collect `base.action`, `host.action`, and `podman.Action`.
2. Choose the most frequent exact value.
3. If there is a tie, break it with this priority:
   `base.action` -> `host.action` -> `podman.Action`

Reason:

- this keeps the canonical value aligned with the term already used by most modules in each locale
- tie-breaking toward `base.action` preserves the oldest generic label where no majority exists

- [ ] **Step 2: Apply the update with a deterministic one-off script**

Use a script shaped like:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())

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

function chooseMostFrequent(values, priority) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const max = Math.max(...counts.values())
  const winners = new Set([...counts.entries()].filter(([, count]) => count === max).map(([value]) => value))
  return priority.find((value) => winners.has(value))
}

for (const locale of locales) {
  const files = {
    base: readJson(path.join(root, locale, 'base.json')),
    host: readJson(path.join(root, locale, 'host.json')),
    podman: readJson(path.join(root, locale, 'podman.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const priority = [
    getPath(files, 'base.action'),
    getPath(files, 'host.action'),
    getPath(files, 'podman.Action')
  ].filter(Boolean)

  const value = chooseMostFrequent(priority, priority)
  if (!value) throw new Error(`Missing action label source for ${locale}`)
  setPath(files.common, 'label.action', value)

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(files.common, null, 2)}\n`)
}
```

- [ ] **Step 3: Verify the language pack structure after adding the key**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- `common.label.action` appears as unused until the call sites migrate

## Task 3: Migrate the Call Sites

**Files:**

- Modify: the renderer files listed in the file map
- Test: `rg -n "I18nT\\('base\\.action'\\)|I18nT\\('host\\.action'\\)|I18nT\\('podman\\.Action'\\)" src/render src/main src/fork`

- [ ] **Step 1: Replace all safe action-label call sites**

Apply only these replacements:

```text
I18nT('base.action') -> I18nT('common.label.action')
I18nT('host.action') -> I18nT('common.label.action')
I18nT('podman.Action') -> I18nT('common.label.action')
```

- [ ] **Step 2: Verify the old app references are gone**

Run:

```bash
rg -n "I18nT\('base\.action'\)|I18nT\('host\.action'\)|I18nT\('podman\.Action'\)" src/render src/main src/fork
```

Expected:

- no matches

## Task 4: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/base.json`
- Modify: `src/lang/*/host.json`
- Modify: `src/lang/*/podman.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete the replaced locale keys from every locale**

Remove:

```text
base.action
host.action
podman.Action
```

- [ ] **Step 2: Re-run the language validation**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- no unused key report

- [ ] **Step 3: Confirm the new common key is the only app reference**

Run:

```bash
rg -n "common\.label\.action" src/render src/main src/fork
```

Expected:

- matches in the migrated files
