# i18n Common Key Wave 9 Comment Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared comment label key, migrate the remaining safe comment label and one-word placeholder call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave limited to the `Comment` subset only: `host.comment`, `host.placeholderComment`, and `setup.module.comment`. Exclude `base.remark`, because it drifts from `Comment` in English and several locales, so forcing it into the same canonical key would lose existing meaning. Introduce `common.label.comment`, populate it with a deterministic majority rule across the safe sources, switch matching renderer labels and identical one-word placeholders to the new key, then delete the replaced locale keys.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave9-comment-label.md`
- `src/lang/*/common.json`
- `src/lang/*/host.json`
- `src/lang/*/setup.json`
- `src/render/components/CustomerModule/List.vue`
- `src/render/components/Host/Edit.vue`
- `src/render/components/Host/ListTable.vue`
- `src/render/components/Host/Tomcat/Edit.vue`
- `src/render/components/Host/Tomcat/ListTable.vue`
- `src/render/components/LanguageProjects/ProjectEdit.vue`
- `src/render/components/LanguageProjects/index.vue`
- `src/render/components/Mysql/Manage/database.vue`
- `src/render/components/Podman/compose-build/Base.vue`
- `src/render/components/Podman/compose/compose.vue`
- `src/render/components/Podman/compose/composeAdd.vue`
- `src/render/components/RoadRunner/ProjectEdit.vue`
- `src/render/components/Setup/Module/module/moduleExecItemAdd.vue`
- `src/render/components/SwooleCli/ProjectEdit.vue`
- `src/render/components/Tools/CodeLibrary/codeAdd.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.label\\.comment" src/render src/main src/fork`
- `rg -n "I18nT\\('host\\.comment'\\)|I18nT\\('host\\.placeholderComment'\\)|I18nT\\('setup\\.module\\.comment'\\)" src/render src/main src/fork`

## Task 1: Confirm the Wave 9 Scope

**Files:**

- Test: `src/lang/**/*`
- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old comment references exist before editing**

Run:

```bash
rg -n "I18nT\('host\.comment'\)|I18nT\('host\.placeholderComment'\)|I18nT\('setup\.module\.comment'\)" src/render src/main src/fork
```

Expected:

- matches in the files listed in the file map

- [ ] **Step 2: Confirm `base.remark` stays out of this wave**

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
    setup: readJson(path.join(root, locale, 'setup.json'))
  }

  const values = {
    remark: getPath(files, 'base.remark'),
    comment: getPath(files, 'host.comment'),
    placeholder: getPath(files, 'host.placeholderComment'),
    setupComment: getPath(files, 'setup.module.comment')
  }

  const safeValues = [values.comment, values.placeholder, values.setupComment].filter(Boolean)
  const safeUniq = [...new Set(safeValues)]

  if (values.remark !== values.comment || safeUniq.length > 1) {
    console.log(locale, JSON.stringify(values))
  }
}
```

Expected:

- evidence that `base.remark` is not a stable `Comment` synonym across locales
- a small drift set where `setup.module.comment` differs from the two host keys

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Modify: `src/lang/*/host.json`
- Modify: `src/lang/*/setup.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.label.comment` with a deterministic majority rule**

Use these rules:

1. Collect `host.comment`, `host.placeholderComment`, and `setup.module.comment`.
2. Choose the most frequent exact value.
3. If there is a tie, break it with this priority:
   `host.comment` -> `host.placeholderComment` -> `setup.module.comment`

Reason:

- `host.comment` and `host.placeholderComment` already represent the same short term in current UI
- using a majority rule keeps locales stable where the host pair already agrees
- tie-breaking toward `host.comment` preserves the existing generic label wording

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

function deletePath(obj, keyPath) {
  const parts = keyPath.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]]
    if (!cur || typeof cur !== 'object') return
  }
  delete cur?.[parts.at(-1)]
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
    host: readJson(path.join(root, locale, 'host.json')),
    setup: readJson(path.join(root, locale, 'setup.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const priority = [
    getPath(files, 'host.comment'),
    getPath(files, 'host.placeholderComment'),
    getPath(files, 'setup.module.comment')
  ].filter(Boolean)

  const value = chooseMostFrequent(priority, priority)
  if (!value) throw new Error(`Missing comment source for ${locale}`)

  setPath(files.common, 'label.comment', value)
  deletePath(files.host, 'comment')
  deletePath(files.host, 'placeholderComment')
  deletePath(files.setup, 'module.comment')

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(files.common, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'host.json'), `${JSON.stringify(files.host, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'setup.json'), `${JSON.stringify(files.setup, null, 2)}\n`)
}
```

- [ ] **Step 3: Verify the language pack structure after adding the key**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- `common.label.comment` appears as unused until the call sites migrate

## Task 3: Migrate the Call Sites

**Files:**

- Modify: the renderer files listed in the file map
- Test: `rg -n "I18nT\\('host\\.comment'\\)|I18nT\\('host\\.placeholderComment'\\)|I18nT\\('setup\\.module\\.comment'\)" src/render src/main src/fork`

- [ ] **Step 1: Replace all safe comment label and one-word placeholder call sites**

Apply only these replacements:

```text
I18nT('host.comment') -> I18nT('common.label.comment')
I18nT('host.placeholderComment') -> I18nT('common.label.comment')
I18nT('setup.module.comment') -> I18nT('common.label.comment')
```

Do not replace:

```text
I18nT('base.remark')
```

- [ ] **Step 2: Verify the old comment references are gone**

Run:

```bash
rg -n "I18nT\('host\.comment'\)|I18nT\('host\.placeholderComment'\)|I18nT\('setup\.module\.comment'\)" src/render src/main src/fork
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
rg -n "common\.label\.comment" src/render src/main src/fork
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

- the `Comment` candidate disappears
- the broader Chinese-only `备注` collision still includes `base.remark` for a later wave
