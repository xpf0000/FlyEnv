# i18n Common Key Wave 4 BasicInfo Clear Enable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared category key and one shared action key, repair the existing shared `enable` action values, migrate the remaining low-risk duplicate call sites, and delete the replaced locale keys.

**Architecture:** Reuse `src/lang/<locale>/common.json` and keep this wave narrow: `common.category.basicInfo`, `common.action.clear`, and `common.action.enable`. Because the current locale values drift across modules, populate each canonical key with deterministic source rules instead of copying one module blindly, then migrate all matching UI references and remove the old per-module keys.

**Tech Stack:** TypeScript, Vue 3, Electron JSON command configs, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave4-basicinfo-clear-enable.md`
- `src/lang/*/common.json`
- `src/lang/*/base.json`
- `src/lang/*/cron.json`
- `src/lang/*/hermes.json`
- `src/lang/*/n8n.json`
- `src/lang/*/openclaw.json`
- `src/lang/*/podman.json`
- `src/lang/*/tools.json`
- `src/render/components/AI/Chat/index.vue`
- `src/render/components/AppLog/log.vue`
- `src/render/components/Cron/DialogAdd.vue`
- `src/render/components/DNS/service.vue`
- `src/render/components/Flutter/General.vue`
- `src/render/components/Hermes/SkillsAll.vue`
- `src/render/components/Hermes/Service.vue`
- `src/render/components/Hermes/command.json`
- `src/render/components/Host/Index.vue`
- `src/render/components/LanguageProjects/ProjectEdit.vue`
- `src/render/components/Log/tool.vue`
- `src/render/components/N8N/Users.vue`
- `src/render/components/OpenClaw/Service.vue`
- `src/render/components/OpenClaw/command.json`
- `src/render/components/Podman/container/info.vue`
- `src/render/components/RoadRunner/ProjectEdit.vue`
- `src/render/components/SwooleCli/ProjectEdit.vue`
- `src/render/components/Tools/DiffCompare/Index.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.(category\\.basicInfo|action\\.clear|action\\.enable)" src/render src/main src/fork`
- `rg -n "I18nT\\('base\\.baseInfo'\\)|\\$t\\('base\\.baseInfo'\\)|I18nT\\('base\\.clean'\\)|\\$t\\('base\\.clean'\\)|I18nT\\('base\\.enable'\\)|\\$t\\('base\\.enable'\\)|I18nT\\('cron\\.clearOutput'\\)|\\$t\\('cron\\.clearOutput'\\)|I18nT\\('hermes\\.clear'\\)|\\$t\\('hermes\\.clear'\\)|I18nT\\('n8n\\.usersEnable'\\)|\\$t\\('n8n\\.usersEnable'\\)|I18nT\\('podman\\.container\\.basicInfo'\\)|\\$t\\('podman\\.container\\.basicInfo'\\)|openclaw\\.category\\.basicInfo|hermes\\.category\\.basicInfo|tools\\.diff-compare-clear" src/render src/main src/fork`

## Task 1: Capture the Wave 4 Red State

**Files:**

- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old keys are still referenced before editing**

Run:

```bash
rg -n "I18nT\('base\.baseInfo'\)|\$t\('base\.baseInfo'\)|I18nT\('base\.clean'\)|\$t\('base\.clean'\)|I18nT\('base\.enable'\)|\$t\('base\.enable'\)|I18nT\('cron\.clearOutput'\)|\$t\('cron\.clearOutput'\)|I18nT\('hermes\.clear'\)|\$t\('hermes\.clear'\)|I18nT\('n8n\.usersEnable'\)|\$t\('n8n\.usersEnable'\)|I18nT\('podman\.container\.basicInfo'\)|\$t\('podman\.container\.basicInfo'\)|openclaw\.category\.basicInfo|hermes\.category\.basicInfo|tools\.diff-compare-clear" src/render src/main src/fork
```

Expected:

- matches in the files listed in the file map
- proves this wave still has concrete migration work to do

- [ ] **Step 2: Record the locale drift that prevents a blind copy**

