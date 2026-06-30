# i18n Common Key Wave 3 Labels and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared `common` namespace with canonical keys for `name`, `status`, and `search`, migrate the corresponding UI references, and remove the replaced duplicate locale keys without carrying forward the worst historical mistranslations.

**Architecture:** Add `common.label.name`, `common.label.status`, and `common.action.search` on top of the existing `common.json` structure. Because the current module keys have translation drift, populate each new key from the most stable existing source instead of blindly copying one module: derive `label.name` from the best short label source available in each locale, derive `action.search` from `base.placeholderSearch` after trimming trailing punctuation, and derive `label.status` from `base.status` with a small locale override for known bad outliers plus colon trimming.

**Tech Stack:** TypeScript, Vue 3, Vue I18n, JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave3-labels-search.md`
- `src/lang/*/common.json`
- `src/lang/*/base.json`
- `src/lang/*/cron.json`
- `src/lang/*/flutter.json`
- `src/lang/*/hermes.json`
- `src/lang/*/n8n.json`
- `src/lang/*/setup.json`
- `src/render/components/AI/ChatItemSetup/index.vue`
- `src/render/components/Cron/DialogAdd.vue`
- `src/render/components/Cron/ListTable.vue`
- `src/render/components/Cron/SystemTaskTable.vue`
- `src/render/components/CustomerModule/List.vue`
- `src/render/components/Flutter/CreateProject.vue`
- `src/render/components/Flutter/EditProject.vue`
- `src/render/components/Hermes/SkillsAll.vue`
- `src/render/components/Hermes/SkillsInstalled.vue`
- `src/render/components/Host/ListTable.vue`
- `src/render/components/Host/Tomcat/ListTable.vue`
- `src/render/components/LanguageProjects/ProjectEdit.vue`
- `src/render/components/LanguageProjects/index.vue`
- `src/render/components/N8N/Users.vue`
- `src/render/components/Nodejs/default/index.vue`
- `src/render/components/Nodejs/fnm/index.vue`
- `src/render/components/Nodejs/nvm/index.vue`
- `src/render/components/Ollama/models/all/index.vue`
- `src/render/components/PHP/DisableFunction.vue`
- `src/render/components/PHP/Extension/Homebrew/index.vue`
- `src/render/components/PHP/Extension/Lib/index.vue`
- `src/render/components/PHP/Extension/Loaded/index.vue`
- `src/render/components/PHP/Extension/Local/index.vue`
- `src/render/components/PHP/Extension/Macports/index.vue`
- `src/render/components/Podman/compose-build/Base.vue`
- `src/render/components/Podman/compose-build/Form/Base.ts`
- `src/render/components/Podman/compose/compose.vue`
- `src/render/components/Podman/compose/composeAdd.vue`
- `src/render/components/Podman/container/containerCreate.vue`
- `src/render/components/Podman/machine/machineAdd.vue`
- `src/render/components/PostgreSql/Extension/index.vue`
- `src/render/components/Rust/rustup.vue`
- `src/render/components/Setup/AppFont/index.vue`
- `src/render/components/Setup/CodeFont/index.vue`
- `src/render/components/Setup/Module/module/moduleAdd.vue`
- `src/render/components/Setup/Module/module/moduleExecItemAdd.vue`
- `src/render/components/SwooleCli/ProjectEdit.vue`
- `src/render/components/Tools/CodeLibrary/codeAdd.vue`
- `src/render/components/Tools/CodeLibrary/groupContent.vue`
- `src/render/components/Tools/SiteSucker/Index.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.(label\\.(name|status)|action\\.search)" src/render src/main src/fork`
- `rg -n "I18nT\\('(?:base\\.name|hermes\\.name|n8n\\.usersName|setup\\.module\\.name|base\\.status|hermes\\.status|n8n\\.usersStatus|cron\\.status|base\\.placeholderSearch|flutter\\.search|hermes\\.search)'\\)|\\$t\\('(?:base\\.name|base\\.placeholderSearch)'\\)" src/render src/main src/fork`

## Task 1: Add Wave 3 Keys to `common.json`

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Capture the current drift before editing**

Run:

```bash
node - <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())
const groups = {
  name: ['hermes.name', 'n8n.usersName', 'base.name', 'setup.module.name'],
  status: ['hermes.status', 'n8n.usersStatus', 'base.status', 'cron.status'],
  search: ['hermes.search', 'flutter.search', 'base.placeholderSearch']
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}
function getPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}
for (const locale of locales) {
  const files = {}
  for (const name of ['base', 'cron', 'flutter', 'hermes', 'n8n', 'setup']) {
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
    console.log(`\\n[${locale}]`)
    for (const line of lines) console.log(line)
  }
}
NODE
```

Expected:

- drift output for a subset of locales
- confirms why this wave cannot simply copy one module blindly

- [ ] **Step 2: Populate the new keys with deterministic source rules**

Use these rules:

1. `common.label.name`
   Use these rules in order:
   - for locale `zh-hant`, copy from `common.mcp.name`
   - for locale `pl`, set the canonical value to `Nazwa`
   - otherwise prefer the first good short label from `hermes.name`, `n8n.usersName`, `base.name`, `setup.module.name`, `common.mcp.name`
   - a “good short label” must be non-empty, must not contain `(` or `)`, and for non-English locales must not be the exact English word `Name`

2. `common.action.search`
   Start from `base.placeholderSearch`. Trim trailing `:` or `：` plus surrounding whitespace.
   If `base.placeholderSearch` is missing, fall back to `hermes.search`, then `flutter.search`.

3. `common.label.status`
   Start from `base.status`. Trim trailing `:` or `：` plus surrounding whitespace.
   Use `hermes.status` instead for locale `ru`.
   If the chosen source is missing, fall back to `hermes.status`, then `n8n.usersStatus`, then `cron.status`,
   applying the same trailing-punctuation trim.

Use a one-off script shaped like:

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

function normalizeShortText(value) {
  return String(value).replace(/[:：]\s*$/, '').trim()
}

for (const locale of locales) {
  const files = {
    base: readJson(path.join(root, locale, 'base.json')),
    cron: readJson(path.join(root, locale, 'cron.json')),
    flutter: readJson(path.join(root, locale, 'flutter.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    n8n: readJson(path.join(root, locale, 'n8n.json')),
    setup: readJson(path.join(root, locale, 'setup.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const common = files.common

  let nameValue
  if (locale === 'zh-hant') {
    nameValue = getPath(files, 'common.mcp.name')
  } else if (locale === 'pl') {
    nameValue = 'Nazwa'
  } else {
    const nameSources = [
      getPath(files, 'hermes.name'),
      getPath(files, 'n8n.usersName'),
      getPath(files, 'base.name'),
      getPath(files, 'setup.module.name'),
      getPath(files, 'common.mcp.name')
    ]
    nameValue = nameSources.find((value) => {
      if (!value) return false
      const text = String(value).trim()
      if (!text || /[()]/.test(text)) return false
      if (locale !== 'en' && text === 'Name') return false
      return true
    })
  }
  if (!nameValue) throw new Error(`Missing name source for ${locale}`)
  setPath(common, 'label.name', nameValue)

  const searchSources = ['base.placeholderSearch', 'hermes.search', 'flutter.search']
  const searchValue = searchSources.map((key) => getPath(files, key)).find(Boolean)
  if (!searchValue) throw new Error(`Missing search source for ${locale}`)
  setPath(common, 'action.search', normalizeShortText(searchValue))

  const statusSources =
    locale === 'ru'
      ? ['hermes.status', 'base.status', 'n8n.usersStatus', 'cron.status']
      : ['base.status', 'hermes.status', 'n8n.usersStatus', 'cron.status']
  const statusValue = statusSources.map((key) => getPath(files, key)).find(Boolean)
  if (!statusValue) throw new Error(`Missing status source for ${locale}`)
  setPath(common, 'label.status', normalizeShortText(statusValue))

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(common, null, 2)}\n`)
}
```

- [ ] **Step 3: Run the language check after adding the keys**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`

## Task 2: Migrate Wave 3 Call Sites

**Files:**

- Modify: all render files listed in the File Map
- Test: targeted `rg` search

- [ ] **Step 1: Capture the pre-migration references**

Run:

```bash
rg -n "I18nT\('(?:base\.name|hermes\.name|n8n\.usersName|setup\.module\.name|base\.status|hermes\.status|n8n\.usersStatus|cron\.status|base\.placeholderSearch|flutter\.search|hermes\.search)'\)|\$t\('(?:base\.name|base\.placeholderSearch)'\)" src/render src/main src/fork
```

Expected:

- matches in the files listed above

- [ ] **Step 2: Replace all `name` references**

Apply only these replacements:

```text
I18nT('base.name') -> I18nT('common.label.name')
I18nT('hermes.name') -> I18nT('common.label.name')
I18nT('n8n.usersName') -> I18nT('common.label.name')
I18nT('setup.module.name') -> I18nT('common.label.name')
$t('base.name') -> $t('common.label.name')
```

- [ ] **Step 3: Replace all `status` references**

Apply only these replacements:

```text
I18nT('base.status') -> I18nT('common.label.status')
I18nT('hermes.status') -> I18nT('common.label.status')
I18nT('n8n.usersStatus') -> I18nT('common.label.status')
I18nT('cron.status') -> I18nT('common.label.status')
```

- [ ] **Step 4: Replace all `search` references**

Apply only these replacements:

```text
I18nT('base.placeholderSearch') -> I18nT('common.action.search')
I18nT('flutter.search') -> I18nT('common.action.search')
I18nT('hermes.search') -> I18nT('common.action.search')
$t('base.placeholderSearch') -> $t('common.action.search')
```

- [ ] **Step 5: Verify the old call-site references are gone**

Run:

```bash
rg -n "I18nT\('(?:base\.name|hermes\.name|n8n\.usersName|setup\.module\.name|base\.status|hermes\.status|n8n\.usersStatus|cron\.status|base\.placeholderSearch|flutter\.search|hermes\.search)'\)|\$t\('(?:base\.name|base\.placeholderSearch)'\)" src/render src/main src/fork
```

Expected:

- no matches

## Task 3: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/base.json`
- Modify: `src/lang/*/cron.json`
- Modify: `src/lang/*/flutter.json`
- Modify: `src/lang/*/hermes.json`
- Modify: `src/lang/*/n8n.json`
- Modify: `src/lang/*/setup.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete only the exact replaced keys**

