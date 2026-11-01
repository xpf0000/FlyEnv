# SamWaf Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `samwaf` service plugin that downloads official SamWaf WAF binaries (GitHub/Gitee releases only, no mirroring), installs them per-version, manages the process lifecycle, and opens its web admin panel from FlyEnv.

**Architecture:** Clone of the `plugins/kafka` plugin shape (standard `ServiceManager`/`VersionManager` pages, fork module extending `Base`), with `plugins/llamacpp`-style GitHub Releases discovery. The renderer adds one extra feature: an "open admin panel" action that resolves `local_port` from `conf/config.yml` and surfaces the random initial admin password on fresh installs.

**Tech Stack:** TypeScript, Vue 3 SFC, existing host-bridged components (`ServiceManager`, `VersionManager`, `Conf`, `Log`), fork `Base` module, `node:test` for unit tests.

---

## Research Facts (verified, do not re-verify)

Verified by probing the real v1.3.24 Darwin arm64 release on 2026-11-01:

- Release assets: `SamWaf_<OS>_<arch>.v<tag>.<ext>` where `<OS>` ∈ `Windows|Linux|Darwin`, `<arch>` ∈ `x86_64|arm64`, ext `zip` (Windows) / `tar.gz` (rest). Example: `SamWaf_Darwin_arm64.v1.3.24.tar.gz`.
- Each archive contains **one top-level executable**, nothing else:
  - Windows x64: `SamWaf64.exe`
  - Linux x64: `SamWafLinux64`; Linux arm64: `SamWafLinuxArm64`
  - Darwin x64: `SamWafDarwin64`; Darwin arm64: `SamWafDarwinArm64` (arm64 verified; x64 name assumed from the same convention — assert in Task 2 tests and confirm during manual verification)
- The binary resolves `conf/`, `data/`, `logs/` **relative to the executable's own directory**, not the cwd. Spawning with `cwd = <dir of binary>` keeps everything inside the install dir.
- First run auto-generates `conf/config.yml` (defaults: `local_port: 26666`, `security.ip_whitelist: 0.0.0.0/0,::/0`, `security.emergency_path: <random>`) and `data/initial_password.txt` containing a random admin password (fresh installs only; account `admin`).
- Process model: a **supervisor** process spawns a **worker** child; the worker binds the admin port. Stopping must take the whole tree (Base `ProcessOwnedPidsByPid` already does this).
- Logs land in `<exe dir>/logs/`: `log.log` (main), `supervisor.log`, `task/*.log`.
- Default admin listener binds **all interfaces** (`*:26666`). The plugin's seeded default config restricts the whitelist to loopback (see Task 4) — safe default for a local dev tool; users can relax it in the Config tab.
- Download sources: GitHub Releases API `https://api.github.com/repos/samwafgo/SamWaf/releases` (assets carry a `digest: "sha256:..."` field), Gitee mirror API `https://gitee.com/api/v5/repos/samwaf/SamWaf/releases` for CN reachability. Never mirror binaries ourselves.
- SamWaf CLI subcommands (`install/start/stop/...`) register OS services — **do not use them**; FlyEnv runs the binary in the foreground like every other module.
- License: Apache-2.0 + permissive third-party notices; downloading from official sources needs no attribution work on our side.

## Module-boundary decisions (per AGENTS.md + flyenv-module-boundaries)

- No new Pinia store. No `config.setup` entries. No `StorageGetAsync` state — the plugin has no cross-session renderer state (start needs no parameters, so no `startExtParam`/`stopExtParam` registration at all; `ModuleInstalledItem.start()/stop()/restart()` are used as-is).
- View state (selected tab, admin-panel dialog) lives in the mounted Vue components.
- Process/PID/port ownership is entirely in the fork module (`Base` + process-ownership readiness check using the same markers as `Base._stopServer`).
- No long-running renderer operation exists, therefore no singleton controller is required: install/download is owned by the host `VersionManager` + `Base.installSoft`; start/stop is owned by `AsideSetup`/`ServiceManager` + fork; "open admin panel" is a single IPC read + `shell.openExternal`.
- **Exception authorization: none requested, none needed.**

### Operation contracts

| Operation | Owner | Start event | Intermediate | Terminal | Duplicate invocation |
| --- | --- | --- | --- | --- | --- |
| Install version | `Base.installSoft` via host `VersionManager` | row click | `on(row)` progress | `downState: success` / `exception` | Host component disables re-entry on the same row |
| Start service | fork `SamWaf._startServer` | `startService` IPC | `APP-On-Log` progress | resolve `{APP-Service-Start-PID}` / reject | Guarded by `ModuleInstalledItem` run state |
| Stop service | `Base._stopServer` | `stopService` IPC | `APP-On-Log` | `APP-Service-Stop-Success` + resolve | Guarded by `ModuleInstalledItem` run state |
| Open admin panel | `Index.vue` (view-only) | button click | none | `shell.openExternal` resolves / error notice | Idempotent; safe to click repeatedly |

### Failure-boundary notes (per flyenv-failure-boundaries)

- SHA-256 mismatch in `_installSoftHandle` is a **required** failure: throw, let `Base.installSoft.fail()` remove the partial zip/appDir, report install failure. Never install unverified bytes.
- Gitee fallback: GitHub API failure only triggers the fallback; a Gitee failure after that resolves an empty online list (existing kafka behavior: `resolve([])`), never throws into the version page.
- Reading `initial_password.txt` for the admin dialog is a **supplementary** action: if it fails, the panel still opens, the dialog just omits the password. It must not block or fail the open-panel action.
- Stop hooks supply only `_stopSearchName()`/`_stopSignal()`; all discovery, signaling, exit confirmation and PID-file cleanup stay in `Base` (per plugins README shutdown contract).

## File Structure

```
plugins/samwaf/
├── plugin.json                  # manifest
├── lang/
│   ├── en.ts                    # English dictionary
│   ├── zh.ts                    # Chinese dictionary
│   └── index.ts                 # createSamWafT factory (side-agnostic)
├── fork/
│   ├── index.ts                 # default-exports the module instance
│   ├── lang.ts                  # fork-side i18n binding (@lang/runtime)
│   └── SamWaf/
│       ├── index.ts             # fork module class (extends Base)
│       ├── release.ts           # release discovery + asset parsing (pure)
│       └── config.ts            # config.yml template + port/password parsing (pure)
├── render/
│   ├── Module.ts                # AppModuleItem registration
│   ├── Index.vue                # tabs: Service / Version Manager / Config / Logs
│   ├── aside.vue                # sidebar item + service switch
│   ├── Config.vue               # conf/config.yml editor (host Conf component)
│   ├── Logs.vue                 # logs/log.log viewer (host Log component)
│   ├── AdminPanel.vue           # open-panel button + initial-password dialog
│   ├── lang.ts                  # render-side i18n binding (@lang/index)
│   └── samwaf.svg               # module icon
└── tests/
    ├── release.test.ts          # asset parsing, source fallback, sha256 digest
    └── config.test.ts           # default config, port parsing, password parsing
```

