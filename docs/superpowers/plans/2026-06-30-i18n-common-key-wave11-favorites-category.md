# i18n Common Key Wave 11 Favorites Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared favorites category key, migrate the safe favorites headings in the tools UI, and remove the replaced duplicate locale keys.

**Architecture:** Keep this wave limited to the tools favorites category UI: the left sidebar favorites group and the home-page favorites section heading. Introduce `common.category.favorites` as the canonical shared label, populate it from the existing category-oriented `toolType.Favorites` values, migrate `Tools/Index.vue` to use the new common key, delete `tools.FavoriteTools` and `toolType.Favorites`, and remove the unused `toolType.Favorite` key as part of the same cleanup. Do not change other tool category labels.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation script

---

## File Map

**Modify**

- `docs/superpowers/plans/2026-06-30-i18n-common-key-wave11-favorites-category.md`
- `src/lang/*/common.json`
- `src/lang/*/toolType.json`
- `src/lang/*/tools.json`
- `src/render/components/Tools/Index.vue`

**Verify**

- `node src/lang/check.mjs`
- `rg -n "common\\.category\\.favorites" src/render src/main src/fork`
- `rg -n "toolType\\.Favorite|toolType\\.Favorites|tools\\.FavoriteTools" src/render src/main src/fork`

## Task 1: Confirm the Wave 11 Scope

**Files:**

- Test: `src/lang/**/*`
- Test: `src/render/**/*`

- [ ] **Step 1: Confirm the current favorites references**

Run:

```bash
rg -n "toolType\.Favorite|toolType\.Favorites|tools\.FavoriteTools" src/render src/main src/fork src/lang
```

Expected:

- `src/render/components/Tools/Index.vue` contains the real UI usage for `toolType.Favorites` and `tools.FavoriteTools`
- locale files still contain `toolType.Favorite`, `toolType.Favorites`, and `tools.FavoriteTools`

- [ ] **Step 2: Confirm `toolType.Favorite` is unused in app code**

Run:

```bash
rg -n "toolType\.Favorite\b" src/render src/main src/fork
```

Expected:

- no matches

- [ ] **Step 3: Confirm `tools.FavoriteTools` is a heading, not a distinct concept**

Inspect `src/render/components/Tools/Index.vue` and verify:

- the sidebar favorites group uses `toolType.Favorites`
- the home-page favorites block uses `tools.FavoriteTools`
- both refer to the same saved favorites collection in `AppToolStore.like`

Expected:

- evidence that one common category label can safely cover both UI surfaces

## Task 2: Add the Canonical Key

**Files:**

- Modify: `src/lang/*/common.json`
- Modify: `src/lang/*/toolType.json`
- Modify: `src/lang/*/tools.json`
- Test: `node src/lang/check.mjs`

- [ ] **Step 1: Populate `common.category.favorites` with category-first source rules**

Use these rules:

1. Prefer `toolType.Favorites`.
2. If it is missing, fall back to `tools.FavoriteTools`.
3. If both are missing, fall back to `toolType.Favorite`.

Reason:

- `toolType.Favorites` is already the shorter category label used for the favorites group
- `tools.FavoriteTools` is a longer page heading variant of the same concept
- `toolType.Favorite` is unused and only serves as an emergency fallback for malformed locales

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
  const toolTypePath = path.join(root, locale, 'toolType.json')
  const toolsPath = path.join(root, locale, 'tools.json')
  const commonPath = path.join(root, locale, 'common.json')

  const toolType = readJson(toolTypePath)
  const tools = readJson(toolsPath)
  const common = readJson(commonPath)

  const value = toolType.Favorites || tools.FavoriteTools || toolType.Favorite
  if (!value) throw new Error(`Missing favorites category source for ${locale}`)

  setPath(common, 'category.favorites', value)
  deletePath(toolType, 'Favorites')
  deletePath(toolType, 'Favorite')
  deletePath(tools, 'FavoriteTools')

  fs.writeFileSync(commonPath, `${JSON.stringify(common, null, 2)}\n`)
  fs.writeFileSync(toolTypePath, `${JSON.stringify(toolType, null, 2)}\n`)
  fs.writeFileSync(toolsPath, `${JSON.stringify(tools, null, 2)}\n`)
}
```

- [ ] **Step 3: Verify the language pack structure after adding the key**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- structure and key checks stay green
- `common.category.favorites` appears as unused until the renderer migration happens

## Task 3: Migrate the Tools UI

**Files:**

- Modify: `src/render/components/Tools/Index.vue`
- Test: `rg -n "toolType\\.Favorite|toolType\\.Favorites|tools\\.FavoriteTools" src/render src/main src/fork`

- [ ] **Step 1: Add an explicit i18n key override for top-level aside groups**

Update the local `AsideTreeDataType` shape to support an optional shared i18n key for top-level labels, and render that key when present before falling back to the existing `toolType.*` convention.

- [ ] **Step 2: Point the favorites group and home favorites section to the common key**

Apply these UI changes:

```text
sidebar favorites group label -> common.category.favorites
home favorites section heading -> common.category.favorites
```

Keep other groups on the existing `toolType.*` path.

- [ ] **Step 3: Verify the old favorites references are gone from app code**

Run:

```bash
rg -n "toolType\.Favorite|toolType\.Favorites|tools\.FavoriteTools" src/render src/main src/fork
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
rg -n "common\.category\.favorites" src/render src/main src/fork
```

Expected:

- matches in `src/render/components/Tools/Index.vue`

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

- the `我的收藏 / Favorites` candidate disappears
- other existing candidates remain for later waves