Run a one-off script shaped like:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())
const groups = {
  basicInfo: ['base.baseInfo', 'hermes.category.basicInfo', 'openclaw.category.basicInfo', 'podman.container.basicInfo'],
  clear: ['base.clean', 'cron.clearOutput', 'hermes.clear', 'tools.diff-compare-clear'],
  enable: ['base.enable', 'n8n.usersEnable', 'common.action.enable']
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function getPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}

for (const locale of locales) {
  const files = {}
  for (const name of ['base', 'cron', 'hermes', 'n8n', 'openclaw', 'podman', 'tools', 'common']) {
    files[name] = readJson(path.join(root, locale, `${name}.json`))
  }

  const lines = []
  for (const [group, keys] of Object.entries(groups)) {
    const values = keys.map((key) => [key, getPath(files, key)]).filter(([, value]) => value !== undefined)
    const uniq = [...new Set(values.map(([, value]) => value))]
    if (uniq.length > 1) {
      lines.push(`${group}: ${values.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' | ')}`)
    }
  }

  if (lines.length) {
    console.log(`\n[${locale}]`)
    for (const line of lines) console.log(line)
  }
}
```

Expected:

- drift output for a subset of locales
- confirms why this wave must use explicit source rules

## Task 2: Add the Canonical Wave 4 Keys

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.category.basicInfo` with majority-safe source rules**

Use these rules:

1. Collect values from `base.baseInfo`, `hermes.category.basicInfo`, `openclaw.category.basicInfo`, and `podman.container.basicInfo`.
2. Drop empty values.
3. For every non-`en` locale, drop the exact English string `Basic Info`.
4. Pick the most frequent remaining exact value.
5. If there is a tie, break it by this source priority:
   `base.baseInfo` -> `podman.container.basicInfo` -> `hermes.category.basicInfo` -> `openclaw.category.basicInfo`

- [ ] **Step 2: Populate `common.action.clear` with clear-oriented source rules**

Use these rules:

1. Collect values from `base.clean`, `cron.clearOutput`, `hermes.clear`, and `tools.diff-compare-clear`.
2. Drop empty values.
3. For every non-`en` locale, drop the exact English strings `Clear` and `Clean`.
4. Pick the most frequent remaining exact value.
5. If there is a tie, break it by this source priority:
   `tools.diff-compare-clear` -> `hermes.clear` -> `cron.clearOutput` -> `base.clean`

- [ ] **Step 3: Repair `common.action.enable` with locale-aware source rules**

Use these rules:

1. For locales `ja` and `ko`, copy from `n8n.usersEnable`.
2. For every other locale, copy from `base.enable`.
3. If the chosen source is missing, fall back to `n8n.usersEnable`, then the existing `common.action.enable`.