The fork module keeps everything under `<AppDir>/samwaf/<version>/` (bin + `conf/` + `data/` + `logs/`), pid file at `<BaseDir>/samwaf/samwaf.pid`, downloaded archives at `<Cache>/SamWaf_<OS>_<arch>.<tag>.<ext>`.

---

### Task 1: Plugin scaffold (manifest, i18n, entries)

**Files:**
- Create: `plugins/samwaf/plugin.json`
- Create: `plugins/samwaf/lang/en.ts`
- Create: `plugins/samwaf/lang/zh.ts`
- Create: `plugins/samwaf/lang/index.ts`
- Create: `plugins/samwaf/fork/index.ts`
- Create: `plugins/samwaf/fork/lang.ts`
- Create: `plugins/samwaf/render/lang.ts`
- Create: `plugins/samwaf/render/Module.ts`
- Create: `plugins/samwaf/render/samwaf.svg` (simple shield icon, any valid single-path SVG)

- [ ] **Step 1: Create the manifest**

`plugins/samwaf/plugin.json`:

```json
{
  "apiVersion": 1,
  "id": "samwaf",
  "name": "SamWaf",
  "version": "0.1.0",
  "description": {
    "en": "SamWaf open-source WAF service module. Runs the official SamWaf binary in the foreground and opens its local web admin panel.",
    "zh": "SamWaf 开源网站防火墙服务模块。以前台方式运行官方 SamWaf 程序，并可打开其本地 Web 管理面板。"
  },
  "author": "FlyEnv",
  "module": {
    "typeFlag": "samwaf",
    "moduleType": "webServer",
    "label": "SamWaf",
    "asideIndex": 71,
    "isService": true,
    "isTray": true,
    "platform": ["Windows", "macOS", "Linux"]
  },
  "entry": {
    "render": "render/Module.ts",
    "fork": "fork/index.ts"
  }
}
```

- [ ] **Step 2: Create the language pack**

`plugins/samwaf/lang/en.ts`:

```ts
export default {
  openAdminPanel: 'Admin Panel',
  adminPanelTitle: 'SamWaf Admin Panel',
  initialPasswordTip:
    'Fresh install detected. Sign in with account "admin" and the random initial password below, then change it immediately.',
  initialPasswordFileHint: 'Also stored in data/initial_password.txt inside the install directory.',
  sha256Mismatch: 'Downloaded archive failed SHA-256 verification and was removed.',
  binNotFoundAfterUnpack: 'SamWaf executable not found after unpacking the archive.'
}
```

`plugins/samwaf/lang/zh.ts`:

```ts
export default {
  openAdminPanel: '管理面板',
  adminPanelTitle: 'SamWaf 管理面板',
  initialPasswordTip: '检测到全新安装。请使用账号 admin 和以下随机初始密码登录，并立即修改密码。',
  initialPasswordFileHint: '该密码同时保存在安装目录下的 data/initial_password.txt。',
  sha256Mismatch: '下载的安装包 SHA-256 校验失败，已删除。',
  binNotFoundAfterUnpack: '解压后未找到 SamWaf 可执行文件。'
}
```

`plugins/samwaf/lang/index.ts` (same factory shape as `plugins/kafka/lang/index.ts`):

```ts
import en from './en'
import zh from './zh'

const messages: Record<string, Record<string, string>> = { en, zh }

export type SamWafLangKey = keyof typeof en

export const createSamWafT = (getLocale: () => string) => {
  return (key: SamWafLangKey, args?: Record<string, string | number>): string => {
    const locale = `${getLocale() ?? 'en'}`.toLowerCase()
    const dict = messages[locale] ?? messages[locale.split('-')[0]] ?? messages.en
    let text = dict?.[key] ?? messages.en[key] ?? key
    if (args) {
      Object.entries(args).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, `${value}`)
      })
    }
    return text
  }
}
```

`plugins/samwaf/fork/lang.ts`:

```ts
import { AppI18n } from '@lang/runtime'
import { createSamWafT } from '../lang'

// `AppI18n` resolves to the fork process's live i18n instance through the
// plugin host bridge. Fall back to English when the bridge is unavailable.
const getLocale = () => {
  try {
    return `${AppI18n?.()?.global?.locale ?? 'en'}`
  } catch {
    return 'en'
  }
}

export const SamWafT = createSamWafT(getLocale)

export type { SamWafLangKey } from '../lang'
```

`plugins/samwaf/render/lang.ts`:

```ts
import { AppI18n } from '@lang/index'
import { createSamWafT } from '../lang'

export const SamWafT = createSamWafT(() => AppI18n().global.locale)

export type { SamWafLangKey } from '../lang'
```

- [ ] **Step 3: Create the module entries**

`plugins/samwaf/fork/index.ts`:

```ts
// The plugin owns a full copy of the SamWaf fork module (./SamWaf).
// plugin:build bundles the referenced FlyEnv fork framework sources into the
// standalone plugin artifact.
import SamWaf from './SamWaf'

export default SamWaf
```

`plugins/samwaf/render/Module.ts`:

```ts
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'webServer',
  typeFlag: 'samwaf',
  label: 'SamWaf',
  icon: import('./samwaf.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 71,
  isService: true,
  isTray: true,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem

export default module
```

`plugins/samwaf/render/samwaf.svg` — a simple shield glyph, e.g.:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M512 64 128 256v288c0 235.2 163.2 384 384 416 220.8-32 384-180.8 384-416V256L512 64zm0 86.4 320 160v233.6c0 192-128 310.4-320 339.2-192-28.8-320-147.2-320-339.2V310.4l320-160z"/></svg>
```

- [ ] **Step 4: Commit**

```bash
git add plugins/samwaf
git commit -m "feat(samwaf-plugin): scaffold manifest, i18n and module entries"
```

---

### Task 2: Release discovery (`fork/SamWaf/release.ts`) with tests

Pure functions only — no `Base`, no `global.Server` — so `node:test` can import them directly (same approach as `plugins/kafka/tests/kraft.test.ts`).

**Files:**
- Create: `plugins/samwaf/fork/SamWaf/release.ts`
- Test: `plugins/samwaf/tests/release.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/samwaf/tests/release.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SAMWAF_EXECUTABLES,
  filterStableReleases,
  parseAssetTarget,
  pickAsset,
  releaseVersionNum,
  sha256OfDigest,
  type SamWafRelease
} from '../fork/SamWaf/release'

