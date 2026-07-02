# i18n Common Key Wave 5 Configuration Workingdir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two more safe shared i18n keys for configuration-category headings and working-directory labels, migrate the remaining low-risk call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave narrower than the original candidate list. `base.configFile`, `conf.rawFile`, and `setup.module.configPath` are not stable synonyms across locales, and `host.runDirectory` is not reliably the same concept as `working directory`, so this wave only introduces `common.category.configuration` from the Hermes/OpenClaw command categories and `common.label.workingDirectory` from the MeiliSearch/Podman working-directory labels. Because the configuration category is referenced from `command.json` via `nameKey`, this wave also extends `src/lang/check.mjs` to scan `.json` files so the validator can see those real i18n usages.

**Tech Stack:** TypeScript, Vue 3, JSON command configs, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave5-configuration-workingdir.md`
- `src/lang/check.mjs`
- `src/lang/*/common.json`
- `src/lang/*/hermes.json`
- `src/lang/*/openclaw.json`
- `src/lang/*/meilisearch.json`
- `src/lang/*/podman.json`
- `src/render/components/Hermes/command.json`
- `src/render/components/OpenClaw/command.json`
- `src/render/components/MeiliSearch/Index.vue`
- `src/render/components/Podman/container/info.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.(category\\.configuration|label\\.workingDirectory)" src/render src/main src/fork`
- `rg -n "hermes\\.category\\.configuration|openclaw\\.category\\.configuration|I18nT\\('meilisearch\\.working_dir'\\)|I18nT\\('podman\\.container\\.workDir'\\)" src/render src/main src/fork`

## Task 1: Capture the Wave 5 Red State

**Files:**

- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old key usage exists before editing**

Run:

```bash
rg -n "hermes\.category\.configuration|openclaw\.category\.configuration|I18nT\('meilisearch\.working_dir'\)|I18nT\('podman\.container\.workDir'\)" src/render src/main src/fork
```

Expected:

- matches in `Hermes/command.json`, `OpenClaw/command.json`, `MeiliSearch/Index.vue`, and `Podman/container/info.vue`

- [ ] **Step 2: Record the remaining locale drift**

Run a one-off script shaped like:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src', 'lang')
const locales = fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())
const groups = {
  configurationCategory: ['hermes.category.configuration', 'openclaw.category.configuration'],
  workingDirectory: ['meilisearch.working_dir', 'podman.container.workDir']
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function getPath(obj, keyPath) {
  return keyPath.split('.').reduce((cur, key) => cur?.[key], obj)
}

for (const locale of locales) {
  const files = {}
  for (const name of ['hermes', 'openclaw', 'meilisearch', 'podman']) {
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

- only a small subset of locales drift
- confirms why this wave uses deterministic source rules instead of one blind copy

## Task 2: Add the Canonical Wave 5 Keys

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.category.configuration`**

Use this rule:

1. Copy from `hermes.category.configuration`.
2. If it is missing, fall back to `openclaw.category.configuration`.

Reason:

- the shared canonical key is a reusable category heading, not an OpenClaw-specific “configuration management” phrase
- Hermes already provides the shorter generic wording in the locales where drift exists

- [ ] **Step 2: Populate `common.label.workingDirectory`**

Use these rules in order:

1. For locale `az`, copy from `meilisearch.working_dir`.
2. Otherwise prefer the first good localized value from `podman.container.workDir`, then `meilisearch.working_dir`.
3. For non-English locales, reject the exact English string `Working Directory`.
4. For locale `tr`, reject `meilisearch.working_dir` if it contains `Rehber`.
5. If no localized value survives, fall back to `podman.container.workDir`, then `meilisearch.working_dir`.

- [ ] **Step 3: Apply the updates with a deterministic one-off script**

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

function isGoodWorkingDirectory(locale, value) {
  if (!value) return false
  const text = String(value).trim()
  if (!text) return false
  if (locale !== 'en' && text === 'Working Directory') return false
  if (locale === 'tr' && text.includes('Rehber')) return false
  return true
}

for (const locale of locales) {
  const files = {
    hermes: readJson(path.join(root, locale, 'hermes.json')),
    openclaw: readJson(path.join(root, locale, 'openclaw.json')),
    meilisearch: readJson(path.join(root, locale, 'meilisearch.json')),
    podman: readJson(path.join(root, locale, 'podman.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const configurationValue =
    getPath(files, 'hermes.category.configuration') ||
    getPath(files, 'openclaw.category.configuration')
  if (!configurationValue) throw new Error(`Missing configuration category for ${locale}`)
  setPath(files.common, 'category.configuration', configurationValue)

  let workingDirectoryValue
  if (locale === 'az') {
    workingDirectoryValue = getPath(files, 'meilisearch.working_dir')
  } else {
    workingDirectoryValue = [
      getPath(files, 'podman.container.workDir'),
      getPath(files, 'meilisearch.working_dir')
    ].find((value) => isGoodWorkingDirectory(locale, value))
  }
  if (!workingDirectoryValue) {
    workingDirectoryValue =
      getPath(files, 'podman.container.workDir') || getPath(files, 'meilisearch.working_dir')
  }
  if (!workingDirectoryValue) throw new Error(`Missing working directory label for ${locale}`)
  setPath(files.common, 'label.workingDirectory', workingDirectoryValue)

  fs.writeFileSync(path.join(root, locale, 'common.json'), `${JSON.stringify(files.common, null, 2)}\n`)
}
```

- [ ] **Step 4: Verify the language pack structure after adding the keys**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- the new keys show as unused until call sites migrate

## Task 3: Teach `check.mjs` to See `command.json` Key Usage

**Files:**

- Modify: `src/lang/check.mjs`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Extend the strict usage scan to include JSON command config files**

Change:

```js
const FILE_EXTENSIONS = ['.vue', '.js', '.ts', '.mjs']
```

to:

```js
const FILE_EXTENSIONS = ['.vue', '.js', '.ts', '.mjs', '.json']
```

Reason:

- `Hermes/command.json` and `OpenClaw/command.json` contain real `nameKey` i18n references
- locale JSON files do not contain full `file.key` literals, so scanning `.json` does not create false usage from the language packs themselves

- [ ] **Step 2: Re-run the validator before locale cleanup**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- `common.category.configuration` is counted as used
- the only remaining unused keys in this wave are the old `meilisearch.working_dir` and `podman.container.workDir`

## Task 4: Migrate the Call Sites

**Files:**

- Modify: `src/render/components/Hermes/command.json`
- Modify: `src/render/components/OpenClaw/command.json`
- Modify: `src/render/components/MeiliSearch/Index.vue`
- Modify: `src/render/components/Podman/container/info.vue`
- Test: `rg -n "hermes\\.category\\.configuration|openclaw\\.category\\.configuration|I18nT\\('meilisearch\\.working_dir'\\)|I18nT\\('podman\\.container\\.workDir'\\)" src/render src/main src/fork`

- [ ] **Step 1: Replace the configuration category keys**

Apply only these replacements:

```text
hermes.category.configuration -> common.category.configuration
openclaw.category.configuration -> common.category.configuration
```

- [ ] **Step 2: Replace the working-directory labels**

Apply only these replacements:

```text
I18nT('meilisearch.working_dir') -> I18nT('common.label.workingDirectory')
I18nT('podman.container.workDir') -> I18nT('common.label.workingDirectory')
```

- [ ] **Step 3: Verify the old app references are gone**

Run:

```bash
rg -n "hermes\.category\.configuration|openclaw\.category\.configuration|I18nT\('meilisearch\.working_dir'\)|I18nT\('podman\.container\.workDir'\)" src/render src/main src/fork
```

Expected:

- no matches

## Task 5: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/hermes.json`
- Modify: `src/lang/*/openclaw.json`
- Modify: `src/lang/*/meilisearch.json`
- Modify: `src/lang/*/podman.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete the replaced locale keys from every locale**

Remove:

```text
hermes.category.configuration
openclaw.category.configuration
meilisearch.working_dir
podman.container.workDir
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
rg -n "common\.(category\.configuration|label\.workingDirectory)" src/render src/main src/fork
```

Expected:

- matches only in the migrated files for this wave