- [ ] **Step 4: Apply the Wave 4 updates with a deterministic one-off script**

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
    cron: readJson(path.join(root, locale, 'cron.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    n8n: readJson(path.join(root, locale, 'n8n.json')),
    openclaw: readJson(path.join(root, locale, 'openclaw.json')),
    podman: readJson(path.join(root, locale, 'podman.json')),
    tools: readJson(path.join(root, locale, 'tools.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const common = files.common

  const basicInfoPriority = [
    getPath(files, 'base.baseInfo'),
    getPath(files, 'podman.container.basicInfo'),
    getPath(files, 'hermes.category.basicInfo'),
    getPath(files, 'openclaw.category.basicInfo')
  ].filter(Boolean)
  const basicInfoCandidates = basicInfoPriority.filter((value) => !(locale !== 'en' && value === 'Basic Info'))
  setPath(common, 'category.basicInfo', chooseMostFrequent(basicInfoCandidates, basicInfoPriority))

  const clearPriority = [
    getPath(files, 'tools.diff-compare-clear'),
    getPath(files, 'hermes.clear'),
    getPath(files, 'cron.clearOutput'),
    getPath(files, 'base.clean')
  ].filter(Boolean)
  const clearCandidates = clearPriority.filter((value) => !(locale !== 'en' && (value === 'Clear' || value === 'Clean')))
  setPath(common, 'action.clear', chooseMostFrequent(clearCandidates, clearPriority))

  const enablePrimary = locale === 'ja' || locale === 'ko' ? getPath(files, 'n8n.usersEnable') : getPath(files, 'base.enable')
  const enableValue = enablePrimary || getPath(files, 'n8n.usersEnable') || getPath(files, 'common.action.enable')
  setPath(common, 'action.enable', enableValue)

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(common, null, 2)}\n`)
}
```

- [ ] **Step 5: Verify the language pack structure after adding the keys**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`

## Task 3: Migrate Remaining Call Sites

**Files:**

- Modify: the renderer files listed in the file map
- Test: `rg -n "I18nT\\('base\\.baseInfo'\\)|\\$t\\('base\\.baseInfo'\\)|I18nT\\('base\\.clean'\\)|\\$t\\('base\\.clean'\\)|I18nT\\('base\\.enable'\\)|\\$t\\('base\\.enable'\\)|I18nT\\('cron\\.clearOutput'\\)|\\$t\\('cron\\.clearOutput'\\)|I18nT\\('hermes\\.clear'\\)|\\$t\\('hermes\\.clear'\\)|I18nT\\('n8n\\.usersEnable'\\)|\\$t\\('n8n\\.usersEnable'\\)|I18nT\\('podman\\.container\\.basicInfo'\\)|\\$t\\('podman\\.container\\.basicInfo'\\)|openclaw\\.category\\.basicInfo|hermes\\.category\\.basicInfo|tools\\.diff-compare-clear" src/render src/main src/fork`

- [ ] **Step 1: Replace the basic info headings**

Apply only these replacements:

```text
I18nT('base.baseInfo') -> I18nT('common.category.basicInfo')
openclaw.category.basicInfo -> common.category.basicInfo
hermes.category.basicInfo -> common.category.basicInfo
I18nT('podman.container.basicInfo') -> I18nT('common.category.basicInfo')
```

- [ ] **Step 2: Replace the clear actions**

Apply only these replacements:

```text
I18nT('base.clean') -> I18nT('common.action.clear')
I18nT('cron.clearOutput') -> I18nT('common.action.clear')
I18nT('hermes.clear') -> I18nT('common.action.clear')
I18nT('tools.diff-compare-clear') -> I18nT('common.action.clear')
```

- [ ] **Step 3: Replace the remaining enable actions**

Apply only these replacements:

```text
I18nT('base.enable') -> I18nT('common.action.enable')
I18nT('n8n.usersEnable') -> I18nT('common.action.enable')
```

- [ ] **Step 4: Verify that the old Wave 4 source keys are gone from app code**

Run:

```bash
rg -n "I18nT\('base\.baseInfo'\)|\$t\('base\.baseInfo'\)|I18nT\('base\.clean'\)|\$t\('base\.clean'\)|I18nT\('base\.enable'\)|\$t\('base\.enable'\)|I18nT\('cron\.clearOutput'\)|\$t\('cron\.clearOutput'\)|I18nT\('hermes\.clear'\)|\$t\('hermes\.clear'\)|I18nT\('n8n\.usersEnable'\)|\$t\('n8n\.usersEnable'\)|I18nT\('podman\.container\.basicInfo'\)|\$t\('podman\.container\.basicInfo'\)|openclaw\.category\.basicInfo|hermes\.category\.basicInfo|tools\.diff-compare-clear" src/render src/main src/fork
```

Expected:

- no matches

## Task 4: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/base.json`
- Modify: `src/lang/*/cron.json`
- Modify: `src/lang/*/hermes.json`
- Modify: `src/lang/*/n8n.json`
- Modify: `src/lang/*/openclaw.json`
- Modify: `src/lang/*/podman.json`
- Modify: `src/lang/*/tools.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete the old per-module keys from every locale**

Remove:

```text
base.baseInfo
base.clean
base.enable
cron.clearOutput
hermes.clear
hermes.category.basicInfo
n8n.usersEnable
openclaw.category.basicInfo
podman.container.basicInfo
tools.diff-compare-clear
```

- [ ] **Step 2: Re-run the language validation**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- no unused key report

- [ ] **Step 3: Confirm the new common keys are the only app references**

Run:

```bash
rg -n "common\.(category\.basicInfo|action\.clear|action\.enable)" src/render src/main src/fork
```

Expected:

- matches for the migrated files
- existing `common.action.enable` usages still present and now share corrected locale values