const releases: SamWafRelease[] = [
  {
    tag_name: 'v1.3.25-beta.9',
    prerelease: true,
    assets: [
      {
        name: 'SamWaf_Linux_x86_64.v1.3.25-beta.9.tar.gz',
        browser_download_url: 'https://github.com/samwafgo/SamWaf/releases/download/v1.3.25-beta.9/SamWaf_Linux_x86_64.v1.3.25-beta.9.tar.gz',
        digest: 'sha256:0b57556bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5a'
      }
    ]
  },
  {
    tag_name: 'v1.3.24',
    prerelease: false,
    assets: [
      {
        name: 'SamWaf_Windows_x86_64.v1.3.24.zip',
        browser_download_url: 'https://github.com/samwafgo/SamWaf/releases/download/v1.3.24/SamWaf_Windows_x86_64.v1.3.24.zip',
        digest: 'sha256:aaaa5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
      },
      {
        name: 'SamWaf_Darwin_arm64.v1.3.24.tar.gz',
        browser_download_url: 'https://github.com/samwafgo/SamWaf/releases/download/v1.3.24/SamWaf_Darwin_arm64.v1.3.24.tar.gz',
        digest: 'sha256:bbbb5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
      }
    ]
  }
]

test('parses every supported asset target and rejects foreign ones', () => {
  assert.deepEqual(parseAssetTarget('SamWaf_Windows_x86_64.v1.3.24.zip'), {
    platform: 'windows',
    arch: 'x64',
    ext: 'zip',
    executable: 'SamWaf64.exe'
  })
  assert.deepEqual(parseAssetTarget('SamWaf_Linux_arm64.v1.3.24.tar.gz'), {
    platform: 'linux',
    arch: 'arm64',
    ext: 'tar.gz',
    executable: 'SamWafLinuxArm64'
  })
  assert.deepEqual(parseAssetTarget('SamWaf_Darwin_arm64.v1.3.24.tar.gz'), {
    platform: 'macos',
    arch: 'arm64',
    ext: 'tar.gz',
    executable: 'SamWafDarwinArm64'
  })
  assert.equal(parseAssetTarget('checksums.txt'), undefined)
  assert.equal(parseAssetTarget('SamWaf_Linux_386.v1.3.24.tar.gz'), undefined)
})

test('keeps only stable releases and picks the host asset with its sha256', () => {
  const stable = filterStableReleases(releases)
  assert.equal(stable.length, 1)
  assert.equal(stable[0].tag_name, 'v1.3.24')
  const picked = pickAsset(stable[0], 'macos', 'arm64')
  assert.ok(picked)
  assert.equal(picked.version, 'v1.3.24')
  assert.equal(picked.executable, 'SamWafDarwinArm64')
  assert.equal(
    picked.sha256,
    'bbbb5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
  )
  assert.equal(pickAsset(stable[0], 'linux', 'x64'), undefined)
})

test('extracts sha256 only from well-formed digest fields', () => {
  assert.equal(sha256OfDigest('sha256:' + 'a'.repeat(64)), 'a'.repeat(64))
  assert.equal(sha256OfDigest('md5:deadbeef'), undefined)
  assert.equal(sha256OfDigest(undefined), undefined)
  assert.equal(sha256OfDigest('sha256:not-hex'), undefined)
})

test('computes a sortable version number from tags with and without v prefix', () => {
  assert.equal(releaseVersionNum('v1.3.24'), 10324)
  assert.equal(releaseVersionNum('1.10.0'), 11000)
  assert.equal(releaseVersionNum('garbage'), 0)
})

test('executable table stays in sync with the parser', () => {
  for (const [key, executable] of Object.entries(SAMWAF_EXECUTABLES)) {
    const [platform, arch] = key.split('/')
    const asset =
      `SamWaf_${platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'Darwin'}` +
      `_${arch === 'x64' ? 'x86_64' : 'arm64'}.v0.0.0.${platform === 'windows' ? 'zip' : 'tar.gz'}`
    assert.equal(parseAssetTarget(asset)?.executable, executable, `${key} mismatch`)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test plugins/samwaf/tests/release.test.ts`
Expected: FAIL — `Cannot find module '../fork/SamWaf/release'`

- [ ] **Step 3: Implement `release.ts`**

`plugins/samwaf/fork/SamWaf/release.ts`:

```ts
import axios from 'axios'
import { getAxiosProxy } from '@fork/util/Axios'

export type SamWafPlatform = 'windows' | 'linux' | 'macos'
export type SamWafArch = 'x64' | 'arm64'

export type SamWafAssetTarget = {
  platform: SamWafPlatform
  arch: SamWafArch
  ext: 'zip' | 'tar.gz'
  executable: string
}

export type SamWafReleaseAsset = {
  name: string
  browser_download_url: string
  digest?: string | null
}

export type SamWafRelease = {
  tag_name: string
  prerelease: boolean
  assets: SamWafReleaseAsset[]
}

export type SamWafOnlineVersion = SamWafAssetTarget & {
  version: string
  url: string
  sha256?: string
}

/** Executable file names inside each archive, keyed by `${platform}/${arch}`. */
export const SAMWAF_EXECUTABLES: Record<string, string> = {
  'windows/x64': 'SamWaf64.exe',
  'linux/x64': 'SamWafLinux64',
  'linux/arm64': 'SamWafLinuxArm64',
  'macos/x64': 'SamWafDarwin64',
  'macos/arm64': 'SamWafDarwinArm64'
}

const OS_NAME: Record<SamWafPlatform, string> = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'Darwin'
}

export const parseAssetTarget = (name: string): SamWafAssetTarget | undefined => {
  const match = /^SamWaf_(Windows|Linux|Darwin)_(x86_64|arm64)\.v.+\.(zip|tar\.gz)$/.exec(name)
  if (!match) return undefined
  const platform = (
    match[1] === 'Windows' ? 'windows' : match[1] === 'Linux' ? 'linux' : 'macos'
  ) as SamWafPlatform
  const arch = (match[2] === 'x86_64' ? 'x64' : 'arm64') as SamWafArch
  const executable = SAMWAF_EXECUTABLES[`${platform}/${arch}`]
  if (!executable) return undefined
  return { platform, arch, ext: match[3] as 'zip' | 'tar.gz', executable }
}

export const filterStableReleases = (releases: SamWafRelease[]): SamWafRelease[] => {
  // Gitee marks beta builds with prerelease=false, so the flag alone is not
  // enough: any semver prerelease suffix (-beta, -rc, ...) is also unstable.
  return releases.filter(
    (release) => !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name.trim())
  )
}

export const sha256OfDigest = (digest?: string | null): string | undefined => {
  if (!digest) return undefined
  const match = /^sha256:([a-f\d]{64})$/i.exec(digest.trim())
  return match?.[1].toLowerCase()
}

export const pickAsset = (
  release: SamWafRelease,
  platform: SamWafPlatform,
  arch: SamWafArch
): SamWafOnlineVersion | undefined => {
  for (const asset of release.assets) {
    const target = parseAssetTarget(asset.name)
    if (!target || target.platform !== platform || target.arch !== arch) continue
    return {
      ...target,
      version: release.tag_name,
      url: asset.browser_download_url,
      sha256: sha256OfDigest(asset.digest)
    }
  }
  return undefined
}

/** Numeric sort key: v1.3.24 -> 10324, v1.10.0 -> 11000. Unparseable -> 0. */
export const releaseVersionNum = (tag: string): number => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag.trim())
  if (!match) return 0
  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3])
}

