# Lazy Locale Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load only English and the active FlyEnv locale in each process while preserving immediate, restart-free switching across the main window, tray UI, native menus, and utility-process forks.

**Architecture:** Build one external JSON asset per built-in locale. A main-process repository validates and loads those assets, while a coordinator implements prepare/commit switching and distributes validated payloads to renderer and fork runtimes. Vue I18n remains the synchronous translation engine, but locale payload loading becomes explicitly asynchronous.

**Tech Stack:** TypeScript 5.8, Electron 39 utility processes and IPC, Vue 3, Vue I18n 11, Element Plus 2.11, Pinia, esbuild, Vite, Node `assert`, and `tsx` script-based tests.

---

## File Structure

### New production files

- `src/lang/catalog.ts` — built-in locale metadata, aliases, normalization, and fallback constant; no translation payload imports.
- `src/lang/types.ts` — existing compile-time `LangKey` derivation moved out of the runtime entry.
- `src/lang/runtime.ts` — one empty Vue I18n instance plus synchronous install, activate, release, and translation functions.
- `src/shared/LanguageProtocol.ts` — locale asset, manifest, prepare/commit, broadcast, and acknowledgement types and validators.
- `src/main/core/LanguageRepository.ts` — built-in/custom locale filesystem loading, validation, in-flight deduplication, and bounded cache.
- `src/main/core/LanguageCoordinator.ts` — startup initialization and prepare/commit transaction ownership.
- `src/render/core/LanguageService.ts` — renderer IPC client, stale-request protection, runtime installation, and Element Plus synchronization.
- `src/fork/LanguageService.ts` — fork initialization/broadcast application and acknowledgement.
- `scripts/build-language-assets.ts` — deterministic locale asset and manifest generation.
- `scripts/language-memory-benchmark.ts` — repeatable fresh-process RSS comparison.

### New focused tests

- `scripts/language-assets-test.ts`
- `scripts/language-runtime-test.ts`
- `scripts/language-repository-test.ts`
- `scripts/language-coordinator-test.ts`
- `scripts/language-build-hook-test.ts`
- `scripts/language-renderer-test.ts`
- `scripts/language-fork-test.ts`
- `scripts/language-bundle-audit-test.ts`

### Existing files with integration changes

- `package.json`
- `configs/vite.config.ts`
- `scripts/dev-runner.ts`
- `scripts/app-builder.ts`
- `src/lang/index.ts`
- `src/lang/render.ts`
- `src/main/Launcher.ts`
- `src/main/Application.ts`
- `src/main/core/ConfigManager.ts`
- `src/main/core/IPCHandler.ts`
- `src/main/core/ForkManager.ts`
- `src/main/core/ServerManager.ts`
- `src/main/core/AppNodeFn.ts`
- `src/main/core/CustomerLang.ts` (deleted after its payload cache is replaced)
- `src/main/core/Capturer.ts`
- `src/main/core/OAuth.ts`
- `src/main/core/UpdateManager.ts`
- `src/main/ui/TrayManager.ts`
- `src/main/utils/menu.ts`
- `src/fork/index.ts`
- `src/render/main.ts`
- `src/render/tray.main.ts`
- `src/render/core/VueExtend.ts`
- `src/render/components/Main.vue`
- `src/render/components/Setup/LangSet/index.vue`
- `src/render/components/Setup/LangSet/setup.ts`
- `src/render/util/NodeFn.ts`

## Implementation Rules

- Keep `I18nT()` synchronous everywhere.
- Do not put locale payload imports in `catalog.ts`, `runtime.ts`, or the final `index.ts`.
- Do not persist a requested locale until prepare and commit succeed.
- Use `setLocaleMessage(previousLocale, {})` to release a previous payload; Vue I18n 11 has no public removal API.
- Keep English and the active locale only. In-flight Promises are removed in `finally` blocks.
- Do not let `ConfigManager.setConfig()` perform language work.
- Run the focused failing test before each implementation step.
- Commit only files named in the task's commit step; preserve unrelated working-tree changes.

---

### Task 1: Generate Independent Built-In Locale Assets

**Files:**
- Create: `src/lang/catalog.ts`
- Create: `scripts/build-language-assets.ts`
- Create: `scripts/language-assets-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing asset-generation test**

Create `scripts/language-assets-test.ts`:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildLanguageAssets } from './build-language-assets'

const root = await mkdtemp(join(tmpdir(), 'flyenv-language-assets-'))
const sourceRoot = join(root, 'source')
const outputRoot = join(root, 'output')

const writeLocale = async (directory: string, baseValue: string) => {
  const localeRoot = join(sourceRoot, directory)
  await mkdir(localeRoot, { recursive: true })
  await writeFile(join(localeRoot, 'base.json'), JSON.stringify({ title: baseValue }))
  await writeFile(join(localeRoot, 'menu.json'), JSON.stringify({ exit: `${baseValue}-exit` }))
}

try {
  await writeLocale('en', 'English')
  await writeLocale('zh', '中文')
  await writeLocale('zh-hant', '繁體中文')

  const result = await buildLanguageAssets({
    sourceRoot,
    outputRoot,
    catalog: {
      en: { label: 'English', sourceDir: 'en' },
      zh: { label: '中文-简体', sourceDir: 'zh' },
      zhhant: { label: '中文-繁体', sourceDir: 'zh-hant' }
    }
  })

  assert.deepEqual(result.locales, ['en', 'zh', 'zhhant'])

  const manifest = JSON.parse(await readFile(join(outputRoot, 'manifest.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.fallbackLocale, 'en')
  assert.equal(manifest.locales.zhhant.file, 'zhhant.json')

  const chinese = JSON.parse(await readFile(join(outputRoot, 'zh.json'), 'utf8'))
  assert.deepEqual(chinese, {
    schemaVersion: 1,
    locale: 'zh',
    messages: {
      base: { title: '中文' },
      menu: { exit: '中文-exit' }
    }
  })

  await assert.rejects(
    () =>
      buildLanguageAssets({
        sourceRoot,
        outputRoot: join(root, 'missing-fallback'),
        catalog: { zh: { label: '中文-简体', sourceDir: 'zh' } }
      }),
    /English fallback locale is required/
  )

  await writeFile(join(sourceRoot, 'zh', 'broken.json'), '{')
  await assert.rejects(
    () =>
      buildLanguageAssets({
        sourceRoot,
        outputRoot: join(root, 'broken-output'),
        catalog: {
          en: { label: 'English', sourceDir: 'en' },
          zh: { label: '中文-简体', sourceDir: 'zh' }
        }
      }),
    /Invalid locale JSON/
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('language asset tests passed')
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npx tsx scripts/language-assets-test.ts
```

Expected: FAIL because `scripts/build-language-assets.ts` does not exist.

- [ ] **Step 3: Add the payload-free locale catalog**

Create `src/lang/catalog.ts`:

```ts
export const FALLBACK_LOCALE = 'en'

export const BuiltInLocaleCatalog = {
  ar: { label: 'العربية', sourceDir: 'ar' },
  az: { label: 'Azərbaycanca', sourceDir: 'az' },
  bg: { label: 'Български', sourceDir: 'bg' },
  bn: { label: 'বাংলা', sourceDir: 'bn' },
  cs: { label: 'Čeština', sourceDir: 'cs' },
  da: { label: 'Dansk', sourceDir: 'da' },
  de: { label: 'Deutsch', sourceDir: 'de' },
  el: { label: 'Ελληνικά', sourceDir: 'el' },
  en: { label: 'English', sourceDir: 'en' },
  es: { label: 'Español', sourceDir: 'es' },
  fi: { label: 'Suomi', sourceDir: 'fi' },
  fr: { label: 'Français', sourceDir: 'fr' },
  hr: { label: 'Hrvatski', sourceDir: 'hr' },
  hu: { label: 'Magyar', sourceDir: 'hu' },
  id: { label: 'Bahasa Indonesia', sourceDir: 'id' },
  it: { label: 'Italiano', sourceDir: 'it' },
  ja: { label: '日本語', sourceDir: 'ja' },
  ko: { label: '한국어', sourceDir: 'ko' },
  nl: { label: 'Nederlands', sourceDir: 'nl' },
  no: { label: 'Norsk', sourceDir: 'no' },
  pl: { label: 'Polski', sourceDir: 'pl' },
  pt: { label: 'Português', sourceDir: 'pt' },
  'pt-br': { label: 'Português (Brasil)', sourceDir: 'pt-br' },
  ro: { label: 'Romainiană', sourceDir: 'ro' },
  ru: { label: 'Русский', sourceDir: 'ru' },
  sv: { label: 'Svenska', sourceDir: 'sv' },
  tr: { label: 'Türkçe', sourceDir: 'tr' },
  uk: { label: 'Українська', sourceDir: 'uk' },
  vi: { label: 'Tiếng Việt', sourceDir: 'vi' },
  zh: { label: '中文-简体', sourceDir: 'zh' },
  zhhant: { label: '中文-繁体', sourceDir: 'zh-hant' }
} as const

export type BuiltInLocale = keyof typeof BuiltInLocaleCatalog
export type LocaleCatalog = Readonly<
  Record<string, Readonly<{ label: string; sourceDir: string }>>
>

export const AppAllLang: Record<string, string> = Object.fromEntries(
  Object.entries(BuiltInLocaleCatalog).map(([code, item]) => [code, item.label])
)

export const normalizeLocale = (input?: string): string => {
  const value = (input || FALLBACK_LOCALE).trim().toLowerCase().replaceAll('_', '-')
  const aliases: Record<string, BuiltInLocale> = {
    'pt-br': 'pt-br',
    'zh-hant': 'zhhant',
    'zh-tw': 'zhhant',
    'zh-hk': 'zhhant'
  }
  if (aliases[value]) return aliases[value]
  if (value in BuiltInLocaleCatalog) return value
  const base = value.split('-')[0]
  return base in BuiltInLocaleCatalog ? base : value
}
```

- [ ] **Step 4: Implement deterministic asset generation**

Create `scripts/build-language-assets.ts`:

```ts
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BuiltInLocaleCatalog,
  FALLBACK_LOCALE,
  type LocaleCatalog
} from '../src/lang/catalog'

export interface BuildLanguageAssetsOptions {
  sourceRoot: string
  outputRoot: string
  catalog?: LocaleCatalog
}

const readJsonObject = async (file: string): Promise<Record<string, unknown>> => {
  let value: unknown
  try {
    value = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid locale JSON: ${file}: ${String(error)}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Locale namespace must be an object: ${file}`)
  }
  return value as Record<string, unknown>
}

export const buildLanguageAssets = async ({
  sourceRoot,
  outputRoot,
  catalog = BuiltInLocaleCatalog
}: BuildLanguageAssetsOptions) => {
  if (!catalog[FALLBACK_LOCALE]) {
    throw new Error('English fallback locale is required')
  }

  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const locales = Object.keys(catalog).sort()
  const manifestLocales: Record<string, { file: string; label: string }> = {}

  for (const locale of locales) {
    const descriptor = catalog[locale]
    const directory = join(sourceRoot, descriptor.sourceDir)
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name.endsWith('.json'))
      .map((item) => item.name)
      .sort()

    const messages: Record<string, unknown> = {}
    for (const name of files) {
      const namespace = name.slice(0, -'.json'.length)
      if (namespace === 'index') continue
      if (Object.hasOwn(messages, namespace)) {
        throw new Error(`Duplicate locale namespace: ${locale}/${namespace}`)
      }
      messages[namespace] = await readJsonObject(join(directory, name))
    }

    const file = `${locale}.json`
    await writeFile(
      join(outputRoot, file),
      JSON.stringify({ schemaVersion: 1, locale, messages }),
      'utf8'
    )
    manifestLocales[locale] = { file, label: descriptor.label }
  }

  await writeFile(
    join(outputRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        fallbackLocale: FALLBACK_LOCALE,
        locales: manifestLocales
      },
      null,
      2
    ),
    'utf8'
  )

  return { locales }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && currentFile === fileURLToPath(pathToFileURL(process.argv[1]))) {
  const repositoryRoot = join(dirname(currentFile), '..')
  await buildLanguageAssets({
    sourceRoot: join(repositoryRoot, 'src/lang'),
    outputRoot: join(repositoryRoot, 'dist/electron/static/lang')
  })
}
```

- [ ] **Step 5: Add and run the focused package script**

Add to `package.json` scripts:

```json
"build:language-assets": "tsx scripts/build-language-assets.ts",
"test:language-assets": "tsx scripts/language-assets-test.ts"
```

Run:

```bash
yarn test:language-assets
yarn build:language-assets
```

Expected: both commands exit 0; the test prints `language asset tests passed`; `dist/electron/static/lang/manifest.json` lists all 31 built-in locales.

- [ ] **Step 6: Commit the asset generator**

```bash
git add package.json src/lang/catalog.ts scripts/build-language-assets.ts scripts/language-assets-test.ts
git commit -m "feat: generate standalone locale assets"
```

---

### Task 2: Add the Shared Language Protocol and Lightweight Runtime

**Files:**
- Create: `src/shared/LanguageProtocol.ts`
- Create: `src/lang/types.ts`
- Create: `src/lang/runtime.ts`
- Create: `scripts/language-runtime-test.ts`
- Modify: `src/lang/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing protocol and runtime tests**

