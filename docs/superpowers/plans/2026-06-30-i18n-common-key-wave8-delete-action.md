# i18n Common Key Wave 8 Delete Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared delete action key, migrate the remaining safe delete-action call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave tightly scoped to user-triggered delete actions only. Merge `base.del` and `podman.Delete` into `common.action.delete`, using a deterministic locale-aware tie-break rule. Explicitly exclude `tools.diff-compare-removed`, because it is a removed-state/stat label in multiple locales rather than a delete action. Migrate all safe renderer call sites, then delete the replaced locale keys.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave8-delete-action.md`
- `src/lang/*/base.json`
- `src/lang/*/common.json`
- `src/lang/*/podman.json`
- `src/render/components/AI/Chat/ASide/index.vue`
- `src/render/components/AI/Prompt/index.vue`
- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/Antigravity/Sessions.vue`
- `src/render/components/ClaudeCode/MCP.vue`
- `src/render/components/ClaudeCode/Sessions.vue`
- `src/render/components/CloudflareTunnel/List.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/Codex/Sessions.vue`
- `src/render/components/CopilotCli/MCP.vue`
- `src/render/components/CopilotCli/Sessions.vue`
- `src/render/components/Cron/ListTable.vue`
- `src/render/components/CustomerModule/List.vue`
- `src/render/components/Host/ListTable.vue`
- `src/render/components/Host/Tomcat/ListTable.vue`
- `src/render/components/Kimi/MCP.vue`
- `src/render/components/Kimi/Sessions.vue`
- `src/render/components/LanguageProjects/index.vue`
- `src/render/components/Mysql/Group/SetupPopper.vue`
- `src/render/components/N8N/Users.vue`
- `src/render/components/OpenCode/MCP.vue`
- `src/render/components/OpenCode/Sessions.vue`
- `src/render/components/PHP/Extension/Homebrew/index.vue`
- `src/render/components/PHP/Extension/Macports/index.vue`
- `src/render/components/Podman/class/Image.ts`
- `src/render/components/Podman/compose/compose.vue`
- `src/render/components/Podman/container/container.vue`
- `src/render/components/Podman/image/image.vue`
- `src/render/components/Podman/left.vue`
- `src/render/components/ServiceManager/EXT/index.vue`
- `src/render/components/Tools/CodeLibrary/content.vue`
- `src/render/components/Tools/CodeLibrary/groupContent.vue`
- `src/render/components/Tools/Index.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.action\\.delete" src/render src/main src/fork`
- `rg -n "I18nT\\('base\\.del'\\)|I18nT\\('podman\\.Delete'\\)" src/render src/main src/fork`

## Task 1: Confirm the Wave 8 Scope

**Files:**

- Test: `src/lang/**/*`
- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old delete action references exist before editing**

Run:

```bash
rg -n "I18nT\('base\.del'\)|I18nT\('podman\.Delete'\)" src/render src/main src/fork
```

Expected:

- matches in the files listed in the file map

- [ ] **Step 2: Confirm `tools.diff-compare-removed` is not an action label**

Run:

```bash
rg -n "tools\.diff-compare-removed" src/lang src/render
```

Expected:

- locale values such as `Removed`, `Removed`, `已删除/已移除`
- usage in `src/render/components/Tools/DiffCompare/Index.vue` as diff stats text, not a delete button label

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Modify: `src/lang/*/base.json`
- Modify: `src/lang/*/podman.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.action.delete` with deterministic source rules**

Use these rules:

1. Read `base.del` and `podman.Delete`.
2. If both values match exactly, use that value.
3. If they differ, prefer `base.del`.

Reason:

- both keys represent a user-triggered delete action
- `base.del` is already the broader generic action term used across more modules
- several locales translate the Podman label slightly differently, so a stable tie-break is required

- [ ] **Step 2: Apply the locale update with a deterministic one-off script**

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

function deletePath(obj, keyPath) {
  const parts = keyPath.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]]
    if (!cur || typeof cur !== 'object') return
  }
  delete cur?.[parts.at(-1)]
}

for (const locale of locales) {
  const files = {
    base: readJson(path.join(root, locale, 'base.json')),
    podman: readJson(path.join(root, locale, 'podman.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const value = files.base.del || files.podman.Delete
  if (!value) throw new Error(`Missing delete action source for ${locale}`)

  setPath(files.common, 'action.delete', value)
  deletePath(files.base, 'del')
  deletePath(files.podman, 'Delete')

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(files.common, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'base.json'), `${JSON.stringify(files.base, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'podman.json'), `${JSON.stringify(files.podman, null, 2)}\n`)
}
```

- [ ] **Step 3: Verify the language pack structure after adding the key**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- `common.action.delete` appears as unused until the call sites migrate

## Task 3: Migrate the Call Sites

**Files:**

- Modify: the renderer files listed in the file map
- Test: `rg -n "I18nT\\('base\\.del'\\)|I18nT\\('podman\\.Delete'\)" src/render src/main src/fork`

- [ ] **Step 1: Replace all safe delete-action call sites**

Apply only these replacements:

```text
I18nT('base.del') -> I18nT('common.action.delete')
I18nT('podman.Delete') -> I18nT('common.action.delete')
```

Do not replace:

```text
I18nT('base.delAlertTitle')
I18nT('base.delAlertContent')
I18nT('tools.diff-compare-removed')
```

- [ ] **Step 2: Verify the old delete action references are gone**

Run:

```bash
rg -n "I18nT\('base\.del'\)|I18nT\('podman\.Delete'\)" src/render src/main src/fork
```

Expected:

- no matches

## Task 4: Final Verification

**Files:**

- Test: `src/lang/**/*`
- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the new key is used in app code**

Run:

```bash
rg -n "common\.action\.delete" src/render src/main src/fork
```

Expected:

- matches in the migrated renderer files

- [ ] **Step 2: Run the i18n validator**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- file structure consistent
- keys consistent
- no unused keys

- [ ] **Step 3: Re-check duplicate candidates for the next wave**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- the `删除 / Delete` candidate disappears
- other existing candidates remain for later waves