Remove these exact keys from every locale:

```text
base.name
base.status
base.placeholderSearch
cron.status
flutter.search
hermes.name
hermes.status
hermes.search
n8n.usersName
n8n.usersStatus
setup.module.name
```

Rules:

- keep `hermes.searchSkill`
- keep every `cron.cmd.*.status`
- keep `base.action`, `base.info`, `base.copySuccess`, and other unrelated base keys
- keep `n8n.usersActive`, `n8n.usersDisabled`, and every other user-management key

- [ ] **Step 2: Run the language check after locale cleanup**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure consistent
- keys consistent
- no unused keys introduced

## Task 4: Final Verification

**Files:**

- Verify only

- [ ] **Step 1: Run the full language validation**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`
- `🎉 没有发现未使用的国际化键！`

- [ ] **Step 2: Confirm new common usage exists**

Run:

```bash
rg -n "common\.(label\.(name|status)|action\.search)" src/render src/main src/fork
```

Expected:

- matches in the migrated files

- [ ] **Step 3: Confirm old Wave 3 references are gone**

Run:

```bash
rg -n "I18nT\('(?:base\.name|hermes\.name|n8n\.usersName|setup\.module\.name|base\.status|hermes\.status|n8n\.usersStatus|cron\.status|base\.placeholderSearch|flutter\.search|hermes\.search)'\)|\$t\('(?:base\.name|base\.placeholderSearch)'\)" src/render src/main src/fork
```

Expected:

- no matches

- [ ] **Step 4: Inspect diff scope**

Run:

```bash
git diff --stat
```

Expected:

- all locale `common.json` files updated
- targeted locale module files cleaned up
- only the listed render files changed