Create `scripts/language-runtime-test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  isLanguageAsset,
  isLanguageChanged,
  isLanguageManifest,
  type LanguageRuntimePayload
} from '../src/shared/LanguageProtocol'
import {
  AppI18n,
  I18nT,
  applyLanguagePayload,
  getActiveLocale,
  releaseLocalePayload
} from '../src/lang/runtime'

const english = { base: { greeting: 'Hello', fallbackOnly: 'Fallback' } }
const chinese = { base: { greeting: '你好' } }

assert.equal(
  isLanguageAsset({ schemaVersion: 1, locale: 'en', messages: english }),
  true
)
assert.equal(isLanguageAsset({ schemaVersion: 2, locale: 'en', messages: english }), false)
assert.equal(
  isLanguageManifest({
    schemaVersion: 1,
    fallbackLocale: 'en',
    locales: { en: { file: 'en.json', label: 'English' } }
  }),
  true
)
assert.equal(
  isLanguageChanged({
    type: 'language-changed',
    requestId: 'change-1',
    payload: {
      locale: 'zh',
      fallbackLocale: 'en',
      messages: chinese,
      fallbackMessages: english
    }
  }),
  true
)

const payload: LanguageRuntimePayload = {
  locale: 'zh',
  fallbackLocale: 'en',
  messages: chinese,
  fallbackMessages: english
}
applyLanguagePayload(payload)
assert.equal(getActiveLocale(), 'zh')
assert.equal(I18nT('base.greeting'), '你好')
assert.equal(I18nT('base.fallbackOnly'), 'Fallback')

applyLanguagePayload({
  locale: 'de',
  fallbackLocale: 'en',
  messages: { base: { greeting: 'Hallo' } },
  fallbackMessages: english
})
assert.equal(getActiveLocale(), 'de')
assert.equal(I18nT('base.greeting'), 'Hallo')
assert.deepEqual(AppI18n().global.getLocaleMessage('zh'), {})

releaseLocalePayload('zh')
assert.deepEqual(AppI18n().global.getLocaleMessage('zh'), {})
console.log('language runtime tests passed')
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npx tsx scripts/language-runtime-test.ts
```

Expected: FAIL because `LanguageProtocol.ts` and `runtime.ts` do not exist.

- [ ] **Step 3: Define exact cross-process payloads and validators**

Create `src/shared/LanguageProtocol.ts`:

```ts
export type LocaleMessages = Record<string, unknown>

export interface LanguageAsset {
  schemaVersion: 1
  locale: string
  messages: LocaleMessages
}

export interface LanguageManifest {
  schemaVersion: 1
  fallbackLocale: string
  locales: Record<string, { file: string; label: string }>
}

export interface LanguageRuntimePayload {
  locale: string
  fallbackLocale: string
  messages: LocaleMessages
  fallbackMessages: LocaleMessages
}

export interface LanguagePrepared extends LanguageRuntimePayload {
  token: string
  expiresAt: number
}

export interface LanguageBootstrapResult {
  payload: LanguageRuntimePayload
  warning?: string
}

export interface LanguageChanged {
  type: 'language-changed'
  requestId: string
  payload: LanguageRuntimePayload
}

export interface LanguageChangedAck {
  type: 'language-changed-ack'
  requestId: string
  locale: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const isLocaleMessages = (value: unknown): value is LocaleMessages => isRecord(value)

export const isLanguageAsset = (value: unknown): value is LanguageAsset =>
  isRecord(value) &&
  value.schemaVersion === 1 &&
  typeof value.locale === 'string' &&
  value.locale.length > 0 &&
  isLocaleMessages(value.messages)

export const isLanguageManifest = (value: unknown): value is LanguageManifest => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.fallbackLocale !== 'string' ||
    !isRecord(value.locales)
  ) {
    return false
  }
  return Object.values(value.locales).every(
    (item) =>
      isRecord(item) &&
      typeof item.file === 'string' &&
      item.file.endsWith('.json') &&
      typeof item.label === 'string'
  )
}

export const isLanguageRuntimePayload = (value: unknown): value is LanguageRuntimePayload =>
  isRecord(value) &&
  typeof value.locale === 'string' &&
  typeof value.fallbackLocale === 'string' &&
  isLocaleMessages(value.messages) &&
  isLocaleMessages(value.fallbackMessages)

export const isLanguageChanged = (value: unknown): value is LanguageChanged =>
  isRecord(value) &&
  value.type === 'language-changed' &&
  typeof value.requestId === 'string' &&
  isLanguageRuntimePayload(value.payload)

export const isLanguageChangedAck = (value: unknown): value is LanguageChangedAck =>
  isRecord(value) &&
  value.type === 'language-changed-ack' &&
  typeof value.requestId === 'string' &&
  typeof value.locale === 'string'
```

- [ ] **Step 4: Move compile-time key typing without adding runtime imports**

Create `src/lang/types.ts` by moving the existing type-only imports, `AppendStringToKeys`, and `LangKey` declarations from `src/lang/index.ts`. Start the file with these erased-at-build imports and helper:

```ts
import type ai from './zh/ai.json'
import type apache from './zh/apache.json'
import type appLog from './zh/appLog.json'
import type aside from './zh/aside.json'
import type base from './zh/base.json'
import type conf from './zh/conf.json'
import type feedback from './zh/feedback.json'
import type fork from './zh/fork.json'
import type host from './zh/host.json'
import type licenses from './zh/licenses.json'
import type mailpit from './zh/mailpit.json'
import type meilisearch from './zh/meilisearch.json'
import type menu from './zh/menu.json'
import type minio from './zh/minio.json'
import type mysql from './zh/mysql.json'
import type nginx from './zh/nginx.json'
import type nodejs from './zh/nodejs.json'
import type ollama from './zh/ollama.json'
import type php from './zh/php.json'
import type podman from './zh/podman.json'
import type prompt from './zh/prompt.json'
import type redis from './zh/redis.json'
import type requestTimer from './zh/requestTimer.json'
import type service from './zh/service.json'
import type setup from './zh/setup.json'
import type tokenGenerator from './zh/token-generator.json'
import type tools from './zh/tools.json'
import type toolType from './zh/toolType.json'
import type tray from './zh/tray.json'
import type update from './zh/update.json'
import type util from './zh/util.json'
import type versionmanager from './zh/versionmanager.json'
import type openclaw from './zh/openclaw.json'
import type hermes from './zh/hermes.json'
import type kimi from './zh/kimi.json'
import type n8n from './zh/n8n.json'
import type rustfs from './zh/rustfs.json'
import type mkcert from './zh/mkcert.json'
import type flutter from './zh/flutter.json'
import type cron from './zh/cron.json'
import type claudeCode from './zh/claude-code.json'
import type codex from './zh/codex.json'
import type openCode from './zh/opencode.json'
import type antigravity from './zh/antigravity.json'
import type copilotCli from './zh/copilot-cli.json'
import type common from './zh/common.json'
import type mcp from './zh/mcp.json'

type AppendStringToKeys<T extends object, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
    ? T[K] extends object
      ? AppendStringToKeys<T[K], `${Prefix}.${K}`>
      : `${Prefix}.${K}`
    : K extends number
      ? T extends readonly any[]
        ? `${Prefix}.${K}`
        : never
      : never
}[keyof T]
```

Finish the file by exporting `LangKey`:

```ts
export type LangKey =
  | AppendStringToKeys<typeof common, 'common'>
  | AppendStringToKeys<typeof ai, 'ai'>
  | AppendStringToKeys<typeof apache, 'apache'>
  | AppendStringToKeys<typeof appLog, 'appLog'>
  | AppendStringToKeys<typeof aside, 'aside'>
  | AppendStringToKeys<typeof base, 'base'>
  | AppendStringToKeys<typeof conf, 'conf'>
  | AppendStringToKeys<typeof feedback, 'feedback'>
  | AppendStringToKeys<typeof fork, 'fork'>
  | AppendStringToKeys<typeof host, 'host'>
  | AppendStringToKeys<typeof licenses, 'licenses'>
  | AppendStringToKeys<typeof mailpit, 'mailpit'>
  | AppendStringToKeys<typeof meilisearch, 'meilisearch'>
  | AppendStringToKeys<typeof menu, 'menu'>
  | AppendStringToKeys<typeof minio, 'minio'>
  | AppendStringToKeys<typeof mysql, 'mysql'>
  | AppendStringToKeys<typeof nginx, 'nginx'>
  | AppendStringToKeys<typeof nodejs, 'nodejs'>
  | AppendStringToKeys<typeof ollama, 'ollama'>
  | AppendStringToKeys<typeof php, 'php'>
  | AppendStringToKeys<typeof podman, 'podman'>
  | AppendStringToKeys<typeof prompt, 'prompt'>
  | AppendStringToKeys<typeof redis, 'redis'>
  | AppendStringToKeys<typeof requestTimer, 'requestTimer'>
  | AppendStringToKeys<typeof service, 'service'>
  | AppendStringToKeys<typeof setup, 'setup'>
  | AppendStringToKeys<typeof tokenGenerator, 'token-generator'>
  | AppendStringToKeys<typeof tools, 'tools'>
  | AppendStringToKeys<typeof toolType, 'toolType'>
  | AppendStringToKeys<typeof tray, 'tray'>
  | AppendStringToKeys<typeof update, 'update'>
  | AppendStringToKeys<typeof util, 'util'>
  | AppendStringToKeys<typeof versionmanager, 'versionmanager'>
  | AppendStringToKeys<typeof openclaw, 'openclaw'>
  | AppendStringToKeys<typeof hermes, 'hermes'>
  | AppendStringToKeys<typeof kimi, 'kimi'>
  | AppendStringToKeys<typeof n8n, 'n8n'>
  | AppendStringToKeys<typeof rustfs, 'rustfs'>
  | AppendStringToKeys<typeof mkcert, 'mkcert'>
  | AppendStringToKeys<typeof flutter, 'flutter'>
  | AppendStringToKeys<typeof cron, 'cron'>
  | AppendStringToKeys<typeof claudeCode, 'claudeCode'>
  | AppendStringToKeys<typeof codex, 'codex'>
  | AppendStringToKeys<typeof openCode, 'openCode'>
  | AppendStringToKeys<typeof antigravity, 'antigravity'>
  | AppendStringToKeys<typeof copilotCli, 'copilotCli'>
  | AppendStringToKeys<typeof mcp, 'mcp'>
```

Keep the existing type-only imports and `AppendStringToKeys` implementation exactly unchanged so TypeScript continues checking every existing key without emitting locale data.

- [ ] **Step 5: Implement the empty runtime and bounded message retention**

Create `src/lang/runtime.ts`:

```ts
import { createI18n } from 'vue-i18n'
import { FALLBACK_LOCALE } from './catalog'
import type { LangKey } from './types'
import type { LanguageRuntimePayload } from '@shared/LanguageProtocol'

const i18n = createI18n({
  legacy: true,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: {}
})

let activeLocale = FALLBACK_LOCALE
const reportedMissingKeys = new Set<string>()

export const AppI18n = () => i18n

export const getActiveLocale = () => activeLocale

export const releaseLocalePayload = (locale: string) => {
  if (locale !== FALLBACK_LOCALE && locale !== activeLocale) {
    i18n.global.setLocaleMessage(locale, {})
  }
}

export const applyLanguagePayload = (payload: LanguageRuntimePayload) => {
  const previousLocale = activeLocale
  i18n.global.setLocaleMessage(payload.fallbackLocale, payload.fallbackMessages)
  i18n.global.setLocaleMessage(payload.locale, payload.messages)
  i18n.global.fallbackLocale = payload.fallbackLocale
  i18n.global.locale = payload.locale
  activeLocale = payload.locale
  if (previousLocale !== payload.fallbackLocale && previousLocale !== payload.locale) {
    i18n.global.setLocaleMessage(previousLocale, {})
  }
  return i18n
}

export const I18nT = (key: LangKey | string, ...args: any[]) => {
  const translate = i18n.global.t as any
  const result = translate(key, ...args)
  if (result === key && !reportedMissingKeys.has(key)) {
    reportedMissingKeys.add(key)
    console.warn(`[I18n] Missing English fallback key: ${key}`)
  }
  return result
}
```

