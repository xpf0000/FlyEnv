# i18n Common Key Wave 6 Reset Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared reset-password action key, migrate the remaining safe reset-password call sites, and remove the replaced locale keys.

**Architecture:** Keep this wave tightly scoped to the `Reset Password` phrase only. `base.resetPassword` is unrelated in multiple locales and will not be merged. Introduce `common.action.resetPassword`, derive it from the already-aligned `n8n` action/title pair, fall back to `mysql.resetPassword` when needed, then migrate both MySQL and N8N UI references to the common key and delete the old locale keys.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave6-reset-password.md`
- `src/lang/*/common.json`
- `src/lang/*/mysql.json`
- `src/lang/*/n8n.json`
- `src/render/components/Mysql/Manage/database.vue`
- `src/render/components/Mysql/Manage/setPassword.vue`
- `src/render/components/N8N/Users.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.action\\.resetPassword" src/render src/main src/fork`
- `rg -n "mysql\\.resetPassword|n8n\\.usersResetPassword(?:Title)?" src/render src/main src/fork`

## Task 1: Capture the Wave 6 Red State

**Files:**

- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the old app references exist before editing**

Run:

```bash
rg -n "mysql\.resetPassword|n8n\.usersResetPassword(?:Title)?" src/render src/main src/fork
```

Expected:

- matches in `Mysql/Manage/database.vue`, `Mysql/Manage/setPassword.vue`, and `N8N/Users.vue`

- [ ] **Step 2: Record the locale drift**

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
    mysql: readJson(path.join(root, locale, 'mysql.json')),
    n8n: readJson(path.join(root, locale, 'n8n.json'))
  }
  const values = [
    ['mysql.resetPassword', getPath(files, 'mysql.resetPassword')],
    ['n8n.usersResetPassword', getPath(files, 'n8n.usersResetPassword')],
    ['n8n.usersResetPasswordTitle', getPath(files, 'n8n.usersResetPasswordTitle')]
  ].filter(([, value]) => value !== undefined)
  const uniq = [...new Set(values.map(([, value]) => value))]
  if (uniq.length > 1) {
    console.log(`\n[${locale}] ${values.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' | ')}`)
  }
}
```

Expected:

- drift output for a subset of locales
- shows why this wave should derive a canonical value instead of blindly copying MySQL

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.action.resetPassword` with deterministic source rules**

Use these rules:

1. Prefer `n8n.usersResetPassword`.
2. If it is missing, fall back to `n8n.usersResetPasswordTitle`.
3. If that is missing, fall back to `mysql.resetPassword`.

Reason:

- `n8n.usersResetPassword` and `n8n.usersResetPasswordTitle` already align in every locale
- using the `n8n` variant preserves both the action label and dialog-title wording without introducing a second common key

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

for (const locale of locales) {
  const files = {
    mysql: readJson(path.join(root, locale, 'mysql.json')),
    n8n: readJson(path.join(root, locale, 'n8n.json')),
    common: readJson(path.join(root, locale, 'common.json'))
  }

  const value =
    getPath(files, 'n8n.usersResetPassword') ||
    getPath(files, 'n8n.usersResetPasswordTitle') ||
    getPath(files, 'mysql.resetPassword')

  if (!value) throw new Error(`Missing reset password source for ${locale}`)
  setPath(files.common, 'action.resetPassword', value)

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
- `common.action.resetPassword` appears as unused until the call sites migrate

## Task 3: Migrate the Call Sites

**Files:**

- Modify: `src/render/components/Mysql/Manage/database.vue`
- Modify: `src/render/components/Mysql/Manage/setPassword.vue`
- Modify: `src/render/components/N8N/Users.vue`
- Test: `rg -n "mysql\\.resetPassword|n8n\\.usersResetPassword(?:Title)?" src/render src/main src/fork`

- [ ] **Step 1: Replace the MySQL reset-password labels**

Apply only these replacements:

```text
I18nT('mysql.resetPassword') -> I18nT('common.action.resetPassword')
```

- [ ] **Step 2: Replace the N8N reset-password action and title**

Apply only these replacements:

```text
I18nT('n8n.usersResetPassword') -> I18nT('common.action.resetPassword')
I18nT('n8n.usersResetPasswordTitle') -> I18nT('common.action.resetPassword')
```

- [ ] **Step 3: Verify the old app references are gone**

Run:

```bash
rg -n "mysql\.resetPassword|n8n\.usersResetPassword(?:Title)?" src/render src/main src/fork
```

Expected:

- only the success/failure/tips/confirm keys remain
- no remaining matches for the migrated label/title keys

## Task 4: Remove the Replaced Locale Keys

**Files:**

- Modify: `src/lang/*/mysql.json`
- Modify: `src/lang/*/n8n.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Delete the replaced locale keys from every locale**

Remove:

```text
mysql.resetPassword
n8n.usersResetPassword
n8n.usersResetPasswordTitle
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
rg -n "common\.action\.resetPassword" src/render src/main src/fork
```

Expected:

- matches in the migrated MySQL and N8N files
