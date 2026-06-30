# i18n Common Key Wave 10 Source Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared source label key, migrate the remaining safe source/provenance label call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave limited to provenance-like `Source` labels only: `cron.taskSource`, `flutter.source`, and `hermes.source`. Explicitly exclude `nodejs.registry`, because it is a registry/mirror-source setting label with different semantics and much larger locale drift, especially in `zh` and `zh-hant`. Introduce `common.label.source`, populate it with a deterministic locale-aware majority rule, switch the matching renderer labels to the new key, then delete the replaced locale keys.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave10-source-label.md`
- `src/lang/*/common.json`
- `src/lang/*/cron.json`
- `src/lang/*/flutter.json`
- `src/lang/*/hermes.json`
- `src/render/components/Cron/SystemTaskTable.vue`
- `src/render/components/Flutter/General.vue`
- `src/render/components/Hermes/Sessions.vue`
- `src/render/components/Hermes/SkillsAll.vue`
- `src/render/components/Hermes/SkillsInstalled.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.label\\.source" src/render src/main src/fork`
- `rg -n "I18nT\\('cron\\.taskSource'\\)|I18nT\\('flutter\\.source'\\)|I18nT\\('hermes\\.source'\\)" src/render src/main src/fork`

## Task 1: Confirm the Wave 10 Scope

**Files:**

- Test: `src/lang/**/*`
- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old source references exist before editing**

Run:

```bash
rg -n "I18nT\('cron\.taskSource'\)|I18nT\('flutter\.source'\)|I18nT\('hermes\.source'\)" src/render src/main src/fork
```

Expected:

- matches in the files listed in the file map

- [ ] **Step 2: Confirm `nodejs.registry` stays out of this wave**

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
    cron: readJson(path.join(root, locale, 'cron.json')),
    flutter: readJson(path.join(root, locale, 'flutter.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    nodejs: readJson(path.join(root, locale, 'nodejs.json'))
  }

  const values = {
    cronTaskSource: getPath(files, 'cron.taskSource'),
    flutterSource: getPath(files, 'flutter.source'),
    hermesSource: getPath(files, 'hermes.source'),
    nodejsRegistry: getPath(files, 'nodejs.registry')
  }

  const safeUniq = [...new Set([values.cronTaskSource, values.flutterSource, values.hermesSource].filter(Boolean))]
  if (safeUniq.length > 1 || values.nodejsRegistry !== values.flutterSource) {
    console.log(locale, JSON.stringify(values))
  }
}
```

Expected:

- a small drift set across the three safe source labels
- clear evidence that `nodejs.registry` is a different semantic bucket and should remain separate

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Modify: `src/lang/*/cron.json`
- Modify: `src/lang/*/flutter.json`
- Modify: `src/lang/*/hermes.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.label.source` with locale-aware source rules**

Use these rules:

1. Collect `cron.taskSource`, `flutter.source`, and `hermes.source`.
2. For non-English locales, if any candidate is not exactly `Source`, drop the exact `Source` candidates before deciding.
3. Choose the most frequent exact value from the remaining pool.
4. If there is a tie, break it with this priority:
   `cron.taskSource` -> `flutter.source` -> `hermes.source`

Reason:

- the three safe keys all label provenance/source in the UI
- several non-English locales still contain raw `Source` in one or two modules while another module already has a localized term
- filtering raw English `Source` values avoids regressing a localized label into English during deduplication

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
    cron: readJson(path.join(root, locale, 'cron.json')),
    flutter: readJson(path.join(root, locale, 'flutter.json')),
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const priority = [
    getPath(files, 'cron.taskSource'),
    getPath(files, 'flutter.source'),
    getPath(files, 'hermes.source')
  ].filter(Boolean)

  const filtered =
    locale !== 'en' && priority.some((value) => value !== 'Source')
      ? priority.filter((value) => value !== 'Source')
      : priority

  const value = chooseMostFrequent(filtered, priority)
  if (!value) throw new Error(`Missing source label for ${locale}`)

  setPath(files.common, 'label.source', value)
  deletePath(files.cron, 'taskSource')
  deletePath(files.flutter, 'source')
  deletePath(files.hermes, 'source')

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(files.common, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'cron.json'), `${JSON.stringify(files.cron, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'flutter.json'), `${JSON.stringify(files.flutter, null, 2)}\n`)
  fs.writeFileSync(path.join(root, locale, 'hermes.json'), `${JSON.stringify(files.hermes, null, 2)}\n`)
}
```

- [ ] **Step 3: Verify the language pack structure after adding the key**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- `common.label.source` appears as unused until the call sites migrate

## Task 3: Migrate the Call Sites

**Files:**

- Modify: the renderer files listed in the file map
- Test: `rg -n "I18nT\\('cron\\.taskSource'\\)|I18nT\\('flutter\\.source'\\)|I18nT\\('hermes\\.source'\)" src/render src/main src/fork`

- [ ] **Step 1: Replace all safe source-label call sites**

Apply only these replacements:

```text
I18nT('cron.taskSource') -> I18nT('common.label.source')
I18nT('flutter.source') -> I18nT('common.label.source')
I18nT('hermes.source') -> I18nT('common.label.source')
```

Do not replace:

```text
I18nT('nodejs.registry')
I18nT('flutter.sourcePath')
I18nT('flutter.sourceDefault')
I18nT('flutter.sourceCustom')
I18nT('flutter.sourceFlyenv')
I18nT('flutter.sourceUnknown')
```

- [ ] **Step 2: Verify the old source references are gone**

Run:

```bash
rg -n "I18nT\('cron\.taskSource'\)|I18nT\('flutter\.source'\)|I18nT\('hermes\.source'\)" src/render src/main src/fork
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
rg -n "common\.label\.source" src/render src/main src/fork
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

- the `Source / 来源` candidate disappears
- `nodejs.registry` remains available for a later, separately scoped source/registry wave if needed