- [ ] **Step 6: Bridge the existing eager index to the shared runtime during staged integration**

Keep the existing built-in locale value imports and combined `lang` object in `src/lang/index.ts` until Task 11, but remove its separate `createI18n` instance and the now-unused `createI18n`/`I18n` imports. Import the shared runtime and catalog:

```ts
import { FALLBACK_LOCALE, normalizeLocale } from './catalog'
import {
  AppI18n as RuntimeAppI18n,
  applyLanguagePayload,
  I18nT
} from './runtime'

export { AppAllLang } from './catalog'
export { I18nT }
export type { LangKey } from './types'
```

Replace the old `AppI18n` and `I18nT` implementations at the bottom of `index.ts` with this temporary compatibility bridge:

```ts
export const AppI18n = (localeInput?: string) => {
  if (localeInput) {
    const locale = normalizeLocale(localeInput)
    const messages = (lang as Record<string, Record<string, unknown>>)[locale]
    const fallbackMessages = (lang as Record<string, Record<string, unknown>>)[FALLBACK_LOCALE]
    if (messages && fallbackMessages) {
      applyLanguagePayload({
        locale,
        fallbackLocale: FALLBACK_LOCALE,
        messages,
        fallbackMessages
      })
    }
  }
  return RuntimeAppI18n()
}
```

Delete the old `AppAllLang` declaration from `index.ts` so the catalog is its only metadata source. This bridge deliberately preserves current behavior and memory use while later tasks wire asynchronous loaders. Task 11 removes the value imports and optional locale argument after every process has migrated.

- [ ] **Step 7: Add the package script and verify the runtime test**

Add to `package.json`:

```json
"test:language-runtime": "tsx scripts/language-runtime-test.ts"
```

Run:

```bash
yarn test:language-runtime
```

Expected: PASS and print `language runtime tests passed`.

- [ ] **Step 8: Commit the protocol and runtime**

```bash
git add package.json src/shared/LanguageProtocol.ts src/lang/types.ts src/lang/runtime.ts src/lang/index.ts scripts/language-runtime-test.ts
git commit -m "feat: add lightweight locale runtime"
```

---

### Task 3: Load Built-In and Custom Locales Through a Bounded Repository

**Files:**
- Create: `src/main/core/LanguageRepository.ts`
- Create: `scripts/language-repository-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write repository tests before implementation**

Create `scripts/language-repository-test.ts` with real temporary files:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LanguageRepository } from '../src/main/core/LanguageRepository'

const root = await mkdtemp(join(tmpdir(), 'flyenv-language-repository-'))
const builtInRoot = join(root, 'built-in')
const customRoot = join(root, 'custom')
await mkdir(builtInRoot, { recursive: true })
await mkdir(join(customRoot, 'pirate'), { recursive: true })

const manifest = {
  schemaVersion: 1,
  fallbackLocale: 'en',
  locales: {
    en: { file: 'en.json', label: 'English' },
    zh: { file: 'zh.json', label: '中文-简体' }
  }
}
await writeFile(join(builtInRoot, 'manifest.json'), JSON.stringify(manifest))
await writeFile(
  join(builtInRoot, 'en.json'),
  JSON.stringify({ schemaVersion: 1, locale: 'en', messages: { base: { title: 'English' } } })
)
await writeFile(
  join(builtInRoot, 'zh.json'),
  JSON.stringify({ schemaVersion: 1, locale: 'zh', messages: { base: { title: '中文' } } })
)
await writeFile(
  join(customRoot, 'pirate', 'index.json'),
  JSON.stringify({ lang: 'pirate', label: 'Pirate' })
)
await writeFile(
  join(customRoot, 'pirate', 'base.json'),
  JSON.stringify({ title: 'Ahoy' })
)

let readCount = 0
const repository = new LanguageRepository({
  builtInRoot,
  customRoot,
  onRead: () => {
    readCount += 1
  }
})

try {
  await repository.ready()
  assert.deepEqual(repository.listBuiltIn(), [
    { locale: 'en', label: 'English' },
    { locale: 'zh', label: '中文-简体' }
  ])

  await repository.load('en')
  const beforeConcurrent = readCount
  const first = repository.load('zh')
  const second = repository.load('zh')
  assert.strictEqual(await first, await second)
  assert.equal(readCount - beforeConcurrent, 1)

  assert.deepEqual((await repository.load('pirate')).messages, {
    base: { title: 'Ahoy' }
  })
  assert.deepEqual(await repository.listCustom(), [{ locale: 'pirate', label: 'Pirate' }])

  await assert.rejects(() => repository.load('../en'), /Unsupported or unsafe locale/)
  await assert.rejects(() => repository.load('missing'), /Unsupported or unsafe locale/)

  repository.retain('zh')
  assert.deepEqual(repository.cachedLocales(), ['en', 'zh'])
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('language repository tests passed')
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run:

```bash
npx tsx scripts/language-repository-test.ts
```

Expected: FAIL because `LanguageRepository` does not exist.

- [ ] **Step 3: Implement manifest validation, deduplication, custom loading, and bounded cache**

Create `src/main/core/LanguageRepository.ts` with these public methods and state:

```ts
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { FALLBACK_LOCALE, normalizeLocale } from '@lang/catalog'
import {
  isLanguageAsset,
  isLanguageManifest,
  type LanguageAsset,
  type LanguageManifest,
  type LocaleMessages
} from '@shared/LanguageProtocol'

export interface LanguageRepositoryOptions {
  builtInRoot: string
  customRoot: string
  onRead?: (file: string) => void
}

export class LanguageRepository {
  private manifest?: LanguageManifest
  private readonly cache = new Map<string, LanguageAsset>()
  private readonly inFlight = new Map<string, Promise<LanguageAsset>>()

  constructor(private readonly options: LanguageRepositoryOptions) {}