/**
 * Upstream ships a `SamWaf_<ver>_checksums.txt` asset per release. Lines look
 * like `<sha256>  SamWaf_Linux_arm64 v1.3.24.tar.gz` — note the SPACE before
 * the version where the asset name has a DOT. Keys are normalized to the real
 * asset file names.
 */
export const parseChecksums = (content: string): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const line of (content ?? '').split('\n')) {
    const match = /^([a-fA-F\d]{64})\s+(\S.*)$/.exec(line.trim())
    if (!match) continue
    const name = match[2].trim().replace(/ (v?\d+\.\d+\.\d+\S*)$/, '.$1')
    map[name] = match[1].toLowerCase()
  }
  return map
}

/**
 * Fill sha256 for versions whose source release carries no asset digest
 * (Gitee) from the release's `*_checksums.txt` asset. Supplementary action:
 * any failure leaves sha256 undefined and the installer skips verification.
 */
const fillMissingSha256 = async (
  stable: SamWafRelease[],
  picked: SamWafOnlineVersion[]
): Promise<void> => {
  await Promise.all(
    picked.map(async (item) => {
      if (item.sha256) return
      const release = stable.find((r) => r.tag_name === item.version)
      const checksumAsset = release?.assets.find((a) => a.name.endsWith('_checksums.txt'))
      if (!checksumAsset) return
      try {
        const response = await axios.get<string>(checksumAsset.browser_download_url, {
          timeout: 15_000,
          responseType: 'text',
          proxy: getAxiosProxy()
        })
        const map = parseChecksums(`${response.data}`)
        const sha256 = map[samWafAssetFileName(item.version, item)]
        if (sha256) item.sha256 = sha256
      } catch (e) {
        console.log('samwaf checksums fetch failed:', checksumAsset.browser_download_url, e)
      }
    })
  )
}

const RELEASE_APIS = [
  'https://api.github.com/repos/samwafgo/SamWaf/releases',
  'https://gitee.com/api/v5/repos/samwaf/SamWaf/releases'
]

/**
 * Fetch online versions for the current host. GitHub first, Gitee as the CN
 * fallback. A source that errors or yields no host asset falls through to the
 * next; if every source fails the caller gets [] (never throws).
 * `direction=desc` is required by Gitee (ascending default — without it the
 * API returns ancient releases whose assets predate the current naming);
 * GitHub ignores the unknown parameter and stays newest-first. When the
 * source carries no asset digest (Gitee), sha256 is filled from the release's
 * `SamWaf_<ver>_checksums.txt` asset as a supplementary step (see
 * `parseChecksums`/`fillMissingSha256`); failures leave sha256 undefined and
 * the installer skips verification for that row.
 */
export const fetchOnlineVersions = async (
  platform: SamWafPlatform,
  arch: SamWafArch
): Promise<SamWafOnlineVersion[]> => {
  for (const api of RELEASE_APIS) {
    try {
      const response = await axios.get<SamWafRelease[]>(api, {
        params: { per_page: 20, direction: 'desc' },
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 15_000,
        proxy: getAxiosProxy()
      })
      const stable = filterStableReleases(response.data)
      const versions = stable
        .map((release) => pickAsset(release, platform, arch))
        .filter((item): item is SamWafOnlineVersion => !!item)
      if (versions.length > 0) {
        await fillMissingSha256(stable, versions)
        return versions.sort((a, b) => releaseVersionNum(b.version) - releaseVersionNum(a.version))
      }
    } catch (e) {
      console.log('samwaf release fetch failed:', api, e)
    }
  }
  return []
}

export const samWafHostTarget = (
  platform = process.platform,
  arch = process.arch
): { platform: SamWafPlatform; arch: SamWafArch } | undefined => {
  const p =
    platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : undefined
  const a = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : undefined
  if (!p || !a) return undefined
  return { platform: p, arch: a }
}

