# i18n Common Key Wave 2 Actions and Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared `common` i18n namespace with a small second wave of safe generic action/category keys, migrate all corresponding call sites, and delete the replaced duplicate locale keys.

**Architecture:** Reuse the existing `src/lang/<locale>/common.json` namespace and add only four low-risk Wave 2 keys: `common.action.copy`, `common.action.preview`, `common.category.mcp`, and `common.category.skills`. Populate them from existing locale values, switch every matching UI/menu call site to the new keys, then remove the replaced module keys from locale JSON files so the repo does not keep runtime aliases.

**Tech Stack:** TypeScript, Vue 3, Electron menu JSON, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave2-actions-categories.md`
- `src/lang/*/common.json`
- `src/lang/*/antigravity.json`
- `src/lang/*/base.json`
- `src/lang/*/codex.json`
- `src/lang/*/flutter.json`
- `src/lang/*/hermes.json`
- `src/lang/*/kimi.json`
- `src/lang/*/menu.json`
- `src/lang/*/token-generator.json`
- `src/main/menus/darwin.json`
- `src/render/components/AI/Chat/ASide/index.vue`
- `src/render/components/AI/Prompt/index.vue`
- `src/render/components/Antigravity/Index.vue`
- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/Antigravity/Skills.vue`
- `src/render/components/Codex/Index.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/CopilotCli/Skills.vue`
- `src/render/components/Flutter/EditProject.vue`
- `src/render/components/Flutter/General.vue`
- `src/render/components/Hermes/Index.vue`
- `src/render/components/Hermes/SkillInspect.vue`
- `src/render/components/Hermes/Skills.vue`
- `src/render/components/Hermes/SkillsAll.vue`
- `src/render/components/Hermes/command.json`
- `src/render/components/Kimi/Index.vue`
- `src/render/components/Kimi/MCP.vue`
- `src/render/components/N8N/Users.vue`
- `src/render/components/Podman/compose-build/components/preview.vue`
- `src/render/components/Podman/container/preview.vue`
- `src/render/components/Setup/ProxySet/index.vue`
- `src/render/components/Tools/TokenGenerator/index.vue`
- `src/render/components/Tools/UrlEncode/index.vue`
- `src/render/components/Host/Link.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.(action\\.(copy|preview)|category\\.(mcp|skills))" src/main src/render`
- `rg -n "(base\\.copy|base\\.preview|token-generator\\.button\\.copy|menu\\.copy|flutter\\.preview|hermes\\.preview|antigravity\\.mcp|codex\\.mcp|kimi\\.mcp|hermes\\.category\\.mcp|antigravity\\.skills|hermes\\.skills)" src/main src/render`

## Task 1: Add Wave 2 Keys to `common.json`

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Confirm the Wave 2 keys do not exist yet**

Run:

```bash
rg -n '"(copy|preview|mcp|skills)"' src/lang/*/common.json
```

Expected:

- no `action.copy`
- no `action.preview`
- no `category.mcp`
- no `category.skills`

- [ ] **Step 2: Add the new keys to every locale from existing locale values**

Use this source mapping:

```js
const FIELD_SOURCES = {
  'action.copy': ['base.copy', 'menu.copy'],
  'action.preview': ['base.preview', 'flutter.preview', 'hermes.preview'],
  'category.mcp': ['codex.mcp', 'kimi.mcp', 'antigravity.mcp', 'hermes.category.mcp'],
  'category.skills': ['antigravity.skills', 'hermes.skills']
}
```

Use a deterministic one-off script shaped like:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())

const FIELD_SOURCES = {
  'action.copy': ['base.copy', 'menu.copy'],
  'action.preview': ['base.preview', 'flutter.preview', 'hermes.preview'],
  'category.mcp': ['codex.mcp', 'kimi.mcp', 'antigravity.mcp', 'hermes.category.mcp'],
  'category.skills': ['antigravity.skills', 'hermes.skills']
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
    antigravity: readJson(path.join(root, locale, 'antigravity.json')),
    base: readJson(path.join(root, locale, 'base.json')),
    codex: readJson(path.join(root, locale, 'codex.json')),
    flutter: readJson(path.join(root, locale, 'flutter.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    kimi: readJson(path.join(root, locale, 'kimi.json')),
    menu: readJson(path.join(root, locale, 'menu.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const common = files.common

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

- [ ] **Step 3: Run the language check after adding the keys**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- `✅ 所有语言包文件结构一致`
- `✅ 所有语言包键完全一致`

## Task 2: Migrate Wave 2 Call Sites to `common.*`

**Files:**

- Modify: `src/main/menus/darwin.json`
- Modify: `src/render/components/AI/Chat/ASide/index.vue`
- Modify: `src/render/components/AI/Prompt/index.vue`
- Modify: `src/render/components/Antigravity/Index.vue`
- Modify: `src/render/components/Antigravity/MCP.vue`
- Modify: `src/render/components/Antigravity/Skills.vue`
- Modify: `src/render/components/Codex/Index.vue`
- Modify: `src/render/components/Codex/MCP.vue`
- Modify: `src/render/components/CopilotCli/Skills.vue`
- Modify: `src/render/components/Flutter/EditProject.vue`
- Modify: `src/render/components/Flutter/General.vue`
- Modify: `src/render/components/Hermes/Index.vue`
- Modify: `src/render/components/Hermes/SkillInspect.vue`
- Modify: `src/render/components/Hermes/Skills.vue`
- Modify: `src/render/components/Hermes/SkillsAll.vue`
- Modify: `src/render/components/Hermes/command.json`
- Modify: `src/render/components/Kimi/Index.vue`
- Modify: `src/render/components/Kimi/MCP.vue`
- Modify: `src/render/components/N8N/Users.vue`
- Modify: `src/render/components/Podman/compose-build/components/preview.vue`
- Modify: `src/render/components/Podman/container/preview.vue`
- Modify: `src/render/components/Tools/TokenGenerator/index.vue`
- Test: `rg -n "(base\\.copy|base\\.preview|token-generator\\.button\\.copy|menu\\.copy|flutter\\.preview|hermes\\.preview|antigravity\\.mcp|codex\\.mcp|kimi\\.mcp|hermes\\.category\\.mcp|antigravity\\.skills|hermes\\.skills)" src/main src/render`

- [ ] **Step 1: Capture the pre-migration matches**

Run:

```bash
rg -n "(base\.copy|base\.preview|token-generator\.button\.copy|menu\.copy|flutter\.preview|hermes\.preview|antigravity\.mcp|codex\.mcp|kimi\.mcp|hermes\.category\.mcp|antigravity\.skills|hermes\.skills)" src/main src/render
```

Expected:

- matches in the files listed above

- [ ] **Step 2: Replace all Wave 2 action call sites**

Apply only these replacements:

```text
I18nT('base.copy') -> I18nT('common.action.copy')
$t('base.copy') -> $t('common.action.copy')
I18nT('token-generator.button.copy') -> I18nT('common.action.copy')
menu.copy -> common.action.copy