  private async readJson(file: string): Promise<unknown> {
    this.options.onRead?.(file)
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      throw new Error(`Unable to read locale asset ${file}: ${String(error)}`)
    }
  }

  async ready() {
    if (this.manifest) return this.manifest
    const value = await this.readJson(join(this.options.builtInRoot, 'manifest.json'))
    if (!isLanguageManifest(value) || !value.locales[value.fallbackLocale]) {
      throw new Error('Invalid language manifest')
    }
    for (const descriptor of Object.values(value.locales)) {
      if (basename(descriptor.file) !== descriptor.file) {
        throw new Error(`Unsafe locale asset filename: ${descriptor.file}`)
      }
    }
    this.manifest = value
    return value
  }

  listBuiltIn() {
    if (!this.manifest) throw new Error('LanguageRepository.ready() must be awaited first')
    return Object.entries(this.manifest.locales)
      .map(([locale, item]) => ({ locale, label: item.label }))
      .sort((a, b) => a.locale.localeCompare(b.locale))
  }

  async listCustom() {
    const result: Array<{ locale: string; label: string }> = []
    const entries = await readdir(this.options.customRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metadata = await this.readJson(join(this.options.customRoot, entry.name, 'index.json')).catch(
        () => undefined
      )
      if (
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        (metadata as any).lang === entry.name &&
        typeof (metadata as any).label === 'string' &&
        !this.manifest?.locales[entry.name]
      ) {
        result.push({ locale: entry.name, label: (metadata as any).label })
      }
    }
    return result.sort((a, b) => a.locale.localeCompare(b.locale))
  }

  load(localeInput: string): Promise<LanguageAsset> {
    const locale = normalizeLocale(localeInput)
    const cached = this.cache.get(locale)
    if (cached) return Promise.resolve(cached)
    const pending = this.inFlight.get(locale)
    if (pending) return pending
    const load = this.loadUncached(locale)
      .then((asset) => {
        this.cache.set(locale, asset)
        return asset
      })
      .finally(() => this.inFlight.delete(locale))
    this.inFlight.set(locale, load)
    return load
  }

  private async loadUncached(locale: string): Promise<LanguageAsset> {
    const manifest = await this.ready()
    const builtIn = manifest.locales[locale]
    if (builtIn) {
      const value = await this.readJson(join(this.options.builtInRoot, builtIn.file))
      if (!isLanguageAsset(value) || value.locale !== locale) {
        throw new Error(`Invalid language asset: ${locale}`)
      }
      return value
    }
    if (!/^[a-z][a-z0-9-]*$/.test(locale)) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const root = resolve(this.options.customRoot)
    const directory = resolve(root, locale)
    const rel = relative(root, directory)
    if (!rel || rel.startsWith('..') || rel.includes('/../') || rel.includes('\\..\\')) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const metadata = await this.readJson(join(directory, 'index.json')).catch(() => undefined)
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as any).lang !== locale
    ) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const messages: LocaleMessages = {}
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name.endsWith('.json') && item.name !== 'index.json')
      .map((item) => item.name)
      .sort()
    for (const file of files) {
      const value = await this.readJson(join(directory, file))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid custom locale namespace: ${locale}/${file}`)
      }
      messages[file.slice(0, -'.json'.length)] = value
    }
    return { schemaVersion: 1, locale, messages }
  }

  retain(activeLocale: string) {
    for (const locale of this.cache.keys()) {
      if (locale !== FALLBACK_LOCALE && locale !== activeLocale) this.cache.delete(locale)
    }
  }

  cachedLocales() {
    return [...this.cache.keys()].sort()
  }

  invalidate(locale: string) {
    this.cache.delete(normalizeLocale(locale))
  }

  async initializeCustomTemplate(locale: 'en' | 'zh') {
    const asset = await this.load(locale)
    const directory = join(this.options.customRoot, locale)
    await mkdir(directory, { recursive: true })
    for (const [namespace, messages] of Object.entries(asset.messages)) {
      const file = join(directory, `${namespace}.json`)
      await writeFile(file, JSON.stringify(messages, null, 2), { flag: 'wx' }).catch((error: any) => {
        if (error?.code !== 'EEXIST') throw error
      })
    }
    await writeFile(
      join(directory, 'index.json'),
      JSON.stringify({ lang: locale, label: locale === 'zh' ? '中文' : 'English' }, null, 2),
      { flag: 'wx' }
    ).catch((error: any) => {
      if (error?.code !== 'EEXIST') throw error
    })
    return directory
  }
}
```

- [ ] **Step 4: Add the package script and run the test**

Add:

```json
"test:language-repository": "tsx scripts/language-repository-test.ts"
```

Run:

```bash
yarn test:language-repository
```

Expected: PASS and print `language repository tests passed`.

- [ ] **Step 5: Commit the repository**

```bash
git add package.json src/main/core/LanguageRepository.ts scripts/language-repository-test.ts
git commit -m "feat: load locale assets on demand"
```

---

### Task 4: Implement Prepare/Commit Language Transactions

**Files:**
- Create: `src/main/core/LanguageCoordinator.ts`
- Create: `scripts/language-coordinator-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing coordinator test**

Create `scripts/language-coordinator-test.ts`:

```ts
import assert from 'node:assert/strict'
import { LanguageCoordinator } from '../src/main/core/LanguageCoordinator'
import type { LanguageAsset, LanguageChanged } from '../src/shared/LanguageProtocol'

const assets: Record<string, LanguageAsset> = {
  en: { schemaVersion: 1, locale: 'en', messages: { base: { title: 'English' } } },
  zh: { schemaVersion: 1, locale: 'zh', messages: { base: { title: '中文' } } },
  de: { schemaVersion: 1, locale: 'de', messages: { base: { title: 'Deutsch' } } }
}
const applied: string[] = []
const persisted: string[] = []
const published: LanguageChanged[] = []
const retained: string[] = []
let now = 1_000
let tokenNumber = 0

const coordinator = new LanguageCoordinator({
  repository: {
    load: async (locale: string) => {
      const asset = assets[locale]
      if (!asset) throw new Error(`missing ${locale}`)
      return asset
    },
    retain: (locale: string) => retained.push(locale)
  },
  runtime: {
    apply: (payload) => applied.push(payload.locale)
  },
  persist: (locale) => persisted.push(locale),
  publish: async (message) => {
    published.push(message)
  },
  refreshNativeUi: () => {},
  setServerLocale: () => {},
  now: () => now,
  token: () => `token-${++tokenNumber}`,
  requestId: () => `change-${tokenNumber}`
})

const startup = await coordinator.initialize('zh')
assert.equal(startup.locale, 'zh')
assert.deepEqual(applied, ['zh'])
assert.deepEqual(persisted, [])
assert.equal(coordinator.bootstrap().warning, undefined)

const stale = await coordinator.prepare('de')
const latest = await coordinator.prepare('zh')
await assert.rejects(() => coordinator.commit(stale.token), /Stale language preparation/)

const committed = await coordinator.commit(latest.token)
assert.equal(committed.locale, 'zh')
assert.deepEqual(persisted, ['zh'])
assert.equal(published.at(-1)?.payload.locale, 'zh')
assert.equal(retained.at(-1), 'zh')
await assert.rejects(() => coordinator.commit(latest.token), /Unknown language preparation/)

const expiring = await coordinator.prepare('de')
now = expiring.expiresAt + 1
await assert.rejects(() => coordinator.commit(expiring.token), /Expired language preparation/)

const fallbackCoordinator = new LanguageCoordinator({
  repository: {
    load: async (locale: string) => {
      if (locale === 'missing') throw new Error('corrupt locale')
      return assets.en
    },
    retain: () => {}
  },
  runtime: { apply: (payload) => applied.push(payload.locale) },
  persist: () => {
    throw new Error('startup fallback must not overwrite preference')
  },
  publish: async () => {},
  refreshNativeUi: () => {},
  setServerLocale: () => {},
  now: () => now,
  token: () => 'fallback-token',
  requestId: () => 'fallback-change'
})
assert.equal((await fallbackCoordinator.initialize('missing')).locale, 'en')
assert.match(fallbackCoordinator.bootstrap().warning || '', /corrupt locale/)
assert.equal(fallbackCoordinator.bootstrap().warning, undefined)
console.log('language coordinator tests passed')
```

- [ ] **Step 2: Run the test and verify the missing coordinator failure**

Run:

```bash
npx tsx scripts/language-coordinator-test.ts
```

Expected: FAIL because `LanguageCoordinator` does not exist.

- [ ] **Step 3: Implement the coordinator with one current preparation token**

Create `src/main/core/LanguageCoordinator.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { FALLBACK_LOCALE, normalizeLocale } from '@lang/catalog'
import type {
  LanguageAsset,
  LanguageChanged,
  LanguagePrepared,
  LanguageRuntimePayload
} from '@shared/LanguageProtocol'

interface RepositoryContract {
  load(locale: string): Promise<LanguageAsset>
  retain(locale: string): void
}

interface RuntimeContract {
  apply(payload: LanguageRuntimePayload): void
}

export interface LanguageCoordinatorOptions {
  repository: RepositoryContract
  runtime: RuntimeContract
  persist(locale: string): void | Promise<void>
  publish(message: LanguageChanged): Promise<void>
  refreshNativeUi(): void | Promise<void>
  setServerLocale(locale: string): void
  now?: () => number
  token?: () => string
  requestId?: () => string
  preparationTtlMs?: number
  onError?: (error: unknown) => void
}

export class LanguageCoordinator {
  private readonly now: () => number
  private readonly token: () => string
  private readonly requestId: () => string
  private readonly preparationTtlMs: number
  private pending?: LanguagePrepared
  private current?: LanguageRuntimePayload
  private startupWarning?: string

  constructor(private readonly options: LanguageCoordinatorOptions) {
    this.now = options.now ?? Date.now
    this.token = options.token ?? randomUUID
    this.requestId = options.requestId ?? randomUUID
    this.preparationTtlMs = options.preparationTtlMs ?? 30_000
  }

  private async payload(localeInput: string): Promise<LanguageRuntimePayload> {
    const locale = normalizeLocale(localeInput)
    const [fallback, selected] = await Promise.all([
      this.options.repository.load(FALLBACK_LOCALE),
      this.options.repository.load(locale)
    ])
    return {
      locale: selected.locale,
      fallbackLocale: fallback.locale,
      messages: selected.messages,
      fallbackMessages: fallback.messages
    }
  }

  async initialize(locale: string) {
    let payload: LanguageRuntimePayload
    try {
      payload = await this.payload(locale)
    } catch (error) {
      this.options.onError?.(error)
      this.startupWarning = String(error)
      payload = await this.payload(FALLBACK_LOCALE)
    }
    this.options.runtime.apply(payload)
    this.options.setServerLocale(payload.locale)
    this.options.repository.retain(payload.locale)
    this.current = payload
    return payload
  }

  async prepare(locale: string): Promise<LanguagePrepared> {
    const payload = await this.payload(locale)
    const prepared: LanguagePrepared = {
      ...payload,
      token: this.token(),
      expiresAt: this.now() + this.preparationTtlMs
    }
    this.pending = prepared
    return prepared
  }

  async commit(token: string): Promise<LanguageRuntimePayload> {
    const pending = this.pending
    if (!pending || pending.token !== token) {
      if (pending) throw new Error('Stale language preparation')
      throw new Error('Unknown language preparation')
    }
    this.pending = undefined
    if (this.now() > pending.expiresAt) throw new Error('Expired language preparation')

    const payload: LanguageRuntimePayload = {
      locale: pending.locale,
      fallbackLocale: pending.fallbackLocale,
      messages: pending.messages,
      fallbackMessages: pending.fallbackMessages
    }
    this.options.runtime.apply(payload)
    this.options.setServerLocale(payload.locale)
    await this.options.persist(payload.locale)
    this.options.repository.retain(payload.locale)
    this.current = payload
    await Promise.resolve(this.options.refreshNativeUi()).catch((error) =>
      this.options.onError?.(error)
    )
    await this.options
      .publish({ type: 'language-changed', requestId: this.requestId(), payload })
      .catch((error) => this.options.onError?.(error))
    return payload
  }

  snapshot() {
    if (!this.current) throw new Error('LanguageCoordinator.initialize() has not completed')
    return this.current
  }

  bootstrap() {
    const result = { payload: this.snapshot(), warning: this.startupWarning }
    this.startupWarning = undefined
    return result
  }
}
```

- [ ] **Step 4: Add the package script and verify the coordinator**

Add:

```json
"test:language-coordinator": "tsx scripts/language-coordinator-test.ts"
```

Run:

```bash
yarn test:language-coordinator
```

Expected: PASS and print `language coordinator tests passed`.

- [ ] **Step 5: Commit the coordinator**

```bash
git add package.json src/main/core/LanguageCoordinator.ts scripts/language-coordinator-test.ts
git commit -m "feat: coordinate atomic language switches"
```

---

### Task 5: Integrate Locale Asset Generation Into Development and Production Builds

**Files:**
- Create: `scripts/language-build-hook-test.ts`
- Modify: `scripts/dev-runner.ts`
- Modify: `scripts/app-builder.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing build-hook regression test**

Create `scripts/language-build-hook-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const devRunner = readFileSync('scripts/dev-runner.ts', 'utf8')
const appBuilder = readFileSync('scripts/app-builder.ts', 'utf8')

assert.match(devRunner, /buildLanguageAssets/)
assert.match(devRunner, /src\/lang/)
assert.match(appBuilder, /buildLanguageAssets/)
assert.match(appBuilder, /dist\/electron\/static\/lang/)
console.log('language build hook tests passed')
```

- [ ] **Step 2: Run the hook test and verify it fails**

Run:

```bash
npx tsx scripts/language-build-hook-test.ts
```

Expected: FAIL because neither build path calls `buildLanguageAssets`.

- [ ] **Step 3: Generate assets before every main/fork build**

Add imports to both `scripts/dev-runner.ts` and `scripts/app-builder.ts`:

```ts
import { buildLanguageAssets } from './build-language-assets'
```

At the start of the existing async Promise executor in `buildMainProcess()`, before selecting the platform config, add an explicit rejection path because exceptions thrown by an async Promise executor do not reject the outer Promise:

```ts
try {
  await buildLanguageAssets({
    sourceRoot: _path.resolve(__dirname, '../src/lang'),
    outputRoot: _path.resolve(__dirname, '../dist/electron/static/lang')
  })
} catch (error) {
  building = false
  for (const callback of buildCallback.splice(0)) callback.reject(error)
  reject(error)
  return
}
```

Inside `packMain()` in `scripts/app-builder.ts`, immediately after `await DoFix()`, add:

```ts
await buildLanguageAssets({
  sourceRoot: path.resolve(__dirname, '../src/lang'),
  outputRoot: path.resolve(__dirname, '../dist/electron/static/lang')
})
```

Add these imports to `scripts/app-builder.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
```

- [ ] **Step 4: Watch language source files in development**

Add to `scripts/dev-runner.ts` after the existing fork watcher:

```ts
const langPath = _path.resolve(__dirname, '../src/lang/')
_fs.watch(
  langPath,
  { recursive: true },
  (event, filename) => {
    next(langPath, filename)
  }
)
```

This reuses the existing debounced rebuild/restart path and regenerates locale assets before Electron restarts.

- [ ] **Step 5: Add the test script and verify both build paths**

Add:

```json
"test:language-build-hook": "tsx scripts/language-build-hook-test.ts"
```

Run:

```bash
yarn test:language-build-hook
yarn build:language-assets
```

Expected: PASS; generated assets exist at `dist/electron/static/lang`.

- [ ] **Step 6: Commit build integration**

```bash
git add package.json scripts/dev-runner.ts scripts/app-builder.ts scripts/language-build-hook-test.ts
git commit -m "build: prepare locale assets on demand"
```

---

### Task 6: Initialize the Main Process Asynchronously and Expose Language IPC

**Files:**
- Create: `scripts/language-main-integration-test.ts`
- Modify: `package.json`
- Modify: `src/main/Launcher.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/ConfigManager.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `src/main/core/ServerManager.ts`
- Modify: `src/main/utils/menu.ts`
- Modify: `src/main/core/Capturer.ts`
- Modify: `src/main/core/OAuth.ts`
- Modify: `src/main/core/UpdateManager.ts`
- Modify: `src/main/ui/TrayManager.ts`

- [ ] **Step 1: Write failing static integration assertions**

Create `scripts/language-main-integration-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const launcher = readFileSync('src/main/Launcher.ts', 'utf8')
const application = readFileSync('src/main/Application.ts', 'utf8')
const configManager = readFileSync('src/main/core/ConfigManager.ts', 'utf8')
const ipcHandler = readFileSync('src/main/core/IPCHandler.ts', 'utf8')

assert.match(launcher, /await application\.init\(\)/)
assert.match(application, /new LanguageRepository/)
assert.match(application, /new LanguageCoordinator/)
assert.match(application, /async init\(\)/)
assert.doesNotMatch(configManager, /AppI18n/)
assert.match(ipcHandler, /application:language-bootstrap/)
assert.match(ipcHandler, /application:language-prepare/)
assert.match(ipcHandler, /application:language-commit/)
console.log('language main integration tests passed')
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```bash
npx tsx scripts/language-main-integration-test.ts
```

Expected: FAIL because main startup is synchronous and no language IPC commands exist.

- [ ] **Step 3: Remove language side effects from configuration writes**

Delete the `AppI18n` import from `src/main/core/ConfigManager.ts`. Replace `setConfig` with an overload that supports both existing call forms but performs only persistence:

```ts
setConfig(key: string | Partial<ConfigOptions>, ...args: any[]) {
  if (typeof key === 'string') {
    this.config?.set(key as any, ...args)
  } else {
    this.config?.set(key)
  }
}
```

Do not call the runtime or rebuild menus from this method.

- [ ] **Step 4: Construct repository and coordinator before UI managers**

Add these properties and imports to `src/main/Application.ts`:

```ts
import { resolve } from 'node:path'
import { LanguageRepository } from './core/LanguageRepository'
import { LanguageCoordinator } from './core/LanguageCoordinator'
import { applyLanguagePayload, I18nT } from '@lang/runtime'

languageRepository: LanguageRepository
languageCoordinator: LanguageCoordinator
```

Because menu, window, tray, and IPC construction moves from the constructor into `init()`, mark those existing properties with TypeScript definite-assignment assertions:

```ts
menuManager!: MenuManager
trayManager!: TrayManager
windowManager!: WindowManager
private ipcHandler!: IPCHandler
```

In the constructor, keep only dependency creation that is required to locate and load assets. Move menu, window, tray, IPC, helper, fork, MCP, and startup-command initialization into a new `async init()` method. The constructor's ordered core is:

```ts
this.setupInitialConfig()
this.configManager = new ConfigManager()
this.mcpConfigManager = new MCPConfigManager()
this.mcpBridgeManager = new MCPBridgeManager()
this.serverManager = new ServerManager(this.configManager)
this.serverManager.initServerDir()

this.languageRepository = new LanguageRepository({
  builtInRoot: resolve(global.Server.Static!, 'lang'),
  customRoot: resolve(global.Server.BaseDir!, '../lang')
})
this.languageCoordinator = new LanguageCoordinator({
  repository: this.languageRepository,
  runtime: { apply: applyLanguagePayload },
  persist: (locale) => this.configManager.setConfig('setup.lang', locale),
  setServerLocale: (locale) => {
    global.Server.Lang = locale
  },
  refreshNativeUi: () => {
    this.menuManager?.rebuild()
    if (this.trayManager?.status) {
      this.trayManager.menuChange(this.trayManager.status)
    }
  },
  publish: (message) => this.publishLanguage(message),
  onError: (error) => logger.error('[Language]', error)
})
```

Define `async init()` with the required ordering:

```ts
async init() {
  const requestedLocale = getLanguage(this.configManager.getConfig('setup.lang'))
  await this.languageRepository.ready()
  await this.languageCoordinator.initialize(requestedLocale)

  AppNodeFnManager.nativeTheme_watch()
  AppNodeFnManager.configManager = this.configManager
  this.menuManager = new MenuManager()
  this.menuManager.setup()
  this.serverManager.setProxy()
  this.windowManager = new WindowManager({ configManager: this.configManager })
  this.initWindowManager()
  ScreenManager.initWatch()
  this.trayManager = new TrayManager()
  this.windowManager.trayManager = this.trayManager

  this.ipcHandler = new IPCHandler({
    configManager: this.configManager,
    mcpConfigManager: this.mcpConfigManager,
    mcpBridgeManager: this.mcpBridgeManager,
    windowManager: this.windowManager,
    trayManager: this.trayManager,
    serverManager: this.serverManager,
    languageCoordinator: this.languageCoordinator,
    appNodeFnManager: AppNodeFnManager,
    siteSuckerManager: SiteSuckerManager
  })

  this.setupEventHandlers()
  this.ipcHandler.init()
  this.initFontAccessPermission()
  this.initAppHelper()
  this.initForkManager()
  this.setupSiteSuckerCallback()
  this.setupNodePTYCallback()
  if (!is.dev()) {
    this.ipcHandler.handleCommand('app-fork:app', 'App-Start', 'start', app.getVersion())
  }
  return this
}
```

Keep the existing MCP construction inside `initForkManager()`. Remove the old synchronous `initLang()` method and the constructor's duplicate production `App-Start` call.

- [ ] **Step 5: Await main initialization before opening the window**

Replace the `app.on('ready')` callback in `src/main/Launcher.ts` with:

```ts
app.on('ready', async () => {
  console.log('app on ready !!!!!!')
  const application = new Application()
  await application.init()
  global.application = application
  application.start('index')
  application.on('ready', () => {})
  if (isWindows() || isLinux()) {
    Menu.setApplicationMenu(null)
  }
})
```

Keep the existing `before-quit`, activation, single-instance, and diagnostics behavior unchanged.

- [ ] **Step 6: Add bootstrap, prepare, and commit IPC commands**

Extend `IPCHandlerDependencies` in `src/main/core/IPCHandler.ts`:

```ts
languageCoordinator: LanguageCoordinator
```

Add a type-only import for `LanguageCoordinator`. Add these cases to `handleRegularCommand`:

```ts
case 'application:language-bootstrap':
  this.handleLanguageBootstrap(command, key)
  break
case 'application:language-prepare':
  this.handleLanguagePrepare(command, key, args[0])
  break
case 'application:language-commit':
  this.handleLanguageCommit(command, key, args[0])
  break
```

Add the handlers:

```ts
private handleLanguageBootstrap(command: string, key: string) {
  this.sendToMainWindow(command, key, {
    code: 0,
    data: this.deps.languageCoordinator.bootstrap()
  })
}

private handleLanguagePrepare(command: string, key: string, locale: string) {
  this.deps.languageCoordinator
    .prepare(locale)
    .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
    .catch((error) =>
      this.sendToMainWindow(command, key, { code: 1, msg: String(error) })
    )
}

private handleLanguageCommit(command: string, key: string, token: string) {
  this.deps.languageCoordinator
    .commit(token)
    .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
    .catch((error) =>
      this.sendToMainWindow(command, key, { code: 1, msg: String(error) })
    )
}
```

- [ ] **Step 7: Publish committed changes to native UI and available child processes**

Add to `src/main/Application.ts`:

```ts
private async publishLanguage(message: LanguageChanged) {
  const command = 'APP-Language-Changed'
  if (this.trayWindow) {
    this.windowManager.sendCommandTo(this.trayWindow, command, command, message.payload)
  }
  if (this.forkManager) {
    void this.forkManager.broadcastLanguage(message).then((results) => {
      if (results.some((result) => !result)) {
        logger.warn('[Language] one or more forks missed the locale acknowledgement')
      }
    })
  }
}
```

Do not await fork acknowledgement timeouts in the UI commit path. Fork delivery continues in the background, while every later fork command receives the authoritative initialization snapshot again.

Import `LanguageChanged` as a type in both `Application.ts` and `ForkManager.ts`. Task 10 adds acknowledged delivery; until then, add a temporary no-op method with the final signature to `ForkManager`:

```ts
async broadcastLanguage(_message: LanguageChanged) {
  return [] as boolean[]
}
```

Task 10 replaces the body without changing callers.

- [ ] **Step 8: Point main-only translations at the lightweight runtime**

Change `I18nT` imports from `@lang/index` to `@lang/runtime` in:

```text
src/main/Application.ts
src/main/utils/menu.ts
src/main/core/Capturer.ts
src/main/core/OAuth.ts
src/main/core/UpdateManager.ts
src/main/ui/TrayManager.ts
```

In `src/main/core/ServerManager.ts`, keep `global.Server.Lang` authoritative but stop calling `CustomerLang.initLangCustomer()` from `updateGlobalConfig()`. Custom payload distribution now belongs to the coordinator.

- [ ] **Step 9: Add the focused script and run main checks**

Add:

```json
"test:language-main": "tsx scripts/language-main-integration-test.ts"
```

Run:

```bash
yarn test:language-main
yarn test:language-assets
yarn test:language-coordinator
npx vue-tsc --noEmit
```

Expected: focused tests pass and TypeScript reports no new errors.

- [ ] **Step 10: Commit main-process integration**

```bash
git add package.json scripts/language-main-integration-test.ts src/main/Launcher.ts src/main/Application.ts src/main/core/ConfigManager.ts src/main/core/IPCHandler.ts src/main/core/ServerManager.ts src/main/utils/menu.ts src/main/core/Capturer.ts src/main/core/OAuth.ts src/main/core/UpdateManager.ts src/main/ui/TrayManager.ts src/main/core/ForkManager.ts
git commit -m "feat: initialize main locale on demand"
```

---

### Task 7: Lazy-Load Renderer and Element Plus Locales

**Files:**
- Create: `src/render/core/LanguageService.ts`
- Create: `scripts/language-renderer-test.ts`
- Modify: `src/lang/render.ts`
- Modify: `src/render/core/VueExtend.ts`
- Modify: `src/render/main.ts`
- Modify: `src/render/components/Main.vue`
- Modify: `configs/vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing renderer integration assertions**

Create `scripts/language-renderer-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rendererService = readFileSync('src/render/core/LanguageService.ts', 'utf8')
const elementLocales = readFileSync('src/lang/render.ts', 'utf8')
const rendererMain = readFileSync('src/render/main.ts', 'utf8')
const vueExtend = readFileSync('src/render/core/VueExtend.ts', 'utf8')
const viteConfig = readFileSync('configs/vite.config.ts', 'utf8')

assert.match(rendererService, /application:language-bootstrap/)
assert.match(rendererService, /application:language-prepare/)
assert.match(rendererService, /application:language-commit/)
assert.match(rendererService, /requestSequence/)
assert.match(elementLocales, /\(\) => import\('element-plus/)
assert.doesNotMatch(elementLocales, /^import ar from/m)
assert.match(rendererMain, /await RendererLanguage\.initialize/)
assert.match(rendererMain, /bootstrap\.warning/)
assert.match(vueExtend, /app\.use\(AppI18n\(\)\)/)
assert.match(viteConfig, /element-plus-locale-/)
console.log('language renderer tests passed')
```

The test intentionally reads a not-yet-created service. Create an empty file only if the runner reports `ENOENT`; leave assertions failing until the implementation steps.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx tsx scripts/language-renderer-test.ts
```

Expected: FAIL because `LanguageService.ts` is absent or missing required behavior.

- [ ] **Step 3: Replace eager Element Plus imports with explicit dynamic loaders**

Replace `src/lang/render.ts` with:

```ts
import en from 'element-plus/es/locale/lang/en'
import type { Language } from 'element-plus/es/locale'

const loaders: Record<string, () => Promise<{ default: Language }>> = {
  ar: () => import('element-plus/es/locale/lang/ar'),
  az: () => import('element-plus/es/locale/lang/az'),
  bg: () => import('element-plus/es/locale/lang/bg'),
  bn: () => import('element-plus/es/locale/lang/bn'),
  cs: () => import('element-plus/es/locale/lang/cs'),
  da: () => import('element-plus/es/locale/lang/da'),
  de: () => import('element-plus/es/locale/lang/de'),
  el: () => import('element-plus/es/locale/lang/el'),
  es: () => import('element-plus/es/locale/lang/es'),
  fi: () => import('element-plus/es/locale/lang/fi'),
  fr: () => import('element-plus/es/locale/lang/fr'),
  hr: () => import('element-plus/es/locale/lang/hr'),
  hu: () => import('element-plus/es/locale/lang/hu'),
  id: () => import('element-plus/es/locale/lang/id'),
  it: () => import('element-plus/es/locale/lang/it'),
  ja: () => import('element-plus/es/locale/lang/ja'),
  ko: () => import('element-plus/es/locale/lang/ko'),
  nl: () => import('element-plus/es/locale/lang/nl'),
  no: () => import('element-plus/es/locale/lang/no'),
  pl: () => import('element-plus/es/locale/lang/pl'),
  pt: () => import('element-plus/es/locale/lang/pt'),
  'pt-br': () => import('element-plus/es/locale/lang/pt-br'),
  ro: () => import('element-plus/es/locale/lang/ro'),
  ru: () => import('element-plus/es/locale/lang/ru'),
  sv: () => import('element-plus/es/locale/lang/sv'),
  tr: () => import('element-plus/es/locale/lang/tr'),
  uk: () => import('element-plus/es/locale/lang/uk'),
  vi: () => import('element-plus/es/locale/lang/vi'),
  zh: () => import('element-plus/es/locale/lang/zh-cn'),
  zhhant: () => import('element-plus/es/locale/lang/zh-tw')
}

export const ElementPlusEnglish = en

export const loadElementPlusLocale = async (locale: string): Promise<Language> => {
  const loader = loaders[locale]
  if (!loader) return en
  try {
    return (await loader()).default
  } catch {
    return en
  }
}
```

- [ ] **Step 4: Keep dynamic Element Plus locales out of the eager shared vendor chunk**

In `configs/vite.config.ts`, add this branch at the start of `manualChunks(id)`, before the generic `node_modules` branch:

```ts
const normalizedId = id.replaceAll('\\', '/')
const elementLocale = normalizedId.match(
  /element-plus\/es\/locale\/lang\/([^/.]+)/
)
if (elementLocale) {
  return `element-plus-locale-${elementLocale[1]}`
}
```

Without this branch, the current generic package-based manual chunk groups all Element Plus locale modules into the eagerly loaded Element Plus vendor chunk and defeats their dynamic imports.

- [ ] **Step 5: Implement a Promise-based IPC wrapper and renderer transaction service**

Create `src/render/core/LanguageService.ts`:

```ts
import { shallowRef } from 'vue'
import type { Language } from 'element-plus/es/locale'
import IPC from '@/util/IPC'
import { applyLanguagePayload } from '@lang/runtime'
import { ElementPlusEnglish, loadElementPlusLocale } from '@lang/render'
import type {
  LanguageBootstrapResult,
  LanguagePrepared,
  LanguageRuntimePayload
} from '@shared/LanguageProtocol'

type LanguageResponse<T> = { code: number; data?: T; msg?: string }

const request = <T>(command: string, ...args: unknown[]) =>
  new Promise<T>((resolve, reject) => {
    IPC.send(command, ...args).then((key: string, response: LanguageResponse<T>) => {
      IPC.off(key)
      if (response?.code === 0 && response.data) {
        resolve(response.data)
      } else {
        reject(new Error(response?.msg || `Language request failed: ${command}`))
      }
    })
  })

export class RendererLanguageService {
  readonly elementPlusLocale = shallowRef<Language>(ElementPlusEnglish)
  private requestSequence = 0

  async initialize() {
    const bootstrap = await request<LanguageBootstrapResult>('application:language-bootstrap')
    const payload = bootstrap.payload
    const elementLocale = await loadElementPlusLocale(payload.locale)
    applyLanguagePayload(payload)
    this.elementPlusLocale.value = elementLocale
    return { locale: payload.locale, warning: bootstrap.warning }
  }

  async switchLocale(locale: string) {
    const sequence = ++this.requestSequence
    const [prepared, elementLocale] = await Promise.all([
      request<LanguagePrepared>('application:language-prepare', locale),
      loadElementPlusLocale(locale)
    ])
    if (sequence !== this.requestSequence) throw new Error('Stale language request')
    const payload = await request<LanguageRuntimePayload>(
      'application:language-commit',
      prepared.token
    )
    if (sequence !== this.requestSequence) throw new Error('Stale language request')
    applyLanguagePayload(payload)
    this.elementPlusLocale.value = elementLocale
    return payload.locale
  }

  applyBroadcast(payload: LanguageRuntimePayload) {
    return loadElementPlusLocale(payload.locale).then((elementLocale) => {
      applyLanguagePayload(payload)
      this.elementPlusLocale.value = elementLocale
    })
  }
}

export const RendererLanguage = new RendererLanguageService()
```

- [ ] **Step 6: Install the empty i18n instance without reading AppStore**

In `src/render/core/VueExtend.ts`, replace:

```ts
const appStore = AppStore()
app.use(AppI18n(appStore?.config?.setup?.lang))
```

with:

```ts
app.use(AppI18n())
```

Remove the unused `AppStore` import.

- [ ] **Step 7: Await renderer locale installation before Vue mount**

In `src/render/main.ts`, remove the eager `lang.loadCustomerLang()` call. Change the `store.initConfig()` continuation to an async callback whose first UI initialization steps are:

```ts
store
  .initConfig()
  .then(async () => {
    const bootstrap = await RendererLanguage.initialize()
    store.config.setup.lang = bootstrap.locale
    ThemeInit()
    appRoot.mount('#app')
    if (bootstrap.warning) {
      MessageError(bootstrap.warning)
    }
  })
  .catch((error) => {
    console.error('Renderer initialization failed:', error)
  })
```

Import `RendererLanguage` and `MessageError`, and remove the `AppI18n` import from this entry.

- [ ] **Step 8: Drive Element Plus from the loaded locale object**

In `src/render/components/Main.vue`, replace the AppStore language and `ElementPlusLang` lookup with:

```ts
import { computed } from 'vue'
import { RendererLanguage } from '@/core/LanguageService'

const locale = computed(() => RendererLanguage.elementPlusLocale.value)
```

Remove `ref`, `AppStore`, `ElementPlusLang`, and the stale non-reactive `language` variable.

- [ ] **Step 9: Add the package script and run renderer checks**

Add:

```json
"test:language-renderer": "tsx scripts/language-renderer-test.ts"
```

Run:

```bash
yarn test:language-renderer
yarn test:language-runtime
npx vue-tsc --noEmit
```

Expected: focused tests pass; TypeScript reports no new errors.

- [ ] **Step 10: Commit renderer lazy loading**

```bash
git add package.json configs/vite.config.ts scripts/language-renderer-test.ts src/lang/render.ts src/render/core/LanguageService.ts src/render/core/VueExtend.ts src/render/main.ts src/render/components/Main.vue
git commit -m "feat: load renderer locales lazily"
```

---

### Task 8: Make the Language Picker Transactional and Custom Locales Metadata-Only

**Files:**
- Modify: `src/main/core/LanguageRepository.ts`
- Modify: `src/main/core/LanguageCoordinator.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `src/main/core/AppNodeFn.ts`
- Delete: `src/main/core/CustomerLang.ts`
- Modify: `src/render/components/Setup/LangSet/index.vue`
- Modify: `src/render/components/Setup/LangSet/setup.ts`
- Modify: `src/render/util/NodeFn.ts`
- Modify: `scripts/language-repository-test.ts`
- Modify: `scripts/language-main-integration-test.ts`

- [ ] **Step 1: Extend failing tests for metadata-only listing and template creation**

Add to `scripts/language-repository-test.ts` after `listCustom()` is asserted:

```ts
const templateDirectory = await repository.initializeCustomTemplate('en')
assert.equal(templateDirectory, join(customRoot, 'en'))
assert.deepEqual(await repository.listCustom(), [{ locale: 'pirate', label: 'Pirate' }])
await writeFile(join(customRoot, 'pirate', 'base.json'), JSON.stringify({ title: 'Ahoy again' }))
repository.invalidate('pirate')
assert.deepEqual((await repository.load('pirate')).messages, {
  base: { title: 'Ahoy again' }
})
```

Add to `scripts/language-main-integration-test.ts`:

```ts
assert.match(ipcHandler, /application:language-list-custom/)
assert.match(ipcHandler, /application:language-init-custom/)
const appNodeFn = readFileSync('src/main/core/AppNodeFn.ts', 'utf8')
assert.doesNotMatch(appNodeFn, /import ZH from '@lang\/zh'/)
assert.doesNotMatch(appNodeFn, /import EN from '@lang\/en'/)
```

- [ ] **Step 2: Run tests and verify the new IPC assertions fail**

Run:

```bash
yarn test:language-repository
yarn test:language-main
```

Expected: repository remains green; main integration fails because custom language commands still use `AppNodeFn`.

- [ ] **Step 3: Add coordinator methods for custom metadata and templates**

Extend the repository contract in `LanguageCoordinator.ts`:

```ts
listCustom?(): Promise<Array<{ locale: string; label: string }>>
initializeCustomTemplate?(locale: 'en' | 'zh'): Promise<string>
invalidate?(locale: string): void
```

Add coordinator methods:

```ts
listCustom() {
  return this.options.repository.listCustom?.() ?? Promise.resolve([])
}

initializeCustomTemplate(locale: 'en' | 'zh') {
  if (!this.options.repository.initializeCustomTemplate) {
    return Promise.reject(new Error('Custom locale templates are unavailable'))
  }
  return this.options.repository.initializeCustomTemplate(locale)
}

invalidate(locale: string) {
  this.options.repository.invalidate?.(locale)
}
```

- [ ] **Step 4: Route custom language operations through dedicated IPC commands**

Add these cases to `IPCHandler.handleRegularCommand`:

```ts
case 'application:language-list-custom':
  this.handleLanguageListCustom(command, key)
  break
case 'application:language-init-custom':
  this.handleLanguageInitCustom(command, key, args[0] === 'zh' ? 'zh' : 'en')
  break
case 'application:language-invalidate':
  this.deps.languageCoordinator.invalidate(args[0])
  this.sendToMainWindow(command, key, { code: 0, data: true })
  break
```

Implement:

```ts
private handleLanguageListCustom(command: string, key: string) {
  this.deps.languageCoordinator
    .listCustom()
    .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
    .catch((error) =>
      this.sendToMainWindow(command, key, { code: 1, msg: String(error) })
    )
}

private handleLanguageInitCustom(command: string, key: string, locale: 'en' | 'zh') {
  this.deps.languageCoordinator
    .initializeCustomTemplate(locale)
    .then((data) => this.sendToMainWindow(command, key, { code: 0, data }))
    .catch((error) =>
      this.sendToMainWindow(command, key, { code: 1, msg: String(error) })
    )
}
```

Remove `lang_initCustomerLang` and `lang_loadCustomerLang` from `AppNodeFn.ts`, along with imports of `ZH`, `EN`, `AppAllLang`, `AppI18n`, and `CustomerLang`. Remove the obsolete `app-customer-lang-update` case, `handleCustomerLangUpdate()`, and `CustomerLang` import from `IPCHandler.ts`; committed custom changes now pass through prepare/commit. Delete `src/main/core/CustomerLang.ts`; Task 6 already removed its only other runtime consumer from `ServerManager`.

- [ ] **Step 5: Replace renderer custom-language helpers with typed requests**

In `src/render/util/NodeFn.ts`, replace the current `lang` object with:

```ts
type CustomLocaleMetadata = { locale: string; label: string }
type LanguageResponse<T> = { code: number; data?: T; msg?: string }

const languageRequest = <T>(command: string, ...args: unknown[]) =>
  new Promise<T>((resolve, reject) => {
    IPC.send(command, ...args).then((key: string, response: LanguageResponse<T>) => {
      IPC.off(key)
      if (response?.code === 0 && response.data !== undefined) resolve(response.data)
      else reject(new Error(response?.msg || `Language request failed: ${command}`))
    })
  })

export const lang = {
  listCustom: () => languageRequest<CustomLocaleMetadata[]>('application:language-list-custom'),
  invalidate: (locale: string) =>
    languageRequest<boolean>('application:language-invalidate', locale),
  initCustom: (locale: 'en' | 'zh') =>
    languageRequest<string>('application:language-init-custom', locale)
}
```

Remove `AppI18n` and custom payload installation from this renderer utility.

- [ ] **Step 6: Make the picker await `switchLocale` before changing state**

In `LangSet/index.vue`, replace `v-model="appLang"` with:

```vue
:model-value="appLang"
@change="onLanguageChange"
```

Replace the computed setter with:

```ts
const appLang = computed(() => appStore.config.setup.lang)

const onLanguageChange = async (locale: string) => {
  if (running.value || locale === appLang.value) return
  running.value = true
  try {
    const committedLocale = await RendererLanguage.switchLocale(locale)
    appStore.config.setup.lang = committedLocale
  } catch (error) {
    MessageError(String(error))
  } finally {
    running.value = false
  }
}
```

Import `RendererLanguage` and `MessageError`. Remove `nextTick`, `AppI18n`, and the call to `AppStore().saveConfig()`; the main coordinator persists the successful commit.

Build the picker list from `AppAllLang` metadata only. Replace the `LangSetup` methods with metadata-only discovery plus on-demand reload of the active custom locale:

```ts
async doLoad() {
  if (this.loading) return
  this.loading = true
  try {
    const items = await lang.listCustom()
    CustomerLangs.splice(
      0,
      CustomerLangs.length,
      ...items.map((item) => ({ label: item.label, lang: item.locale }))
    )
    const currentLocale = AppStore().config.setup.lang
    if (
      !Object.hasOwn(AppAllLang, currentLocale) &&
      items.some((item) => item.locale === currentLocale)
    ) {
      await lang.invalidate(currentLocale)
      await RendererLanguage.switchLocale(currentLocale)
    }
  } finally {
    this.loading = false
  }
},
async openLangDir(locale: string) {
  await lang.initCustom(locale === 'zh' ? 'zh' : 'en')
  const langDir = resolve(window.Server.BaseDir!, '../lang')
  await shell.openPath(langDir)
}
```

Import `CustomerLangs`, `AppAllLang`, `AppStore`, and `RendererLanguage` into the setup module. Change the folder button to `@click.stop="LangSetup.openLangDir(appLang)"`. This preserves the refresh button's existing ability to apply edits to the active custom locale without preloading inactive custom payloads.

- [ ] **Step 7: Run repository, main, and renderer checks**

```bash
yarn test:language-repository
yarn test:language-main
yarn test:language-renderer
npx vue-tsc --noEmit
```

Expected: all commands pass. Opening the picker reads only metadata; selecting a custom locale goes through the same prepare/commit path as a built-in locale.

- [ ] **Step 8: Commit transactional picker and custom loading**

```bash
git add scripts/language-repository-test.ts scripts/language-main-integration-test.ts src/main/core/LanguageRepository.ts src/main/core/LanguageCoordinator.ts src/main/core/IPCHandler.ts src/main/core/AppNodeFn.ts src/main/core/CustomerLang.ts src/render/components/Setup/LangSet/index.vue src/render/components/Setup/LangSet/setup.ts src/render/util/NodeFn.ts
git commit -m "feat: switch built-in and custom locales atomically"
```

---

### Task 9: Synchronize Modern and Classic Tray Locales

**Files:**
- Modify: `src/main/Application.ts`
- Modify: `src/main/ui/TrayManager.ts`
- Modify: `src/render/tray.main.ts`
- Modify: `src/render/tray/store/app.ts`
- Modify: `scripts/language-renderer-test.ts`

- [ ] **Step 1: Add failing tray behavior assertions**

Append to `scripts/language-renderer-test.ts`:

```ts
const trayMain = readFileSync('src/render/tray.main.ts', 'utf8')
const application = readFileSync('src/main/Application.ts', 'utf8')
assert.match(trayMain, /APP-Language-Changed/)
assert.match(trayMain, /await RendererLanguage\.applyBroadcast/)
assert.match(trayMain, /tryMount/)
assert.match(application, /trayManager\.menuChange\(this\.trayManager\.status\)/)
```

- [ ] **Step 2: Run the test and verify tray assertions fail**

```bash
yarn test:language-renderer
```

Expected: FAIL because the tray mounts before receiving a language snapshot and does not listen for committed changes.

- [ ] **Step 3: Rebuild the classic tray menu after main runtime commit**

Use this `refreshNativeUi` callback when constructing `LanguageCoordinator` in `Application.ts`:

```ts
refreshNativeUi: () => {
  this.menuManager?.rebuild()
  if (this.trayManager?.status) {
    this.trayManager.menuChange(this.trayManager.status)
  }
}
```

Keep `TrayManager.menuChange()` as the single classic-menu builder and verify its `I18nT` import is `@lang/runtime`.

- [ ] **Step 4: Bootstrap the modern tray before its first mount**

In `src/render/tray.main.ts`, create the Vue app immediately but defer `mount` until both the first store sync and the first authoritative language snapshot arrive:

```ts
const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
let mounted = false
let storeReady = false
let languageReady = false

const tryMount = () => {
  if (!mounted && storeReady && languageReady) {
    app.mount('#app')
    mounted = true
    ThemeInit()
  }
}

IPC.on('APP:Tray-Store-Sync').then((key: string, res: any) => {
  const appStore = AppStore()
  Object.assign(appStore, res)
  storeReady = true
  tryMount()
})

IPC.on('APP-Language-Changed').then(
  async (key: string, payload: LanguageRuntimePayload) => {
    await RendererLanguage.applyBroadcast(payload)
    AppStore().lang = payload.locale
    languageReady = true
    tryMount()
  }
)
```

Import `RendererLanguage` and `LanguageRuntimePayload`. Remove the old `AppI18n(appStore.lang)` call and the unconditional `app.mount`, `ThemeInit`, and old duplicate tray-store listener.

- [ ] **Step 5: Ensure main publishes to a live tray and resynchronizes a recreated tray**

Keep `publishLanguage()` sending `APP-Language-Changed` when `trayWindow` exists. In `setupModernTray()`, after the existing store sync, also send the coordinator snapshot:

```ts
const languageCommand = 'APP-Language-Changed'
this.windowManager.sendCommandTo(
  this.trayWindow!,
  languageCommand,
  languageCommand,
  this.languageCoordinator.snapshot()
)
```

This makes a tray window recreated after a missed broadcast converge on the authoritative locale.

- [ ] **Step 6: Verify tray integration**

```bash
yarn test:language-renderer
npx vue-tsc --noEmit
```

Expected: PASS. Manual development check: both modern tray labels and classic tray menu labels switch without reopening FlyEnv.

- [ ] **Step 7: Commit tray synchronization**

```bash
git add scripts/language-renderer-test.ts src/main/Application.ts src/main/ui/TrayManager.ts src/render/tray.main.ts src/render/tray/store/app.ts
git commit -m "feat: synchronize tray locale changes"
```

---

### Task 10: Synchronize Live and Newly Spawned Fork Processes

**Files:**
- Create: `src/fork/LanguageService.ts`
- Create: `scripts/language-fork-test.ts`
- Modify: `src/fork/index.ts`
- Modify: `src/main/core/ForkManager.ts`
- Modify: `src/shared/requestTimer/index.ts`
- Modify: `src/fork/module/Apache/index.ts`
- Modify: `src/fork/module/Base/index.ts`
- Modify: `src/fork/module/Caddy/index.ts`
- Modify: `src/fork/module/CliProxyAPI/index.ts`
- Modify: `src/fork/module/Consul/index.ts`
- Modify: `src/fork/module/ETCD/index.ts`
- Modify: `src/fork/module/Elasticsearch/index.ts`
- Modify: `src/fork/module/FrankenPHP/index.ts`
- Modify: `src/fork/module/Hermes/index.ts`
- Modify: `src/fork/module/Host/Task.ts`
- Modify: `src/fork/module/Host/index.ts`
- Modify: `src/fork/module/Image/index.ts`
- Modify: `src/fork/module/LanguageProject/index.ts`
- Modify: `src/fork/module/MailPit/index.ts`
- Modify: `src/fork/module/Mariadb/index.ts`
- Modify: `src/fork/module/MeiliSearch/index.ts`
- Modify: `src/fork/module/Memcached/index.ts`
- Modify: `src/fork/module/Minio/index.ts`
- Modify: `src/fork/module/ModuleCustomer/index.ts`
- Modify: `src/fork/module/Mongodb/index.ts`
- Modify: `src/fork/module/Mysql/index.ts`
- Modify: `src/fork/module/N8N/index.ts`
- Modify: `src/fork/module/Nginx/index.ts`
- Modify: `src/fork/module/Numa/index.ts`
- Modify: `src/fork/module/Ollama/index.ts`
- Modify: `src/fork/module/OpenClaw/index.ts`
- Modify: `src/fork/module/Php.win/index.ts`
- Modify: `src/fork/module/Php/index.ts`
- Modify: `src/fork/module/Postgresql/index.ts`
- Modify: `src/fork/module/Project/index.ts`
- Modify: `src/fork/module/PureFtpd/index.ts`
- Modify: `src/fork/module/Qdrant/index.ts`
- Modify: `src/fork/module/RabbitMQ/index.ts`
- Modify: `src/fork/module/Redis/index.ts`
- Modify: `src/fork/module/Rnacos/index.ts`
- Modify: `src/fork/module/RoadRunner/index.ts`
- Modify: `src/fork/module/RustFS/index.ts`
- Modify: `src/fork/module/Tomcat/index.ts`
- Modify: `src/fork/module/Tool/index.ts`
- Modify: `src/fork/module/Typesense/index.ts`
- Modify: `src/fork/module/ZincSearch/index.ts`
- Modify: `src/fork/util/ServiceStart.ts`
- Modify: `src/fork/util/ServiceStart.win.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing fork language-service test**

Create `scripts/language-fork-test.ts`:

```ts
import assert from 'node:assert/strict'
import { ForkLanguageService } from '../src/fork/LanguageService'
import type { LanguageChanged, LanguageRuntimePayload } from '../src/shared/LanguageProtocol'

const applied: string[] = []
const sent: unknown[] = []
const service = new ForkLanguageService({
  apply: (payload) => applied.push(payload.locale),
  send: (message) => sent.push(message)
})

const payload: LanguageRuntimePayload = {
  locale: 'zh',
  fallbackLocale: 'en',
  messages: { base: { title: '中文' } },
  fallbackMessages: { base: { title: 'English' } }
}

service.initialize(payload)
assert.deepEqual(applied, ['zh'])

const changed: LanguageChanged = {
  type: 'language-changed',
  requestId: 'change-1',
  payload: { ...payload, locale: 'de', messages: { base: { title: 'Deutsch' } } }
}
assert.equal(service.handle(changed), true)
assert.deepEqual(applied, ['zh', 'de'])
assert.deepEqual(sent, [
  { type: 'language-changed-ack', requestId: 'change-1', locale: 'de' }
])
assert.equal(service.handle({ type: 'normal-command' }), false)
console.log('language fork tests passed')
```

- [ ] **Step 2: Run the test and verify the missing service failure**

```bash
npx tsx scripts/language-fork-test.ts
```

Expected: FAIL because `src/fork/LanguageService.ts` does not exist.

- [ ] **Step 3: Implement fork payload application and acknowledgement**

Create `src/fork/LanguageService.ts`:

```ts
import { applyLanguagePayload } from '@lang/runtime'
import {
  isLanguageChanged,
  type LanguageChangedAck,
  type LanguageRuntimePayload
} from '@shared/LanguageProtocol'

interface ForkLanguageServiceOptions {
  apply?: (payload: LanguageRuntimePayload) => void
  send?: (message: LanguageChangedAck) => void
}

export class ForkLanguageService {
  private readonly apply: (payload: LanguageRuntimePayload) => void
  private readonly send: (message: LanguageChangedAck) => void

  constructor(options: ForkLanguageServiceOptions = {}) {
    this.apply = options.apply ?? applyLanguagePayload
    this.send = options.send ?? ((message) => process.send?.(message))
  }

  initialize(payload: LanguageRuntimePayload) {
    this.apply(payload)
  }

  handle(message: unknown) {
    if (!isLanguageChanged(message)) return false
    this.apply(message.payload)
    this.send({
      type: 'language-changed-ack',
      requestId: message.requestId,
      locale: message.payload.locale
    })
    return true
  }
}

export default new ForkLanguageService()
```

- [ ] **Step 4: Apply initialization payloads before `BaseManager.init()`**

In `src/fork/index.ts`, remove `AppI18n` and import `ForkLanguageService`. At the top of the message handler add:

```ts
if (ForkLanguageService.handle(args)) {
  return
}
```

Replace the server initialization branch with:

```ts
if (args.Server) {
  global.Server = args.Server
  if (args.Language) {
    ForkLanguageService.initialize(args.Language)
  }
  manager.init()
  return
}
```

Do not initialize `BaseManager` before the language payload is installed.

- [ ] **Step 5: Send language snapshots with every fork initialization**

In `ForkManager`, add:

```ts
private languageSnapshotProvider?: () => LanguageRuntimePayload

setLanguageSnapshotProvider(provider: () => LanguageRuntimePayload) {
  this.languageSnapshotProvider = provider
}
```

Add this final constructor parameter to `ForkItem`:

```ts
private readonly languageSnapshotProvider: () => LanguageRuntimePayload | undefined
```

For every `new ForkItem` constructor call in `ForkManager`, append this final argument:

```ts
() => this.languageSnapshotProvider?.()
```

Replace both existing `child.postMessage({ Server: JSON.parse(JSON.stringify(Server)) })` calls with a `postInitialization` helper:

```ts
private postInitialization(child: UtilityProcess) {
  child.postMessage({
    Server: JSON.parse(JSON.stringify(Server)),
    Language: this.languageSnapshotProvider()
  })
}
```

Call `postInitialization(child)` in the constructor and immediately before every command sent by `ForkItem.send()`.

After `initForkManager()` creates the manager in `Application.ts`, add:

```ts
this.forkManager.setLanguageSnapshotProvider(() => this.languageCoordinator.snapshot())
```

- [ ] **Step 6: Replace the temporary broadcast with acknowledged delivery**

Add to `ForkItem`:

```ts
private readonly languageAcks = new Map<
  string,
  { resolve: (value: boolean) => void; timer: NodeJS.Timeout }
>()

sendLanguage(message: LanguageChanged, timeoutMs = 1_000) {
  if (this.childExited) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      this.languageAcks.delete(message.requestId)
      resolve(false)
    }, timeoutMs)
    this.languageAcks.set(message.requestId, { resolve, timer })
    try {
      this.child.postMessage(message)
    } catch {
      clearTimeout(timer)
      this.languageAcks.delete(message.requestId)
      resolve(false)
    }
  })
}
```

At the start of `ForkItem.onMessage`, before normal task routing, add:

```ts
if (isLanguageChangedAck(message)) {
  const pending = this.languageAcks.get(message.requestId)
  if (pending) {
    clearTimeout(pending.timer)
    this.languageAcks.delete(message.requestId)
    pending.resolve(true)
  }
  return
}
```

Import `isLanguageChangedAck`, `LanguageChanged`, and `LanguageRuntimePayload`. Replace the Task 6 no-op `broadcastLanguage` with:

```ts
async broadcastLanguage(message: LanguageChanged) {
  const forks = new Set(
    [this.ftpsrvFork, this.dnsFork, this.ollamaChatFork, ...this.forks].filter(
      (item): item is ForkItem => !!item && !item.childExited
    )
  )
  return Promise.all([...forks].map((fork) => fork.sendLanguage(message)))
}
```

Resolve every outstanding language acknowledgement with `false` from `ForkItem.onExit()` and `destroy()` so shutdown never leaves pending Promises.

Use this helper from both methods:

```ts
private resolveLanguageAcks() {
  for (const pending of this.languageAcks.values()) {
    clearTimeout(pending.timer)
    pending.resolve(false)
  }
  this.languageAcks.clear()
}
```

- [ ] **Step 7: Make fork translation consumers use the shared lightweight runtime**

Replace `from '@lang/index'` with `from '@lang/runtime'` for `I18nT` imports in `src/fork/**/*.ts` and `src/shared/requestTimer/index.ts`. Do not change type-only imports. Verify the replacement list with:

```bash
rg -n "from '@lang/index'" src/fork src/shared
```

Expected after replacement: no runtime import remains in `src/fork`; any remaining shared result must be inspected and changed if it executes in a fork.

- [ ] **Step 8: Add the package script and run fork checks**

Add:

```json
"test:language-fork": "tsx scripts/language-fork-test.ts"
```

Run:

```bash
yarn test:language-fork
yarn test:language-coordinator
npx vue-tsc --noEmit
```

Expected: PASS. A live fork receives the update and acknowledges it; a future fork installs the coordinator snapshot before its manager initializes.

- [ ] **Step 9: Commit fork synchronization**

```bash
git add package.json scripts/language-fork-test.ts src/fork/LanguageService.ts src/fork/index.ts src/main/core/ForkManager.ts src/main/Application.ts src/shared/requestTimer/index.ts src/fork/module/Apache/index.ts src/fork/module/Base/index.ts src/fork/module/Caddy/index.ts src/fork/module/CliProxyAPI/index.ts src/fork/module/Consul/index.ts src/fork/module/ETCD/index.ts src/fork/module/Elasticsearch/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/Hermes/index.ts src/fork/module/Host/Task.ts src/fork/module/Host/index.ts src/fork/module/Image/index.ts src/fork/module/LanguageProject/index.ts src/fork/module/MailPit/index.ts src/fork/module/Mariadb/index.ts src/fork/module/MeiliSearch/index.ts src/fork/module/Memcached/index.ts src/fork/module/Minio/index.ts src/fork/module/ModuleCustomer/index.ts src/fork/module/Mongodb/index.ts src/fork/module/Mysql/index.ts src/fork/module/N8N/index.ts src/fork/module/Nginx/index.ts src/fork/module/Numa/index.ts src/fork/module/Ollama/index.ts src/fork/module/OpenClaw/index.ts src/fork/module/Php.win/index.ts src/fork/module/Php/index.ts src/fork/module/Postgresql/index.ts src/fork/module/Project/index.ts src/fork/module/PureFtpd/index.ts src/fork/module/Qdrant/index.ts src/fork/module/RabbitMQ/index.ts src/fork/module/Redis/index.ts src/fork/module/Rnacos/index.ts src/fork/module/RoadRunner/index.ts src/fork/module/RustFS/index.ts src/fork/module/Tomcat/index.ts src/fork/module/Tool/index.ts src/fork/module/Typesense/index.ts src/fork/module/ZincSearch/index.ts src/fork/util/ServiceStart.ts src/fork/util/ServiceStart.win.ts
git commit -m "feat: synchronize fork locale changes"
```

---

### Task 11: Remove Eager Locale Imports and Audit Every Entry Bundle

**Files:**
- Modify: `src/lang/index.ts`
- Delete: obsolete eager locale aggregation code from `src/lang/index.ts`
- Create: `scripts/language-bundle-audit-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing bundle/input audit**

Create `scripts/language-bundle-audit-test.ts`:

```ts
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const buildEntry = async (entryPoint: string) =>
  build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'esnext',
    packages: 'external',
    logLevel: 'silent'
  })

for (const entry of ['src/main/index.ts', 'src/fork/index.ts']) {
  const result = await buildEntry(entry)
  const localePayloadInputs = Object.keys(result.metafile!.inputs).filter((file) =>
    /src\/lang\/(ar|az|bg|bn|cs|da|de|el|en|es|fi|fr|hr|hu|id|it|ja|ko|nl|no|pl|pt|pt-br|ro|ru|sv|tr|uk|vi|zh|zh-hant)\//.test(file)
  )
  assert.deepEqual(localePayloadInputs, [], `${entry} bundled locale payloads`)
}

const indexSource = readFileSync('src/lang/index.ts', 'utf8')
assert.doesNotMatch(indexSource, /^import AR from/m)
assert.doesNotMatch(indexSource, /^import ZH from/m)
assert.doesNotMatch(indexSource, /const lang =/)
console.log('language bundle audit tests passed')
```

- [ ] **Step 2: Run the audit and verify eager payload inputs are reported**

```bash
npx tsx scripts/language-bundle-audit-test.ts
```

Expected: FAIL and identify built-in locale input files reachable from at least one entry.

- [ ] **Step 3: Replace `src/lang/index.ts` with payload-free compatibility exports**

Replace the runtime body of `src/lang/index.ts` with:

```ts
export { AppAllLang, BuiltInLocaleCatalog, FALLBACK_LOCALE, normalizeLocale } from './catalog'
export type { BuiltInLocale } from './catalog'
export type { LangKey } from './types'
export {
  AppI18n,
  I18nT,
  applyLanguagePayload,
  getActiveLocale,
  releaseLocalePayload
} from './runtime'
```

There must be no value import from any `src/lang/<locale>` directory. Type-only imports remain isolated in `types.ts` and are erased by TypeScript/esbuild.

- [ ] **Step 4: Remove the last eager runtime references**

Run:

```bash
rg -n "^import .* from './(ar|az|bg|bn|cs|da|de|el|en|es|fi|fr|hr|hu|id|it|ja|ko|nl|no|pl|pt|pt-br|ro|ru|sv|tr|uk|vi|zh|zh-hant)/index'" src/lang
rg -n "AppI18n\([^)]" src/main src/render src/fork src/shared
```

Expected: no eager value import and no call that attempts synchronous locale loading. `AppI18n()` without arguments remains valid.

If the second command reports an argument-bearing `AppI18n(locale)` call, stop and complete the owning integration task before proceeding. `I18nT` and `AppAllLang` consumers may continue importing the now payload-free `@lang/index` entry.

- [ ] **Step 5: Add the audit script and run all focused language tests**

Add to `package.json`:

```json
"test:language-bundle": "tsx scripts/language-bundle-audit-test.ts",
"test:language-lazy": "yarn test:language-assets && yarn test:language-runtime && yarn test:language-repository && yarn test:language-coordinator && yarn test:language-build-hook && yarn test:language-main && yarn test:language-renderer && yarn test:language-fork && yarn test:language-bundle"
```

Run:

```bash
yarn test:language-lazy
npx vue-tsc --noEmit
```

Expected: every focused test passes and no locale payload input appears in main or fork bundles.

- [ ] **Step 6: Build the renderer and inspect initial chunks**

Run:

```bash
npx tsx -e "import { build } from 'vite'; import config from './configs/vite.config'; await build(config.buildConfig)"
rg -n 'ফাইলটি এখানে ড্র্যাগ করুন' dist/render/static/js/main.*.js dist/render/static/js/tray.*.js
```

Expected: the build succeeds and the `rg` command produces no match in the initial main or tray entry. FlyEnv locale labels can appear from the small catalog, but complete translation payload text from unrelated locales must appear only in external JSON assets. Element Plus English is the only eager locale; every other Element Plus locale must appear only in its `element-plus-locale-*` chunk.

- [ ] **Step 7: Commit the eager-import removal**

```bash
git add package.json src/lang/index.ts src/lang/types.ts scripts/language-bundle-audit-test.ts
git commit -m "perf: remove eager locale payload imports"
```

---

### Task 12: Add Memory Regression Measurement and Complete Verification

**Files:**
- Create: `scripts/language-memory-benchmark.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-07-17-lazy-locale-loading-design.md` only if measured thresholds require a documented correction

- [ ] **Step 1: Add a fresh-process memory benchmark**

Create `scripts/language-memory-benchmark.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const assetRoot = join(root, 'dist/electron/static/lang')
const manifest = JSON.parse(readFileSync(join(assetRoot, 'manifest.json'), 'utf8'))
const runs = 9

const childSource = String.raw`
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createI18n } from 'vue-i18n'
const assetRoot = process.argv[2]
const locales = JSON.parse(process.argv[3])
const messages = {}
for (const locale of locales) {
  const asset = JSON.parse(readFileSync(join(assetRoot, locale + '.json'), 'utf8'))
  messages[locale] = asset.messages
}
globalThis.__keep = createI18n({
  locale: locales.at(-1),
  fallbackLocale: 'en',
  messages
})
if (global.gc) global.gc()
await new Promise((resolve) => setTimeout(resolve, 80))
if (global.gc) global.gc()
const memory = process.memoryUsage()
console.log(JSON.stringify({ rss: memory.rss, heapUsed: memory.heapUsed }))
`

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const measure = (locales: string[]) => {
  const samples = [] as Array<{ rss: number; heapUsed: number }>
  for (let index = 0; index < runs; index += 1) {
    const result = spawnSync(
      process.execPath,
      ['--expose-gc', '--input-type=module', '-', assetRoot, JSON.stringify(locales)],
      { cwd: root, input: childSource, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    )
    if (result.status !== 0) throw new Error(result.stderr || String(result.error))
    samples.push(JSON.parse(result.stdout.trim()))
  }
  return {
    rss: median(samples.map((sample) => sample.rss)),
    heapUsed: median(samples.map((sample) => sample.heapUsed))
  }
}

const allLocales = Object.keys(manifest.locales).sort()
const optimized = measure(['en', 'zh'])
const eager = measure(allLocales)
const mib = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100
const result = {
  runs,
  optimized: { rssMiB: mib(optimized.rss), heapUsedMiB: mib(optimized.heapUsed) },
  eager: { rssMiB: mib(eager.rss), heapUsedMiB: mib(eager.heapUsed) },
  rssSavedMiB: mib(eager.rss - optimized.rss)
}
console.log(JSON.stringify(result, null, 2))
if (result.optimized.rssMiB > 66) throw new Error('Optimized locale RSS exceeded 66 MiB')
if (result.rssSavedMiB < 35) throw new Error('Locale RSS improvement was below 35 MiB')
```

- [ ] **Step 2: Add the benchmark script and run it against generated assets**

Add:

```json
"test:language-memory": "yarn build:language-assets && tsx scripts/language-memory-benchmark.ts"
```

Run:

```bash
yarn test:language-memory
```

Expected in the current environment: optimized median RSS at or below 66 MiB and at least 35 MiB lower than all locales. Record the JSON output in the task handoff.

- [ ] **Step 3: Run all deterministic regression tests**

```bash
yarn test:language-lazy
yarn test:helper:contract
yarn test:startup-groups
yarn test:env-sync-coordinator
yarn test:stop-process-list-cache
yarn test:bin-version-cache
npx vue-tsc --noEmit
```

Expected: every command exits 0. If the repository has pre-existing TypeScript failures, capture the exact baseline and verify no new error references a changed language file.

- [ ] **Step 4: Run focused lint and production entry builds**

```bash
npx eslint src/lang src/shared/LanguageProtocol.ts src/main/core/LanguageRepository.ts src/main/core/LanguageCoordinator.ts src/main/core/ForkManager.ts src/fork/LanguageService.ts src/render/core/LanguageService.ts scripts/build-language-assets.ts scripts/language-*-test.ts scripts/language-memory-benchmark.ts
npx esbuild src/main/index.ts --bundle --packages=external --platform=node --format=esm --target=esnext --outfile=/tmp/flyenv-main-language-check.mjs
npx esbuild src/fork/index.ts --bundle --packages=external --platform=node --format=esm --target=esnext --outfile=/tmp/flyenv-fork-language-check.mjs
```

Expected: lint exits 0 and both entry builds succeed. Neither output contains complete locale payloads when inspected by `test:language-bundle`.

- [ ] **Step 5: Perform the macOS release-mode smoke and memory comparison**

Build or run the existing release-mode development entry, then verify:

1. Start with Chinese configured; no untranslated key appears before the main window.
2. Record the top-level Electron main-process RSS after a fixed 10-second idle period.
3. Switch to English, German, and a custom locale without restart.
4. Verify main window, Element Plus components, classic tray, modern tray, native dialogs, and a fork-produced message.
5. Switch through ten locales, return to Chinese, force no tasks, wait 10 seconds, and record RSS again.
6. Confirm initial optimized main RSS is at least 25 MiB below the pre-change same-machine baseline.
7. Confirm post-switch RSS is within 5 MiB of the optimized initial measurement.
8. Record 20 built-in locale-switch durations with `performance.now()`, sort them, and confirm the 19th value (P95 for 20 samples) is no more than 300 ms.

Record process name, PID, Electron build mode, OS version, RSS/private-memory metric, switch-duration samples, and all measurements in the implementation handoff.

- [ ] **Step 6: Verify packaged asset lookup on all three operating systems**

Use the existing macOS, Windows, and Linux build workflows. For one packaged artifact per OS:

1. Confirm `resources/app.asar/dist/electron/static/lang/manifest.json` is present.
2. Launch with a non-English saved locale.
3. Switch language without restart.
4. Trigger a native menu/dialog and one fork command.
5. Confirm no `Unable to read locale asset` error appears in logs.

Expected: all three packaged builds locate assets from their packaged `global.Server.Static` path and remain functionally equivalent.

- [ ] **Step 7: Commit the benchmark and any evidence-only documentation correction**

```bash
git add package.json scripts/language-memory-benchmark.ts docs/superpowers/specs/2026-07-17-lazy-locale-loading-design.md
git commit -m "test: verify lazy locale memory usage"
```

If the design document did not need a measured-threshold correction, omit it from `git add` and commit only the benchmark files.