export const samWafAssetFileName = (version: string, target: SamWafAssetTarget): string => {
  return `SamWaf_${OS_NAME[target.platform]}_${target.arch === 'x64' ? 'x86_64' : 'arm64'}.${version}.${target.ext}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test plugins/samwaf/tests/release.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/samwaf
git commit -m "feat(samwaf-plugin): release discovery with GitHub/Gitee sources"
```

---

### Task 3: Config helpers (`fork/SamWaf/config.ts`) with tests

The plugin seeds a default `conf/config.yml` before first start (loopback-only admin whitelist — the upstream default `0.0.0.0/0,::/0` is wrong for a local dev tool that binds `*:26666`). Parsing is line/regex based; do **not** add a YAML dependency (kafka sets the same precedent of parsing plain text).

**Files:**
- Create: `plugins/samwaf/fork/SamWaf/config.ts`
- Test: `plugins/samwaf/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/samwaf/tests/config.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SAMWAF_DEFAULT_PORT,
  defaultConfigYml,
  parseAdminPort,
  parseInitialPassword
} from '../fork/SamWaf/config'

// Real config generated by SamWaf v1.3.24 on first run (probe, 2026-11-01), trimmed.
const GENERATED = `application_allow_dirs: data/applications
application_manage: false
cache:
    type: memory
custom_server_name: my-host
database:
    driver: sqlite
local_port: 26666
security:
    emergency_path: mo9qL2BHXiHMPvxPS5
    ip_whitelist: 0.0.0.0/0,::/0
zlog:
    debug_enable: false
`

test('parses local_port from a generated config and rejects garbage', () => {
  assert.equal(parseAdminPort(GENERATED), 26666)
  assert.equal(parseAdminPort('local_port: 30000\n'), 30000)
  assert.equal(parseAdminPort('local_port: 0\n'), SAMWAF_DEFAULT_PORT)
  assert.equal(parseAdminPort('local_port: 70000\n'), SAMWAF_DEFAULT_PORT)
  assert.equal(parseAdminPort('local_port: abc\n'), SAMWAF_DEFAULT_PORT)
  assert.equal(parseAdminPort(''), SAMWAF_DEFAULT_PORT)
})

test('default config restricts the admin whitelist to loopback', () => {
  const yml = defaultConfigYml()
  assert.equal(parseAdminPort(yml), SAMWAF_DEFAULT_PORT)
  assert.ok(yml.includes('ip_whitelist: 127.0.0.1/32,::1/128'))
  assert.ok(yml.includes('database:'))
  assert.ok(yml.includes('driver: sqlite'))
})

test('extracts the random initial password from the upstream file format', () => {
  const content = [
    'SamWaf 初始管理员账号: admin',
    "初始随机口令: w|Vxb_=5vUaZk'uj",
    '生成时间: 2026-11-01 20:22:02',
    '请立即登录并修改密码，登录后本文件可删除。'
  ].join('\n')
  assert.equal(parseInitialPassword(content), "w|Vxb_=5vUaZk'uj")
  assert.equal(parseInitialPassword('no password here'), '')
  assert.equal(parseInitialPassword(''), '')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test plugins/samwaf/tests/config.test.ts`
Expected: FAIL — `Cannot find module '../fork/SamWaf/config'`

- [ ] **Step 3: Implement `config.ts`**

`plugins/samwaf/fork/SamWaf/config.ts`:

```ts
export const SAMWAF_DEFAULT_PORT = 26666

/**
 * Default config seeded before the first start. Upstream generates
 * `ip_whitelist: 0.0.0.0/0,::/0` and binds *:26666; for a local dev tool the
 * admin panel must default to loopback only. Everything else mirrors upstream
 * defaults so SamWaf fills in the rest (emergency_path, db files, ...) itself.
 */
export const defaultConfigYml = (): string => {
  return `local_port: ${SAMWAF_DEFAULT_PORT}
database:
    driver: sqlite
cache:
    type: memory
security:
    ip_whitelist: 127.0.0.1/32,::1/128
zlog:
    debug_enable: false
    outputformat: console
`
}

/** Reads `local_port` from config.yml text. Falls back to 26666 on any doubt. */
export const parseAdminPort = (content: string): number => {
  const match = /^local_port:\s*(\d+)\s*$/m.exec(content ?? '')
  if (!match) return SAMWAF_DEFAULT_PORT
  const port = Number(match[1])
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return SAMWAF_DEFAULT_PORT
  return port
}

/**
 * data/initial_password.txt (fresh installs) looks like:
 *   SamWaf 初始管理员账号: admin
 *   初始随机口令: w|Vxb_=5vUaZk'uj
 * The password itself may contain any printable character except newline.
 */
export const parseInitialPassword = (content: string): string => {
  for (const line of (content ?? '').split('\n')) {
    const match = /^\s*初始随机口令\s*[:：]\s*(.+?)\s*$/.exec(line)
    if (match?.[1]) return match[1]
  }
  return ''
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test plugins/samwaf/tests/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/samwaf
git commit -m "feat(samwaf-plugin): default config seeding and parsing helpers"
```

---

### Task 4: Fork module (`fork/SamWaf/index.ts`)

**Files:**
- Create: `plugins/samwaf/fork/SamWaf/index.ts`

No new unit test for the class itself (it is thin wiring over already-tested pure helpers + `Base`); the contract is exercised by `yarn plugin:test samwaf` and the manual checklist in Task 6. This matches kafka, whose class is covered by `plugin:test` + runtime smoke rather than class unit tests.

- [ ] **Step 1: Implement the module**

```ts
import { createHash } from 'crypto'
import { createReadStream, existsSync } from 'fs'
import { dirname, join } from 'path'
import { Base } from '@fork/module/Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  chmod,
  mkdirp,
  readFile,
  readdir,
  remove,
  serviceStartExecCMD,
  versionDirCache,
  versionSort,
  waitTime,
  writeFile,
  zipUnpack
} from '@fork/Fn'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { unpack } from '@fork/util/Zip'
import { ForkPromise } from '@shared/ForkPromise'
import { isWindows } from '@shared/utils'
import { ProcessSearch } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { ProcessListSearch } from '@shared/Process.win'
import { SamWafT } from '../lang'
import {
  SAMWAF_EXECUTABLES,
  fetchOnlineVersions,
  releaseVersionNum,
  samWafAssetFileName,
  samWafHostTarget
} from './release'
import { defaultConfigYml, parseAdminPort, parseInitialPassword } from './config'

const STARTUP_CHECK_TIMES = 60

export type SamWafAdminInfo = {
  url: string
  port: number
  initialPassword: string
}

class SamWaf extends Base {
  baseDir: string = ''

  constructor() {
    super()
    this.type = 'samwaf'
  }

  init() {
    this.baseDir = join(global.Server.BaseDir!, 'samwaf')
    this.pidPath = join(this.baseDir, 'samwaf.pid')
    mkdirp(this.baseDir).catch()
  }

  private _appDirOf(version: string): string {
    return join(global.Server.AppDir!, 'samwaf', version)
  }

  private _executable(version: SoftInstalled): string {
    // The archive holds a single top-level binary; version.bin is set at
    // install/scan time and always points at it.
    return version?.bin ?? ''
  }

  private _configPath(version: SoftInstalled): string {
    return join(dirname(this._executable(version)), 'conf', 'config.yml')
  }

  private _logsDir(version: SoftInstalled): string {
    return join(dirname(this._executable(version)), 'logs')
  }

  private startupLogFiles(version: SoftInstalled) {
    const logsDir = this._logsDir(version)
    return [
      { name: 'samwaf-start-out.log', path: join(logsDir, 'samwaf-start-out.log') },
      { name: 'samwaf-start-error.log', path: join(logsDir, 'samwaf-start-error.log') }
    ]
  }

  private async startupDiagnostics(version: SoftInstalled): Promise<string> {
    const messages: string[] = []
    for (const file of this.startupLogFiles(version)) {
      if (!existsSync(file.path)) continue
      try {
        const content = (await readFile(file.path, 'utf-8')).trim()
        if (content) messages.push(`${file.name}:\n${content}`)
      } catch {}
    }
    return messages.join('\n')
  }

  /**
   * Seed conf/config.yml before the first start so the admin panel defaults
   * to loopback-only access. SamWaf fills in every missing key itself.
   */
  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = this._executable(version)
      if (!bin || !existsSync(bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      const configPath = this._configPath(version)
      await mkdirp(dirname(configPath))
      if (!existsSync(configPath)) {
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
        await writeFile(configPath, defaultConfigYml())
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: configPath }))
        })
      }
      resolve(configPath)
    })
  }

  private async _adminPort(version: SoftInstalled): Promise<number> {
    try {
      const content = await readFile(this._configPath(version), 'utf-8')
      return parseAdminPort(content)
    } catch {
      return parseAdminPort('')
    }
  }

  /**
   * Readiness = a live process owned by THIS install, found the same way the
   * rest of FlyEnv finds service processes: search by binary name, keep only
   * rows whose command line carries this version's ownership markers (the
   * same `ownedProcessMarkers` Base's stop flow uses, so start/stop agree on
   * what "ours" means). A foreign SamWaf instance — manual start, leftover —
   * lives in another directory, fails the marker check, and can never be
   * mistaken for our start; our own process dying from the port conflict is
   * then reported as the real failure. A process-list query that fails is
   * "unverifiable", never "not running" — retried, and attached to the start
   * failure on timeout.
   */
  private async _ownedProcessPid(version: SoftInstalled): Promise<string> {
    const markers = this.ownedProcessMarkers(version)
    if (isWindows()) {
      const all = await ProcessListSearch('SamWaf64', false)
      const hit = all.find((item) => markers.some((m) => item.COMMAND.includes(m)))
      return hit ? `${hit.PID}` : ''
    }
    const plist = await StopProcessListFetch()
    const hit = ProcessSearch('SamWaf', false, plist).find((p) => {
      return (
        markers.some((m) => p.COMMAND.includes(m)) &&
        !p.COMMAND.includes(' grep ') &&
        !p.COMMAND.includes(' /bin/sh -c')
      )
    })
    return hit?.PID ?? ''
  }

  private async _waitOwnedProcess(
    version: SoftInstalled,
    isAlive: () => boolean
  ): Promise<{ pid: string; error?: unknown }> {
    let lastError: unknown
    for (let time = 0; time < STARTUP_CHECK_TIMES; time++) {
      try {
        const pid = await this._ownedProcessPid(version)
        if (pid) return { pid }
      } catch (e) {
        lastError = e
      }
      if (!isAlive()) return { pid: '', error: lastError }
      await waitTime(500)
    }
    return { pid: '', error: lastError }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = this._executable(version)
      if (!bin || !existsSync(bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      try {
        await this.initConfig(version).on(on)
        await mkdirp(this._logsDir(version))
      } catch (e) {
        reject(e)
        return
      }

      for (const file of this.startupLogFiles(version)) {
        try {
          await writeFile(file.path, '')
        } catch {}
      }

      const failStart = async (cause?: unknown) => {
        const diagnostics = await this.startupDiagnostics(version)
        const causeText = cause instanceof Error ? cause.message : `${cause ?? ''}`
        const error = [diagnostics, causeText].filter((item) => item.trim()).join('\n')
        const message = error || I18nT('fork.startFail')
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: message,
              service: `${this.type}-${version.version}`
            })
          )
        })
        reject(new Error(message))
      }

      let launcherPid = ''
      const isLauncherAlive = () => {
        const pid = Number(launcherPid)
        if (!pid || Number.isNaN(pid)) return true
        try {
          process.kill(pid, 0)
          return true
        } catch (error: any) {
          return error?.code === 'EPERM'
        }
      }

      if (isWindows()) {
        try {
          await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir: dirname(bin),
            bin,
            execArgs: '',
            execEnv: '',
            on,
            checkPidFile: false
          })
        } catch (e) {
          await failStart(e)
          return
        }
        const ready = await this._waitOwnedProcess(version, isLauncherAlive)
        if (ready.pid) {
          launcherPid = ready.pid
          try {
            await writeFile(this.pidPath, launcherPid)
          } catch {}
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: launcherPid }))
          })
          resolve({ 'APP-Service-Start-PID': launcherPid })
          return
        }
        await failStart(ready.error)
      } else {
        try {
          const started = await serviceStartSpawn({
            version,
            pidPath: this.pidPath,
            baseDir: dirname(bin),
            bin,
            execArgs: [],
            execEnv: {},
            cwd: dirname(bin),
            outFile: this.startupLogFiles(version)[0].path,
            errFile: this.startupLogFiles(version)[1].path,
            on,
            waitTime: 5000
          })
          launcherPid = started['APP-Service-Start-PID']
        } catch (error) {
          await failStart(error)
          return
        }
        // SamWaf runs a supervisor that forks the worker; the spawned pid is
        // the supervisor. Readiness = a live owned process found by name +
        // this version's markers (the same ownership rule Base's stop uses),
        // so a foreign instance occupying the port can never fake success.
        const ready = await this._waitOwnedProcess(version, isLauncherAlive)
        if (ready.pid) {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: launcherPid }))
          })
          resolve({ 'APP-Service-Start-PID': launcherPid || ready.pid })
        } else {
          await failStart(ready.error)
        }
      }
    })
  }

  /**
   * Stop hooks: Base owns discovery, signaling, exit confirmation and PID
   * cleanup. 'SamWaf' matches every platform binary name (SamWaf64.exe,
   * SamWafLinux64/Arm64, SamWafDarwin64/Arm64); ownership markers restrict
   * matches to this install dir. Go's net/http shuts down cleanly on TERM.
   */
  protected _stopSearchName(): string | undefined {
    return 'SamWaf'
  }

  protected _stopSignal(): string {
    return '-TERM'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const host = samWafHostTarget()
        if (!host) {
          resolve([])
          return
        }
        const found = await fetchOnlineVersions(host.platform, host.arch)
        const all: OnlineVersionItem[] = found.map((item) => {
          const appDir = this._appDirOf(item.version)
          const bin = join(appDir, item.executable)
          const zip = join(global.Server.Cache!, samWafAssetFileName(item.version, item))
          return {
            version: item.version,
            num: releaseVersionNum(item.version),
            url: item.url,
            zip,
            appDir,
            bin,
            sha256: item.sha256,
            downloaded: existsSync(zip),
            installed: existsSync(bin),
            name: `SamWaf-${item.version}`
          } as OnlineVersionItem
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(_setup: any) {
    return new ForkPromise(async (resolve) => {
      // versionDirCache is module-level shared state; clear before scanning so
      // freshly installed versions are visible (same rule as built-in modules).
      for (const k in versionDirCache) {
        delete versionDirCache[k]
      }
      try {
        const host = samWafHostTarget()
        if (!host) {
          resolve([])
          return
        }
        const root = join(global.Server.AppDir!, 'samwaf')
        if (!existsSync(root)) {
          resolve([])
          return
        }
        const executableName = SAMWAF_EXECUTABLES[`${host.platform}/${host.arch}`]
        const versions: any[] = []
        for (const dir of await readdir(root)) {
          const appDir = join(root, dir)
          const bin = join(appDir, executableName)
          if (!existsSync(bin)) continue
          versions.push({
            version: dir,
            num: releaseVersionNum(dir),
            bin,
            path: appDir,
            appDir,
            enable: true,
            error: undefined
          })
        }
        resolve(versionSort(versions))
      } catch {
        resolve([])
      }
    })
  }

  /**
   * Verify the downloaded archive against the sha256 published by the release
   * source before unpacking. A mismatch is a required failure: throw so
   * Base.installSoft removes the partial zip/appDir and reports failure.
   */
  private async _verifyZip(row: any) {
    const expected = `${row?.sha256 ?? ''}`.trim().toLowerCase()
    if (!expected) return
    const actual = await new Promise<string>((resolveHash, rejectHash) => {
      const hash = createHash('sha256')
      createReadStream(row.zip)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => resolveHash(hash.digest('hex')))
        .on('error', rejectHash)
    })
    if (actual !== expected) {
      throw new Error(SamWafT('sha256Mismatch'))
    }
  }

  async _installSoftHandle(row: any): Promise<void> {
    await this._verifyZip(row)
    await remove(row.appDir)
    await mkdirp(row.appDir)
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      await unpack(row.zip, row.appDir)
    }
    // The archive holds a single top-level executable; locate it by prefix
    // instead of trusting the expected name, then mark it executable.
    const files = await readdir(row.appDir)
    const executable = files.find((file) => file.startsWith('SamWaf'))
    if (!executable) {
      throw new Error(SamWafT('binNotFoundAfterUnpack'))
    }
    // Point bin at the actually unpacked file so Base's installed check and
    // later starts work even if the upstream name ever deviates from ours.
    row.bin = join(row.appDir, executable)
    if (!isWindows()) {
      await chmod(row.bin, 0o755)
    }
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    return [{ name: 'config.yml', path: this._configPath(version) }]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) return []
    const logsDir = this._logsDir(version)
    return [
      { name: 'log.log', path: join(logsDir, 'log.log') },
      { name: 'supervisor.log', path: join(logsDir, 'supervisor.log') },
      ...(version ? this.startupLogFiles(version) : [])
    ]
  }

  /**
   * Data for the renderer's "open admin panel" action. Reading the initial
   * password is supplementary: failures only blank the password, never the URL.
   */
  adminInfo(version: SoftInstalled): ForkPromise<SamWafAdminInfo> {
    return new ForkPromise(async (resolve) => {
      const port = await this._adminPort(version)
      let initialPassword = ''
      try {
        const content = await readFile(
          join(dirname(this._executable(version)), 'data', 'initial_password.txt'),
          'utf-8'
        )
        initialPassword = parseInitialPassword(content)
      } catch {}
      resolve({ url: `http://127.0.0.1:${port}`, port, initialPassword })
    })
  }
}
export default new SamWaf()
```

- [ ] **Step 2: Verify the unit tests are still green**

Run: `npx tsx --test plugins/samwaf/tests/`
Expected: all 8 tests PASS. The full plugin build requires the renderer pages, so it runs in Task 6.

- [ ] **Step 3: Commit**

```bash
git add plugins/samwaf
git commit -m "feat(samwaf-plugin): fork module with lifecycle, install verification and admin info"
```

---

### Task 5: Renderer pages

**Files:**
- Create: `plugins/samwaf/render/aside.vue`
- Create: `plugins/samwaf/render/Index.vue`
- Create: `plugins/samwaf/render/AdminPanel.vue`
- Create: `plugins/samwaf/render/Config.vue`
- Create: `plugins/samwaf/render/Logs.vue`

- [ ] **Step 1: `aside.vue`** — standard service switch, no ext params (start/stop need no arguments):

```vue
<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === `/${typeFlag}` ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon style="padding: 6px" :svg="import('./samwaf.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">{{ title }}</span>
    </div>
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'

  const props = withDefaults(
    defineProps<{
      typeFlag?: AllAppModule
      title?: string
    }>(),
    {
      typeFlag: 'samwaf',
      title: 'SamWaf'
    }
  )
  const typeFlag = props.typeFlag

  const {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
  } = AsideSetup(typeFlag)

  AppServiceModule[typeFlag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
```

- [ ] **Step 2: `AdminPanel.vue`** — icon button in the Service tab's `#tool-left` slot (same idiom as Mailpit's web-UI button), visible only while a version is running; on fresh installs it shows the random initial password first:

```vue
<template>
  <template v-if="version">
    <el-button style="color: #01cc74" class="button" link @click.stop="openPanel">
      <yb-icon style="width: 20px; height: 20px; margin-left: 10px" :svg="icon" />
    </el-button>
    <el-dialog
      v-model="dialogVisible"
      :title="SamWafT('adminPanelTitle')"
      width="420px"
      append-to-body
    >
      <p class="mb-2">{{ SamWafT('initialPasswordTip') }}</p>
      <el-input :model-value="initialPassword" readonly />
      <p class="mt-2 text-xs opacity-70">{{ SamWafT('initialPasswordFileHint') }}</p>
      <template #footer>
        <el-button type="primary" @click="gotoPanel">{{ SamWafT('openAdminPanel') }}</el-button>
      </template>
    </el-dialog>
  </template>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import IPC from '@/util/IPC'
  import { shell } from '@/util/NodeFn'
  import type { SoftInstalled } from '@/store/brew'
  import { SamWafT } from './lang'
  import icon from './samwaf.svg?raw'

  const props = defineProps<{ version?: SoftInstalled }>()

  const dialogVisible = ref(false)
  const initialPassword = ref('')
  let panelUrl = ''

  // Fork resolves wrap the payload as { code: 0, data } — same convention as
  // plugins/opensearch/render/store.ts.
  const fetchAdminInfo = (): Promise<{ url: string; initialPassword: string } | undefined> => {
    return new Promise((resolve) => {
      IPC.send('app-fork:samwaf', 'adminInfo', JSON.parse(JSON.stringify(props.version))).then(
        (key: string, res: any) => {
          IPC.off(key)
          resolve(res?.code === 0 ? res.data : undefined)
        }
      )
    })
  }

  const openExternal = (url: string) => {
    shell.openExternal(url).then().catch()
  }

  const openPanel = async () => {
    if (!props.version?.run) return
    const info = await fetchAdminInfo()
    if (!info?.url) return
    panelUrl = info.url
    // Fresh installs carry a random password; surface it before opening.
    if (info.initialPassword) {
      initialPassword.value = info.initialPassword
      dialogVisible.value = true
      return
    }
    openExternal(panelUrl)
  }

  const gotoPanel = () => {
    dialogVisible.value = false
    if (panelUrl) openExternal(panelUrl)
  }
</script>
```

- [ ] **Step 3: `Index.vue`** — four tabs; the Service tab carries the admin-panel icon button in its `#tool-left` slot:

```vue
<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="samwaf" title="SamWaf">
        <template #tool-left>
          <AdminPanel :version="runningVersion" />
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="samwaf"
        title="SamWaf"
        :has-static="true"
        :show-brew-lib="false"
        :show-port-lib="false"
        url="https://github.com/samwafgo/SamWaf/releases"
      />
      <Config v-else-if="tab === 2" />
      <Logs v-else-if="tab === 3" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import AdminPanel from './AdminPanel.vue'

  const { tab, checkVersion } = AppModuleSetup('samwaf')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const samwafModule = BrewStore().module('samwaf')
  if (!samwafModule.installedFetched) {
    samwafModule.fetchInstalled(true).catch()
  }

  const runningVersion = computed(() => {
    return samwafModule.installed.find((item) => item.run)
  })

  checkVersion()
</script>
```

- [ ] **Step 4: `Config.vue`** — seeds/edits `conf/config.yml` via the host `Conf` component:

```vue
<template>
  <Conf
    ref="conf"
    :type-flag="'samwaf'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'yml'"
    :config-language="'yaml'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('samwaf')
  })

  const conf = ref()
  const file = ref('')
  const defaultFile = ref('')

  watch(
    () => currentVersion?.value?.bin,
    () => {
      const version = currentVersion?.value
      if (!version?.version) {
        return
      }
      IPC.send('app-fork:samwaf', 'initConfig', JSON.parse(JSON.stringify(version))).then(
        (key: string) => {
          IPC.off(key)
          const dir = join(window.Server.AppDir!, 'samwaf', version.version!, 'conf', 'config.yml')
          file.value = dir
          defaultFile.value = dir
          conf.value.update()
        }
      )
    },
    {
      immediate: true
    }
  )
</script>
```

Note: unlike kafka there is no separate read-only default file — the seeded file *is* the live config. `defaultFile` is optional in `src/render/components/Conf/index.vue`; pointing it at the same path keeps the "load default" action harmless (it reloads the same content).

- [ ] **Step 5: `Logs.vue`** — shows `logs/log.log`, falling back to startup logs before the first run:

```vue
<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="filepath" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('samwaf')
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    const logsDir = join(window.Server.AppDir!, 'samwaf', v, 'logs')
    const mainLog = join(logsDir, 'log.log')
    const startError = join(logsDir, 'samwaf-start-error.log')
    const startOut = join(logsDir, 'samwaf-start-out.log')
    if (await fs.existsSync(mainLog)) {
      filepath.value = mainLog
    } else if (await fs.existsSync(startError)) {
      filepath.value = startError
    } else {
      filepath.value = startOut
    }
  }

  watch(
    currentVersion,
    (v) => {
      filepath.value = ''
      if (v) {
        findFile().then().catch()
      }
    },
    {
      immediate: true
    }
  )
</script>
```

- [ ] **Step 6: Commit**

```bash
git add plugins/samwaf
git commit -m "feat(samwaf-plugin): renderer service, version, config and logs pages"
```

---

### Task 6: Build, contract test and manual verification

- [ ] **Step 1: Full build**

Run: `yarn plugin:build samwaf`
Expected: succeeds; artifacts under `dist/plugins/samwaf/`.

- [ ] **Step 2: Plugin contract test**

Run: `yarn plugin:test samwaf`
Expected: `plugin contract passed: samwaf@0.1.0` (builds the plugin, validates the manifest, imports the fork bundle, asserts `exec`/`_startServer`/`stopService` exist).

- [ ] **Step 3: Runtime smoke**

Run: `yarn plugin:runtime-smoke`
Expected: passes (generic install/lifecycle/uninstall smoke with local fixtures).

- [ ] **Step 4: Manual end-to-end verification** (`yarn plugin:dev samwaf`):

1. Version Manager tab lists stable SamWaf releases for the host platform (GitHub source; toggle network/proxy to confirm the Gitee fallback resolves a non-empty list when GitHub is unreachable).
2. Install the newest version; watch progress reach 100% and the row flip to installed. Confirm `<AppDir>/samwaf/<version>/` contains exactly one `SamWaf*` executable (mode 755 on unix).
3. Start the service from the sidebar switch. Expect: pid file at `<BaseDir>/samwaf/samwaf.pid`, `conf/config.yml` seeded with the loopback whitelist, admin panel reachable at `http://127.0.0.1:26666`.
4. **Port-conflict case**: stop the service, then start SamWaf manually from a *different* directory (or a second install dir) so it owns port 26666. Start the service from FlyEnv — it must FAIL (our instance cannot bind; the listener is foreign) and the startup log must show the bind error, never a false "started" state. Kill the manual instance afterwards.
5. The Admin Panel button (enabled only while running) shows the initial-password dialog on first start; the password actually logs in at the panel.
6. Stop the service; confirm both supervisor and worker processes are gone and the pid file is removed.
7. Config tab edits `config.yml` (e.g. change `local_port`), restart, and the panel opens on the new port.
8. On macOS: confirm Gatekeeper does not block the binary (files fetched via axios do not get the quarantine xattr; if a user manually copies the app dir, the fix is `xattr -dr com.apple.quarantine`).

- [ ] **Step 5: Final commit**

```bash
git add plugins/samwaf dist/plugins
git commit -m "feat(samwaf-plugin): build artifacts and registry entry"
```

---

## Assumptions

- Stable releases only (beta/prerelease assets are filtered out). Channel switching is deliberately out of scope for v0.1.0.
- `asideIndex: 71` is free (70 is llama.cpp; no other module uses 71 at plan time — re-grep `asideIndex: 71` before committing Task 1).
- `moduleType: 'webServer'` groups SamWaf with the traffic-handling servers; no new module type is introduced.
- Darwin x64 executable name `SamWafDarwin64` follows the observed naming convention; the install path locates the executable by `SamWaf` prefix after unpacking, so a wrong guess breaks only `fetchAllOnlineVersion`'s `installed` flag on Intel Macs — caught by the Task 2 sync test and manual verification.
- No privileged features (system-firewall IP blocking) are exposed; the WAF core and admin panel run unprivileged.
- The plugin does not create FlyEnv host/site entries pointing at SamWaf; fronting local sites behind the WAF is user configuration inside SamWaf's own panel.