I18nT('base.preview') -> I18nT('common.action.preview')
I18nT('flutter.preview') -> I18nT('common.action.preview')
I18nT('hermes.preview') -> I18nT('common.action.preview')
```

- [ ] **Step 3: Replace all Wave 2 category call sites**

Apply only these replacements:

```text
I18nT('antigravity.mcp') -> I18nT('common.category.mcp')
I18nT('codex.mcp') -> I18nT('common.category.mcp')
I18nT('kimi.mcp') -> I18nT('common.category.mcp')
"nameKey": "hermes.category.mcp" -> "nameKey": "common.category.mcp"

I18nT('antigravity.skills') -> I18nT('common.category.skills')
I18nT('hermes.skills') -> I18nT('common.category.skills')
```

- [ ] **Step 4: Verify that the old Wave 2 code references are gone**

Run:

```bash
rg -n "(base\.copy|base\.preview|token-generator\.button\.copy|menu\.copy|flutter\.preview|hermes\.preview|antigravity\.mcp|codex\.mcp|kimi\.mcp|hermes\.category\.mcp|antigravity\.skills|hermes\.skills)" src/main src/render
```

Expected:

- no matches

## Task 3: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/antigravity.json`
- Modify: `src/lang/*/base.json`
- Modify: `src/lang/*/codex.json`
- Modify: `src/lang/*/flutter.json`
- Modify: `src/lang/*/hermes.json`
- Modify: `src/lang/*/kimi.json`
- Modify: `src/lang/*/menu.json`
- Modify: `src/lang/*/token-generator.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete only the exact keys replaced in Task 2**

Remove these exact keys from every locale:

```text
base.copy
base.preview
menu.copy
token-generator.button.copy
flutter.preview
hermes.preview
antigravity.mcp
antigravity.skills
codex.mcp
kimi.mcp
hermes.skills
hermes.category.mcp
```

Rules:

- keep `base.copySuccess`, `base.copyLink`, and every non-Wave-2 key
- keep `flutter.previewChanges`
- keep every Hermes category except `category.mcp`
- if an object becomes empty, remove the empty object too

- [ ] **Step 2: Run the language check after locale cleanup**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure consistent
- keys consistent
- no unused keys introduced by the migration

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
rg -n "common\.(action\.(copy|preview)|category\.(mcp|skills))" src/main src/render
```

Expected:

- matches in menu/components updated by Task 2

- [ ] **Step 3: Confirm old Wave 2 references are gone**

Run:

```bash
rg -n "(base\.copy|base\.preview|token-generator\.button\.copy|menu\.copy|flutter\.preview|hermes\.preview|antigravity\.mcp|codex\.mcp|kimi\.mcp|hermes\.category\.mcp|antigravity\.skills|hermes\.skills)" src/main src/render
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
- only the listed menu/render call sites changed
