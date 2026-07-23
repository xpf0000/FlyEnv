# Temporal 集成实施计划（temporal + temporal-cli 双模块）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FlyEnv 中新增两个服务模块 `temporal`（temporal-server + 单实例 ui-server Web UI）与 `temporal-cli`（temporal server start-dev），并在 one-env 服务端（FlyEnv-Admin）收录 `temporal`、`temporal-cli`、`temporal-ui` 三个下载源。

**Architecture:** 客户端两个模块均照 Consul 模式（fork 模块 + 渲染组件 + 通用 ServiceManager/VersionManager）；ui-server 为单一受管实例（phpMyAdmin 模式：固定目录、自动最新版、无版本选择）。服务端照 Etcd/ClickHouse 模式（抓取 module + Redis 缓存 + DTO 白名单）。规格文档：`docs/superpowers/specs/2026-07-23-temporal-integration-design.md`。

**Tech Stack:** FlyEnv（Electron 39 + Vue 3 + TS，fork/render 双进程）；FlyEnv-Admin（NestJS 10 + TypeORM + Redis，管理后台 Vue 3）。

## Global Constraints

- 版本来源**全部**走 one-env 服务端（`Base._fetchOnlineVersion`），客户端不直连 GitHub API、不含 brew。
- 两个模块均为服务模块：`moduleType: 'cacheAndQueue'`、`isService: true`、`isTray: true`；不进 `AppWithRoot`。
- 不自动注入 PATH（用户用现有 `ServiceActionStore.updatePath` 机制手动加），不改 `src/fork/module/Tool/`。
- i18n 零改动：复用现有 `base.*` / `appLog.*` / `service.*` key；少量自定义日志用纯英文字符串（N8N 有先例）。渲染侧 `label` 硬编码。
- 配置全部内联生成，不动 `static/tmpl/`；不改 `src/main/utils/ServerPath.ts` 与 `src/global.d.ts`。
- ui-server 资产在 **Windows 上也是 tar.gz** → `_installSoftHandle` 一律按 `row.zip` 扩展名选解压方式，不按平台。
- 官方资产命名（已核实）：`temporal_<ver>_{darwin,linux}_{amd64,arm64}.tar.gz` / `temporal_<ver>_windows_{amd64,arm64}.zip`；`temporal_cli_<ver>_*`（win 有 zip）；`ui-server_<ver>_{darwin,linux,windows}_{amd64,arm64}.tar.gz`。
- 服务端 `arch` 合法值仅 `'x86' | 'arm'`，Windows 恒 `x86`（`win()` 无 arch 参数）；`os` 为 `'mac' | 'win' | 'linux'`。
- 服务端版本清单按 major.minor 分组、每组只出最新一个 patch（`module/base.ts` 既有行为），不要修改 `base.ts`。
- 两个仓库都没有针对本功能的单测框架；验证 = ts-node/tsx 冒烟脚本 + 构建 + 手动验证。每个 Task 结束必须跑其验证命令。
- 提交规范：两仓库均用约定式提交（参照近期 commit，如 `feat: ...`）。**每个 Task 的 commit 步骤在执行前向用户确认。**

---
---

# Part A：FlyEnv-Admin 服务端（仓库 `E:\Github\FlyEnv-Admin`，先行实施）

## Task 1: 三个版本抓取 module + 冒烟测试

**Files:**
- Test: `E:/Github/FlyEnv-Admin/servers/scripts/temporal-version-test.ts`（新建）
- Create: `E:/Github/FlyEnv-Admin/servers/src/api/version/module/temporal.ts`
- Create: `E:/Github/FlyEnv-Admin/servers/src/api/version/module/temporal-cli.ts`
- Create: `E:/Github/FlyEnv-Admin/servers/src/api/version/module/temporal-ui.ts`

**Interfaces:**
- Consumes: `servers/src/api/version/module/base.ts` 的 `Base.fetchFromGitHubReleases(repo, versionFetch, mvLength, urlFetch, minVersion)`；`GitHubReleases` 类型（`{ tag_name, name, assets: [{ name, browser_download_url }] }`）。
- Produces: 三个默认导出单例，各有 `win(): Promise<VersionItem[]>`、`mac(arch: 'x86'|'arm')`、`linux(arch: 'x86'|'arm')`；Task 2 以模块文件名 `temporal` / `temporal-cli` / `temporal-ui` 动态 import。

- [ ] **Step 1: 写冒烟测试（先写测试）**

新建 `E:/Github/FlyEnv-Admin/servers/scripts/temporal-version-test.ts`：

```ts
import Temporal from '../src/api/version/module/temporal'
import TemporalCli from '../src/api/version/module/temporal-cli'
import TemporalUi from '../src/api/version/module/temporal-ui'

type Mod = {
  win: () => Promise<any[]>
  mac: (arch: 'x86' | 'arm') => Promise<any[]>
  linux: (arch: 'x86' | 'arm') => Promise<any[]>
}

async function main() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      throw new Error(`CHECK FAILED: ${msg}`)
    }
  }

  const checkModule = async (
    name: string,
    mod: Mod,
    repoPart: string,
    expect: { linuxX86: string; linuxArm: string; macX86: string; macArm: string; win: string }
  ) => {
    const [linuxX86, linuxArm, macX86, macArm, win] = [
      await mod.linux('x86'),
      await mod.linux('arm'),
      await mod.mac('x86'),
      await mod.mac('arm'),
      await mod.win()
    ]
    console.log(`${name} linux x86:`, linuxX86.length, linuxX86[0])
    console.log(`${name} linux arm:`, linuxArm.length, linuxArm[0])
    console.log(`${name} mac x86:`, macX86.length, macX86[0])
    console.log(`${name} mac arm:`, macArm.length, macArm[0])
    console.log(`${name} win:`, win.length, win[0])

    const groups: Array<[string, any[], string]> = [
      ['linux x86', linuxX86, expect.linuxX86],
      ['linux arm', linuxArm, expect.linuxArm],
      ['mac x86', macX86, expect.macX86],
      ['mac arm', macArm, expect.macArm],
      ['win', win, expect.win]
    ]
    for (const [label, list, assetPart] of groups) {
      assert(list.length > 0, `${name} ${label} list empty`)
      assert(
        list.every((v) => /^\d+\.\d+\.\d+$/.test(v.version)),
        `${name} ${label} version format mismatch: ${list.map((v) => v.version).join(',')}`
      )
      assert(
        list.every((v) => `${v.url}`.includes(repoPart) && `${v.url}`.includes(assetPart)),
        `${name} ${label} url mismatch, expect contains "${repoPart}" and "${assetPart}"`
      )
    }
  }

  await checkModule('temporal', Temporal, '/temporalio/temporal/releases/', {
    linuxX86: '_linux_amd64.tar.gz',
    linuxArm: '_linux_arm64.tar.gz',
    macX86: '_darwin_amd64.tar.gz',
    macArm: '_darwin_arm64.tar.gz',
    win: '_windows_amd64.zip'
  })

  await checkModule('temporal-cli', TemporalCli, '/temporalio/cli/releases/', {
    linuxX86: '_linux_amd64.tar.gz',
    linuxArm: '_linux_arm64.tar.gz',
    macX86: '_darwin_amd64.tar.gz',
    macArm: '_darwin_arm64.tar.gz',
    win: '_windows_amd64.zip'
  })

  await checkModule('temporal-ui', TemporalUi, '/temporalio/ui-server/releases/', {
    linuxX86: '_linux_amd64.tar.gz',
    linuxArm: '_linux_arm64.tar.gz',
    macX86: '_darwin_amd64.tar.gz',
    macArm: '_darwin_arm64.tar.gz',
    win: '_windows_amd64.tar.gz'
  })

  console.log('ALL CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd E:/Github/FlyEnv-Admin/servers && npx ts-node scripts/temporal-version-test.ts`
Expected: 报错 `Cannot find module '../src/api/version/module/temporal'`

- [ ] **Step 3: 实现三个 module**

新建 `servers/src/api/version/module/temporal.ts`（照 `Etcd.ts` 写法）：

```ts
import { Base, GitHubReleases } from './base'

class Temporal extends Base {
  async win() {
    return await this.fetchFromGitHubReleases(
      'temporalio/temporal',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes('windows_amd64.zip'))?.browser_download_url ?? ''
        )
      },
      '1.0.0'
    )
  }

  async mac(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/temporal',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`darwin_${osArch}.tar.gz`))
            ?.browser_download_url ?? ''
        )
      },
      '1.0.0'
    )
  }

  async linux(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/temporal',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`linux_${osArch}.tar.gz`))?.browser_download_url ??
          ''
        )
      },
      '1.0.0'
    )
  }
}

export default new Temporal()
```

新建 `servers/src/api/version/module/temporal-cli.ts`：

```ts
import { Base, GitHubReleases } from './base'

class TemporalCli extends Base {
  async win() {
    return await this.fetchFromGitHubReleases(
      'temporalio/cli',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes('windows_amd64.zip'))?.browser_download_url ?? ''
        )
      },
      '1.0.0'
    )
  }

  async mac(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/cli',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`darwin_${osArch}.tar.gz`))
            ?.browser_download_url ?? ''
        )
      },
      '1.0.0'
    )
  }

  async linux(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/cli',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`linux_${osArch}.tar.gz`))?.browser_download_url ??
          ''
        )
      },
      '1.0.0'
    )
  }
}

export default new TemporalCli()
```

新建 `servers/src/api/version/module/temporal-ui.ts`（注意：win 也是 tar.gz）：

```ts
import { Base, GitHubReleases } from './base'

class TemporalUi extends Base {
  async win() {
    return await this.fetchFromGitHubReleases(
      'temporalio/ui-server',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes('windows_amd64.tar.gz'))?.browser_download_url ??
          ''
        )
      },
      '2.0.0'
    )
  }

  async mac(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/ui-server',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`darwin_${osArch}.tar.gz`))
            ?.browser_download_url ?? ''
        )
      },
      '2.0.0'
    )
  }

  async linux(arch: 'x86' | 'arm') {
    const osArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'temporalio/ui-server',
      (tag: GitHubReleases) => {
        return tag.tag_name.replace(/^v/, '')
      },
      2,
      (tag: GitHubReleases) => {
        return (
          tag.assets.find((a) => a.name.includes(`linux_${osArch}.tar.gz`))?.browser_download_url ??
          ''
        )
      },
      '2.0.0'
    )
  }
}

export default new TemporalUi()
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd E:/Github/FlyEnv-Admin/servers && npx ts-node scripts/temporal-version-test.ts`
Expected: 输出 15 组列表（每组 length > 0），最后 `ALL CHECKS PASSED`

- [ ] **Step 5: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv-Admin
git add servers/scripts/temporal-version-test.ts servers/src/api/version/module/temporal.ts servers/src/api/version/module/temporal-cli.ts servers/src/api/version/module/temporal-ui.ts
git commit -m "feat: add temporal, temporal-cli, temporal-ui version fetch modules"
```

## Task 2: 注册 VersionService 与 DTO 白名单

**Files:**
- Modify: `E:/Github/FlyEnv-Admin/servers/src/api/version/version.service.ts`（字段区约 line 12-54 附近；`clickhouse()` 方法在文件末尾 line 457-462）
- Modify: `E:/Github/FlyEnv-Admin/servers/src/api/version/version.req.dto.ts`（`@IsIn` 数组 line 5-53，union line 60-105）
- Modify: `E:/Github/FlyEnv-Admin/servers/src/api/version/dto/version.dto.ts`（union line 4-38）

**Interfaces:**
- Consumes: Task 1 的三个模块默认导出。
- Produces: `VersionService.temporal()` / `temporal_cli()` / `temporal_ui()` 三个方法（controller 将 `temporal-cli`/`temporal-ui` 的连字符转下划线后动态调用，方法名必须是下划线形式）；`VersionReqDto.app` 与 `VersionDto.app` 接受 `'temporal' | 'temporal-cli' | 'temporal-ui'`。

- [ ] **Step 1: version.service.ts 加字段**

在字段区（与其他 `private XxxModule: VersionClass` 相邻处，如 `private ClickHouseModule: VersionClass` 之后）加：

```ts
  private TemporalModule: VersionClass
  private TemporalCliModule: VersionClass
  private TemporalUiModule: VersionClass
```

- [ ] **Step 2: version.service.ts 加三个方法**

在类末尾 `clickhouse()` 方法之后加（照 `swoole_cli()` 写法，方法名下划线）：

```ts
  async temporal(dto: VersionReqDto) {
    if (!this.TemporalModule) {
      this.TemporalModule = (await import('./module/temporal')).default
    }
    return this.fetch(dto, this.TemporalModule)
  }

  async temporal_cli(dto: VersionReqDto) {
    if (!this.TemporalCliModule) {
      this.TemporalCliModule = (await import('./module/temporal-cli')).default
    }
    return this.fetch(dto, this.TemporalCliModule)
  }

  async temporal_ui(dto: VersionReqDto) {
    if (!this.TemporalUiModule) {
      this.TemporalUiModule = (await import('./module/temporal-ui')).default
    }
    return this.fetch(dto, this.TemporalUiModule)
  }
```

- [ ] **Step 3: version.req.dto.ts 加白名单**

`@IsIn([...])` 数组在 `'clickhouse'` 后加三项（**连字符形式**）：

```ts
      'minio',
      'clickhouse',
      'temporal',
      'temporal-cli',
      'temporal-ui',
    ],
```

`readonly app` 的 union 末尾同样加：

```ts
    | 'minio'
    | 'clickhouse'
    | 'temporal'
    | 'temporal-cli'
    | 'temporal-ui'
```

- [ ] **Step 4: dto/version.dto.ts 加 union**

```ts
    | 'zincsearch'
    | 'clickhouse'
    | 'temporal'
    | 'temporal-cli'
    | 'temporal-ui'
```

- [ ] **Step 5: 类型检查 + 回归测试 + 构建**

Run: `cd E:/Github/FlyEnv-Admin/servers && npx tsc --noEmit -p tsconfig.json`
Expected: 无输出（0 错误）

Run: `cd E:/Github/FlyEnv-Admin/servers && npx ts-node scripts/temporal-version-test.ts`
Expected: `ALL CHECKS PASSED`

Run: `cd E:/Github/FlyEnv-Admin/servers && npm run build`
Expected: nest build 成功无报错

- [ ] **Step 6: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv-Admin
git add servers/src/api/version/version.service.ts servers/src/api/version/version.req.dto.ts servers/src/api/version/dto/version.dto.ts
git commit -m "feat: register temporal apps in version service and dto whitelist"
```

## Task 3: 管理后台版本管理入口（可选但默认执行）

**Files:**
- Modify: `E:/Github/FlyEnv-Admin/client/src/api/version.ts`（union 中 `'clickhouse'` 在 line 26）
- Modify: `E:/Github/FlyEnv-Admin/client/src/views/version/manage/index.vue`（`all` 数组中 `'clickhouse'` 在 line 38）
- Modify: `E:/Github/FlyEnv-Admin/client/src/views/version/manage/list.vue`（props union 中 `'clickhouse'` 在 line 61）

**Interfaces:**
- Consumes: Task 2 的 DTO 白名单（后台 `/version/save|list` 复用同一 union）。
- Produces: 后台"版本管理"页出现 temporal / temporal-cli / temporal-ui 三个 tab，可手工补录/预览版本。

- [ ] **Step 1: 三处各加三个 key**

`client/src/api/version.ts` 的 union 在 `| 'clickhouse'` 后加：

```ts
    | 'clickhouse'
    | 'temporal'
    | 'temporal-cli'
    | 'temporal-ui'
```

`client/src/views/version/manage/index.vue` 的 `all` 数组在 `'clickhouse'` 后加：

```ts
  'clickhouse',
  'temporal',
  'temporal-cli',
  'temporal-ui'
]
```

`client/src/views/version/manage/list.vue` 的 props union 在 `| 'clickhouse'` 后加：

```ts
    | 'clickhouse'
    | 'temporal'
    | 'temporal-cli'
    | 'temporal-ui'
```

- [ ] **Step 2: 类型检查**

Run: `cd E:/Github/FlyEnv-Admin/client && npm run type-check`
Expected: vue-tsc 无错误

- [ ] **Step 3: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv-Admin
git add client/src/api/version.ts client/src/views/version/manage/index.vue client/src/views/version/manage/list.vue
git commit -m "feat: add temporal apps to admin version manage page"
```

## Task 4: 服务端部署与线上验证（用户手动执行）

**Files:** 无代码改动。

- [ ] **Step 1: 部署**

用户按既有流程发布 `servers` 到 api.one-env.com 并重启 NestJS 进程。Redis 无需清缓存（新 app key 无旧缓存）。

- [ ] **Step 2: 线上验证**

```bash
curl -X POST https://api.one-env.com/api/version/fetch -H "Content-Type: application/json" -d "{\"app\":\"temporal\",\"os\":\"win\",\"arch\":\"x86\"}"
curl -X POST https://api.one-env.com/api/version/fetch -H "Content-Type: application/json" -d "{\"app\":\"temporal-cli\",\"os\":\"mac\",\"arch\":\"arm\"}"
curl -X POST https://api.one-env.com/api/version/fetch -H "Content-Type: application/json" -d "{\"app\":\"temporal-ui\",\"os\":\"linux\",\"arch\":\"x86\"}"
```

Expected: 三条均返回 `{"code":200,"data":[{version,mVersion,versionSort,url},...]}`，`data` 非空且 url 指向正确的 GitHub 资产。若 `app 类型错误` 则检查 Task 2 Step 3 是否遗漏。

---
---

# Part B：FlyEnv 客户端（仓库 `E:\Github\FlyEnv`）

## Task 5: TemporalCli fork 模块（conf → start-dev flags）

**Files:**
- Create: `E:/Github/FlyEnv/src/fork/module/TemporalCli/util.ts`（纯函数，无重依赖，可独立测试）
- Create: `E:/Github/FlyEnv/src/fork/module/TemporalCli/index.ts`
- Test: `E:/Github/FlyEnv/scripts/temporal-cli-module-test.ts`（新建）

**Interfaces:**
- Consumes: `Base`（`src/fork/module/Base/index.ts`）的 `_fetchOnlineVersion` / `installSoft` / `_installSoftHandle` / `_stopServer`；`serviceStartSpawn({version, pidPath, baseDir, bin, execArgs, on})`；`versionLocalFetch(customDirs, binName, searchName?)`；`versionBinVersion(bin, command, reg)`（**正则取第 2 捕获组**）。
- Produces: fork 模块默认导出 `TemporalCli` 单例（`type = 'temporal-cli'`），Task 7 在 BaseManager/Version 注册；`parseConfToArgs(content: string): string[]` 与 `buildDefaultConf(dbFile: string): string` 供测试与模块共用。

背景事实（已从 CLI 源码 `internal/temporalcli/commands.gen.go` 核实）：`temporal server start-dev` 基于 cobra/pflag，bool flag 支持 `--headless=false` 形式；flag 集含 `db-filename, namespace, port, http-port, metrics-port, ui-port, headless, ip, ui-ip, ui-public-path, ui-asset-path, ui-codec-endpoint, ui-disable-news-fetch, sqlite-pragma, dynamic-config-value, log-config, search-attribute`；`default` namespace 总是自动创建；`--ui-port` 缺省 = `--port` + 1000；`--http-port` 缺省为随机端口，故默认 conf 固定 7243。

- [ ] **Step 1: 写冒烟测试（先写测试）**

新建 `E:/Github/FlyEnv/scripts/temporal-cli-module-test.ts`：

```ts
import assert from 'node:assert/strict'
import { buildDefaultConf, parseConfToArgs } from '../src/fork/module/TemporalCli/util'

// 默认 conf 全量解析
const conf = buildDefaultConf('E:/FlyEnv-Data/server/temporal-cli/data/dev.db')
const args = parseConfToArgs(conf)
assert.deepEqual(args, [
  '--ip=127.0.0.1',
  '--port=7233',
  '--http-port=7243',
  '--ui-ip=127.0.0.1',
  '--ui-port=8233',
  '--db-filename=E:/FlyEnv-Data/server/temporal-cli/data/dev.db',
  '--log-level=info',
  '--log-format=text',
  '--headless=false'
])

// 注释、空行、无等号行、空 key、空 value 全部跳过
assert.deepEqual(parseConfToArgs('# comment\n\nport=7300\nbroken-line\n=noval\nkey=\n  \n'), [
  '--port=7300'
])

// key/value 去空格；value 含等号时按第一个等号切分
assert.deepEqual(parseConfToArgs('  port = 7301 \ndynamic-config-value=K={"a":1}\n'), [
  '--port=7301',
  '--dynamic-config-value=K={"a":1}'
])

console.log('ALL CHECKS PASSED')
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd E:/Github/FlyEnv && npx tsx scripts/temporal-cli-module-test.ts`
Expected: 报错 `Cannot find module '../src/fork/module/TemporalCli/util'`

- [ ] **Step 3: 实现 util.ts**

新建 `src/fork/module/TemporalCli/util.ts`：

```ts
/**
 * Parse a key=value conf file into `temporal server start-dev` CLI flags.
 * Every valid line `key=value` becomes `--key=value` (pflag bool flags accept
 * the `=true/false` form, so no special-casing is needed).
 */
export function parseConfToArgs(content: string): string[] {
  const args: string[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!key || !value) {
      continue
    }
    args.push(`--${key}=${value}`)
  }
  return args
}

export function buildDefaultConf(dbFile: string): string {
  const lines = [
    '# Temporal CLI dev server config. Each line maps to a flag of `temporal server start-dev`.',
    '# See: https://docs.temporal.io/cli/server#start-dev',
    'ip=127.0.0.1',
    'port=7233',
    'http-port=7243',
    'ui-ip=127.0.0.1',
    'ui-port=8233',
    `db-filename=${dbFile}`,
    'log-level=info',
    'log-format=text',
    'headless=false'
  ]
  return lines.join('\n') + '\n'
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd E:/Github/FlyEnv && npx tsx scripts/temporal-cli-module-test.ts`
Expected: `ALL CHECKS PASSED`

- [ ] **Step 5: 实现 fork 模块 index.ts**

新建 `src/fork/module/TemporalCli/index.ts`：

```ts
import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  mkdirp,
  moveChildDirToParent,
  readFile,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import { buildDefaultConf, parseConfToArgs } from './util'

class TemporalCli extends Base {
  constructor() {
    super()
    this.type = 'temporal-cli'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'temporal-cli/temporal-cli.pid')
  }

  confFile(version: SoftInstalled): string {
    const v = version?.version ?? 'unknown'
    return join(global.Server.BaseDir!, 'temporal-cli', `temporal-cli-v${v}.conf`)
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
      const dataDir = join(baseDir, 'data')
      const confFile = this.confFile(version)
      if (!existsSync(confFile)) {
        try {
          await mkdirp(baseDir)
          await mkdirp(dataDir)
          on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
          const content = buildDefaultConf(join(dataDir, 'dev.db'))
          await writeFile(confFile, content)
          await writeFile(`${confFile}.default`, content)
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
          })
        } catch (e) {
          reject(e)
          return
        }
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `temporal-cli-${version.version}` })
        )
      })
      const confFile = await this.initConfig(version).on(on)
      const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
      const content = await readFile(confFile, 'utf-8')
      const execArgs = ['server', 'start-dev', ...parseConfToArgs(content)]
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin: version.bin,
          execArgs,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('temporal-cli start err: ', e)
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal-cli')
        all.forEach((a: any) => {
          const exe = isWindows() ? 'temporal.exe' : 'temporal'
          const ext = isWindows() ? '.zip' : '.tar.gz'
          a.appDir = join(global.Server.AppDir!, 'temporal-cli', a.version)
          a.bin = join(a.appDir, exe)
          a.zip = join(global.Server.Cache!, `temporal-cli-${a.version}${ext}`)
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `Temporal-CLI-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.['temporal-cli']?.dirs ?? [], 'temporal.exe')]
      } else {
        all = [versionLocalFetch(setup?.['temporal-cli']?.dirs ?? [], 'temporal', 'temporal')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(version )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            Object.assign(versions[i], {
              version: version,
              num: 0,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await super._installSoftHandle(row)
    if (!existsSync(row.bin)) {
      try {
        await moveChildDirToParent(row.appDir)
      } catch {}
    }
    if (!isWindows()) {
      await chmod(row.bin, '0755')
      if (isMacOS()) {
        try {
          await binXattrFix(row.bin)
        } catch {}
      }
    }
    await spawnPromise(basename(row.bin), ['--version'], {
      shell: false,
      cwd: dirname(row.bin)
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const confFile = this.confFile(version)
    return [
      { name: 'config', path: confFile },
      { name: 'default', path: `${confFile}.default` }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal-cli')
    const v = version.version.trim().split(' ').join('')
    return [
      { name: 'start-out', path: join(baseDir, `temporal-cli-${v}-start-out.log`) },
      { name: 'start-error', path: join(baseDir, `temporal-cli-${v}-start-error.log`) }
    ]
  }
}
export default new TemporalCli()
```

- [ ] **Step 6: fork 编译验证**

Run: `cd E:/Github/FlyEnv && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/fork/index.ts --outfile=dist/electron/fork.mjs`
Expected: 无报错完成（warning 可接受）

- [ ] **Step 7: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv
git add src/fork/module/TemporalCli/util.ts src/fork/module/TemporalCli/index.ts scripts/temporal-cli-module-test.ts
git commit -m "feat: add TemporalCli fork module (dev server via start-dev)"
```

## Task 6: Temporal fork 模块（temporal-server + 单实例 ui-server）

**Files:**
- Create: `E:/Github/FlyEnv/src/fork/module/Temporal/util.ts`（纯函数）
- Create: `E:/Github/FlyEnv/src/fork/module/Temporal/index.ts`
- Test: `E:/Github/FlyEnv/scripts/temporal-module-test.ts`（新建）
- Modify: `E:/Github/FlyEnv/package.json`（scripts 加 `test:temporal`）

**Interfaces:**
- Consumes: 同 Task 5 的 Base 能力；另用 `ProcessKill / ProcessOwnedPidsByPid / ProcessSearch`（`@shared/Process`）、`StopProcessListFetch`（`@shared/StopProcessList`）、`unpack`（`src/fork/util/Zip`）；`serviceStartSpawn` 的 `outFile` / `errFile` 参数（避免 ui-server 日志与 server 日志同名冲突）。
- Produces: fork 模块默认导出 `Temporal` 单例（`type = 'temporal'`）；UI 组件 IPC 方法 `fetchUiLatest()` / `installUiLatest(row)` / `uiServerInfo()`（Task 9 渲染侧调用）；`buildServerYaml(dataDir)` / `buildUiYaml()` / `serverEnvName(version)` 供测试与模块共用。

关键实现说明：
- temporal-server 启动参数照官方 systemd 示例：`-r / -c <config目录> -e <env名> start`，env 名即配置文件名（不含 .yaml）。
- `_stopServer` 覆写（`Base.stopService` 内部调的就是 `_stopServer`）：先停 ui-server 再走 `super._stopServer`。
- ui-server 单实例：固定目录 `AppDir/temporal-ui/`，`version.txt` 记版本；覆盖安装前清空目录。
- namespace 引导：扫 `AppDir/temporal-cli/*/` 找最新 `temporal[.exe]`，重试 3 次（间隔 3s）执行 `operator namespace create --namespace default --address 127.0.0.1:7233`，全部失败仅记日志。

- [ ] **Step 1: 写冒烟测试（先写测试）**

新建 `E:/Github/FlyEnv/scripts/temporal-module-test.ts`：

```ts
import assert from 'node:assert/strict'
import {
  buildServerYaml,
  buildUiYaml,
  normalizePath,
  serverEnvName
} from '../src/fork/module/Temporal/util'

// Windows 反斜杠路径归一化为正斜杠（避免 yaml 转义问题）
assert.equal(normalizePath('E:\\FlyEnv-Data\\server\\temporal\\data'), 'E:/FlyEnv-Data/server/temporal/data')
assert.equal(normalizePath('/Users/x/flyenv/temporal/data'), '/Users/x/flyenv/temporal/data')

// server yaml：SQLite 双库路径内插 + 关键端口
const yaml = buildServerYaml('E:\\FlyEnv-Data\\server\\temporal\\data')
assert.ok(yaml.includes('databaseName: "E:/FlyEnv-Data/server/temporal/data/default.db"'))
assert.ok(yaml.includes('databaseName: "E:/FlyEnv-Data/server/temporal/data/visibility.db"'))
assert.ok(yaml.includes('grpcPort: 7233'))
assert.ok(yaml.includes('httpPort: 7243'))
assert.ok(yaml.includes('setup: true'))
assert.ok(yaml.includes('rpcAddress: "127.0.0.1:7233"'))

// ui yaml：默认 8233 指向 7233
const uiYaml = buildUiYaml()
assert.ok(uiYaml.includes('temporalGrpcAddress: 127.0.0.1:7233'))
assert.ok(uiYaml.includes('port: 8233'))
assert.ok(uiYaml.includes('enableUi: true'))

// env 名 = 配置文件名主体
assert.equal(serverEnvName('1.31.1'), 'temporal-v1.31.1')

console.log('ALL CHECKS PASSED')
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd E:/Github/FlyEnv && npx tsx scripts/temporal-module-test.ts`
Expected: 报错 `Cannot find module '../src/fork/module/Temporal/util'`

- [ ] **Step 3: 实现 util.ts**

新建 `src/fork/module/Temporal/util.ts`：

```ts
/** Normalize to forward slashes so paths are safe inside yaml double-quoted scalars. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function serverEnvName(version: string): string {
  return `temporal-v${version}`
}

/**
 * temporal-server standalone config (SQLite dual-store, schema auto-setup).
 * Based on the official guide: https://learn.temporal.io/tutorials/infrastructure/configuring-sqlite-binary/
 */
export function buildServerYaml(dataDir: string): string {
  const dir = normalizePath(dataDir)
  return `log:
  stdout: true
  level: info
persistence:
  defaultStore: sqlite-default
  visibilityStore: sqlite-visibility
  numHistoryShards: 4
  datastores:
    sqlite-default:
      sql:
        pluginName: "sqlite"
        databaseName: "${dir}/default.db"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
    sqlite-visibility:
      sql:
        pluginName: "sqlite"
        databaseName: "${dir}/visibility.db"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
global:
  membership:
    maxJoinDuration: 30s
    broadcastAddress: "127.0.0.1"
  pprof:
    port: 7936
services:
  frontend:
    rpc:
      grpcPort: 7233
      membershipPort: 6933
      bindOnIP: '127.0.0.1'
      httpPort: 7243
  matching:
    rpc:
      grpcPort: 7235
      membershipPort: 6935
      bindOnLocalHost: true
  history:
    rpc:
      grpcPort: 7234
      membershipPort: 6934
      bindOnLocalHost: true
  worker:
    rpc:
      membershipPort: 6939
clusterMetadata:
  enableGlobalNamespace: false
  failoverVersionIncrement: 10
  masterClusterName: "active"
  currentClusterName: "active"
  clusterInformation:
    active:
      enabled: true
      initialFailoverVersion: 1
      rpcName: "frontend"
      rpcAddress: "127.0.0.1:7233"
      httpAddress: "127.0.0.1:7243"
dcRedirectionPolicy:
  policy: "noop"
`
}

export function buildUiYaml(): string {
  return `temporalGrpcAddress: 127.0.0.1:7233
host: 127.0.0.1
port: 8233
enableUi: true
cors:
  allowOrigins:
    - http://localhost:8233
defaultNamespace: default
`
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd E:/Github/FlyEnv && npx tsx scripts/temporal-module-test.ts`
Expected: `ALL CHECKS PASSED`

- [ ] **Step 5: 实现 fork 模块 index.ts**

新建 `src/fork/module/Temporal/index.ts`：

```ts
import { basename, dirname, join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  binXattrFix,
  chmod,
  mkdirp,
  moveChildDirToParent,
  readFile,
  remove,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionLocalFetch,
  versionSort,
  waitTime,
  writeFile,
  zipUnpack
} from '../../Fn'
import { unpack } from '../../util/Zip'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/runtime'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessOwnedPidsByPid, ProcessSearch } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { buildServerYaml, buildUiYaml, serverEnvName } from './util'

class Temporal extends Base {
  uiPidPath = ''

  constructor() {
    super()
    this.type = 'temporal'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'temporal/temporal.pid')
    this.uiPidPath = join(global.Server.BaseDir!, 'temporal/temporal-ui.pid')
  }

  uiBin(): string {
    return join(global.Server.AppDir!, 'temporal-ui', isWindows() ? 'ui-server.exe' : 'ui-server')
  }

  initConfig(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'temporal')
      const configDir = join(baseDir, 'config')
      const env = serverEnvName(version?.version ?? 'unknown')
      const confFile = join(configDir, `${env}.yaml`)
      if (!existsSync(confFile)) {
        try {
          await mkdirp(configDir)
          await mkdirp(join(baseDir, 'data'))
          on({ 'APP-On-Log': AppLog('info', I18nT('appLog.confInit')) })
          const content = buildServerYaml(join(baseDir, 'data'))
          await writeFile(confFile, content)
          await writeFile(`${confFile}.default`, content)
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: confFile }))
          })
        } catch (e) {
          reject(e)
          return
        }
      }
      resolve(confFile)
    })
  }

  initUiConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const configDir = join(global.Server.BaseDir!, 'temporal', 'config')
      const confFile = join(configDir, 'temporal-ui.yaml')
      if (!existsSync(confFile)) {
        try {
          await mkdirp(configDir)
          const content = buildUiYaml()
          await writeFile(confFile, content)
          await writeFile(`${confFile}.default`, content)
        } catch (e) {
          reject(e)
          return
        }
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled, uiFlag?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `temporal-${version.version}` })
        )
      })
      const baseDir = join(global.Server.BaseDir!, 'temporal')
      const configDir = join(baseDir, 'config')
      await this.initConfig(version).on(on)
      const env = serverEnvName(version?.version ?? '')
      const execArgs = ['-r', '/', '-c', configDir, '-e', env, 'start']
      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.pidPath,
          baseDir,
          bin: version.bin,
          execArgs,
          on
        })
        if (uiFlag === '1') {
          try {
            await this._startUiServer(version, on)
          } catch (e) {
            console.log('temporal ui-server start err: ', e)
            on({ 'APP-On-Log': AppLog('info', `Temporal UI (ui-server) start failed: ${e}`) })
          }
        }
        this._bootstrapNamespace(on).catch((e) => {
          console.log('temporal namespace bootstrap err: ', e)
        })
        resolve(res)
      } catch (e: any) {
        console.log('temporal start err: ', e)
        reject(e)
      }
    })
  }

  private async _startUiServer(version: SoftInstalled, on: any): Promise<void> {
    const bin = this.uiBin()
    if (!existsSync(bin)) {
      on({
        'APP-On-Log': AppLog(
          'info',
          'Temporal UI (ui-server) is not installed. Install it from the Web UI section on the Service tab.'
        )
      })
      return
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal')
    const configDir = join(baseDir, 'config')
    await this.initUiConfig().on(on)
    const uiVersion: any = { ...version, typeFlag: 'temporal' }
    await serviceStartSpawn({
      version: uiVersion,
      pidPath: this.uiPidPath,
      baseDir,
      bin,
      execArgs: ['-r', '/', '-c', configDir, '-e', 'temporal-ui', 'start'],
      outFile: join(baseDir, 'temporal-ui-start-out.log'),
      errFile: join(baseDir, 'temporal-ui-start-error.log'),
      on
    })
  }

  private async _bootstrapNamespace(on: any): Promise<void> {
    const cliRoot = join(global.Server.AppDir!, 'temporal-cli')
    if (!existsSync(cliRoot)) {
      return
    }
    const exe = isWindows() ? 'temporal.exe' : 'temporal'
    const bin = readdirSync(cliRoot)
      .sort()
      .reverse()
      .map((d) => join(cliRoot, d, exe))
      .find((p) => existsSync(p))
    if (!bin) {
      return
    }
    for (let i = 0; i < 3; i++) {
      try {
        await waitTime(3000)
        await spawnPromise(basename(bin), ['operator', 'namespace', 'create', '--namespace', 'default', '--address', '127.0.0.1:7233'], {
          shell: false,
          cwd: dirname(bin)
        })
        on({
          'APP-On-Log': AppLog('info', 'Temporal default namespace is ready')
        })
        return
      } catch (e) {
        console.log(`temporal namespace create attempt ${i + 1} err: `, e)
      }
    }
    on({
      'APP-On-Log': AppLog(
        'info',
        'Temporal default namespace was not created automatically. Run: temporal operator namespace create --namespace default'
      )
    })
  }

  _stopServer(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        await this._stopUiServer(version)
      } catch (e) {
        console.log('temporal stop ui-server err: ', e)
      }
      try {
        const res = await super._stopServer(version, ...args).on(on)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  private async _stopUiServer(version: SoftInstalled): Promise<void> {
    const plist = await StopProcessListFetch()
    const ownedMarkers = this.ownedProcessMarkers(version)
    const allPid: string[] = []
    if (existsSync(this.uiPidPath)) {
      try {
        const content = await readFile(this.uiPidPath, 'utf-8')
        const pid = content.trim()
        if (pid) {
          allPid.push(...ProcessOwnedPidsByPid(pid, plist, ownedMarkers))
        }
      } catch {}
    }
    const searched = ProcessSearch('ui-server', false, plist)
      .filter((p) => {
        if (isWindows()) {
          return p.COMMAND.includes('FlyEnv-Data') || p.COMMAND.includes('PhpWebStudy-Data')
        }
        return (
          (p.COMMAND.includes(global.Server.BaseDir!) ||
            p.COMMAND.includes(global.Server.AppDir!)) &&
          !p.COMMAND.includes(' grep ')
        )
      })
      .map((p) => `${p.PID}`)
    allPid.push(...searched)
    const arr = Array.from(new Set(allPid))
    if (arr.length > 0) {
      try {
        await ProcessKill('-INT', arr)
      } catch {}
    }
    try {
      if (existsSync(this.uiPidPath)) {
        await remove(this.uiPidPath)
      }
    } catch {}
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal')
        all.forEach((a: any) => {
          const exe = isWindows() ? 'temporal-server.exe' : 'temporal-server'
          const ext = isWindows() ? '.zip' : '.tar.gz'
          a.appDir = join(global.Server.AppDir!, 'temporal', a.version)
          a.bin = join(a.appDir, exe)
          a.zip = join(global.Server.Cache!, `temporal-${a.version}${ext}`)
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `Temporal-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.temporal?.dirs ?? [], 'temporal-server.exe')]
      } else {
        all = [versionLocalFetch(setup?.temporal?.dirs ?? [], 'temporal-server', 'temporal')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(version )(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            Object.assign(versions[i], {
              version: version,
              num: 0,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    const isUi = basename(row.bin).startsWith('ui-server')
    if (isUi) {
      await remove(row.appDir)
    }
    await mkdirp(row.appDir)
    if (`${row.zip}`.endsWith('.zip')) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      await unpack(row.zip, row.appDir)
    }
    if (!existsSync(row.bin)) {
      try {
        await moveChildDirToParent(row.appDir)
      } catch {}
    }
    if (!isWindows()) {
      await chmod(row.bin, '0755')
      if (isMacOS()) {
        try {
          await binXattrFix(row.bin)
        } catch {}
      }
    }
    if (isUi) {
      await writeFile(join(row.appDir, 'version.txt'), `${row.version ?? ''}`)
      try {
        await spawnPromise(basename(row.bin), ['--version'], {
          shell: false,
          cwd: dirname(row.bin)
        })
      } catch (e) {
        console.log('ui-server --version check failed (ignored): ', e)
      }
      return
    }
    await spawnPromise(basename(row.bin), ['--version'], {
      shell: false,
      cwd: dirname(row.bin)
    })
  }

  fetchUiLatest() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('temporal-ui')
        const first: any = all?.[0]
        if (!first) {
          resolve(null)
          return
        }
        const appDir = join(global.Server.AppDir!, 'temporal-ui')
        const bin = this.uiBin()
        first.appDir = appDir
        first.bin = bin
        first.zip = join(global.Server.Cache!, `temporal-ui-${first.version}.tar.gz`)
        first.downloaded = existsSync(first.zip)
        first.installed = existsSync(bin)
        first.name = `Temporal-UI-${first.version}`
        resolve(first)
      } catch {
        resolve(null)
      }
    })
  }

  installUiLatest(row: any) {
    return this.installSoft(row)
  }

  uiServerInfo() {
    return new ForkPromise(async (resolve) => {
      const bin = this.uiBin()
      const info: { installed: boolean; version: string | null } = {
        installed: existsSync(bin),
        version: null
      }
      const versionFile = join(global.Server.AppDir!, 'temporal-ui', 'version.txt')
      if (info.installed && existsSync(versionFile)) {
        try {
          info.version = (await readFile(versionFile, 'utf-8')).trim()
        } catch {}
      }
      resolve(info)
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const configDir = join(global.Server.BaseDir!, 'temporal', 'config')
    const env = serverEnvName(version.version)
    return [
      { name: 'config', path: join(configDir, `${env}.yaml`) },
      { name: 'default', path: join(configDir, `${env}.yaml.default`) },
      { name: 'ui', path: join(configDir, 'temporal-ui.yaml') },
      { name: 'ui-default', path: join(configDir, 'temporal-ui.yaml.default') }
    ].filter((f) => existsSync(f.path))
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    if (!version?.version) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'temporal')
    const v = version.version.trim().split(' ').join('')
    return [
      { name: 'start-out', path: join(baseDir, `temporal-${v}-start-out.log`) },
      { name: 'start-error', path: join(baseDir, `temporal-${v}-start-error.log`) },
      { name: 'ui-start-out', path: join(baseDir, 'temporal-ui-start-out.log') },
      { name: 'ui-start-error', path: join(baseDir, 'temporal-ui-start-error.log') }
    ]
  }
}
export default new Temporal()
```

- [ ] **Step 6: package.json 注册测试脚本**

在 `package.json` 的 `scripts` 中（与现有 `test:*` 条目相邻）加：

```json
"test:temporal": "tsx scripts/temporal-cli-module-test.ts && tsx scripts/temporal-module-test.ts",
```

- [ ] **Step 7: 运行全部冒烟测试 + fork 编译验证**

Run: `cd E:/Github/FlyEnv && yarn test:temporal`
Expected: 两个脚本均 `ALL CHECKS PASSED`

Run: `cd E:/Github/FlyEnv && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/fork/index.ts --outfile=dist/electron/fork.mjs`
Expected: 无报错完成

- [ ] **Step 8: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv
git add src/fork/module/Temporal/util.ts src/fork/module/Temporal/index.ts scripts/temporal-module-test.ts package.json
git commit -m "feat: add Temporal fork module (temporal-server + managed ui-server)"
```

## Task 7: 客户端注册（枚举 / BaseManager / Version / dis 字典 / MCP）

**Files:**
- Modify: `E:/Github/FlyEnv/src/render/core/type.ts`（`AppModuleEnum`，line 43-114）
- Modify: `E:/Github/FlyEnv/src/fork/BaseManager.ts`（属性声明区 + `consul` 分支在 line 429-434）
- Modify: `E:/Github/FlyEnv/src/fork/module/Version/index.ts`（`consul` 分支在 line 279-284，属性声明区同文件上部）
- Modify: `E:/Github/FlyEnv/src/fork/module/Base/index.ts`（`dis` 字典 line 296-317）
- Modify: `E:/Github/FlyEnv/src/main/core/mcpToolMetadata.ts`（`MCP_LIFECYCLE_FLAGS` line 1、`MCP_QUERYABLE_FLAGS` line 36、`MCP_INSTALLABLE_FLAGS` line 98）

**Interfaces:**
- Consumes: Task 5/6 的两个 fork 模块默认导出。
- Produces: `AppModuleEnum.temporal` / `AppModuleEnum['temporal-cli']`；IPC 通道 `app-fork:temporal` 与 `app-fork:temporal-cli` 可达全部模块方法（Task 8/9 渲染侧依赖）；`allInstalledVersions` 启动扫描覆盖两模块。

- [ ] **Step 1: AppModuleEnum 加枚举**

`src/render/core/type.ts` 的 `AppModuleEnum` 中（如 `copilotCli = 'copilotCli',` 之后）加：

```ts
  temporal = 'temporal',
  'temporal-cli' = 'temporal-cli',
```

- [ ] **Step 2: BaseManager.ts 加属性与分发分支**

属性声明区（与其他 `Xxx: any` 相邻）加：

```ts
  Temporal: any
  TemporalCli: any
```

`exec()` 分发链中（`module === 'consul'` 分支之后）加：

```ts
    } else if (module === 'temporal') {
      if (!this.Temporal) {
        const res = await import('./module/Temporal')
        this.Temporal = res.default
      }
      doRun(this.Temporal)
    } else if (module === 'temporal-cli') {
      if (!this.TemporalCli) {
        const res = await import('./module/TemporalCli')
        this.TemporalCli = res.default
      }
      doRun(this.TemporalCli)
```

- [ ] **Step 3: Version/index.ts 加属性与分支**

属性声明区加：

```ts
  Temporal: any
  TemporalCli: any
```

`allInstalledVersions` 的分发链中（`type === 'consul'` 分支之后）加：

```ts
        } else if (type === 'temporal') {
          if (!this.Temporal) {
            const res = await import('../Temporal')
            this.Temporal = res.default
          }
          versions.temporal = this.Temporal.allInstalledVersions(setup)
        } else if (type === 'temporal-cli') {
          if (!this.TemporalCli) {
            const res = await import('../TemporalCli')
            this.TemporalCli = res.default
          }
          versions['temporal-cli'] = this.TemporalCli.allInstalledVersions(setup)
```

- [ ] **Step 4: Base/index.ts dis 字典加进程名映射**

`dis` 字典中（`numa: 'numa'` 之后）加：

```ts
        numa: 'numa',
        temporal: 'temporal-server',
        'temporal-cli': 'temporal'
```

- [ ] **Step 5: mcpToolMetadata.ts 三个 flag 列表**

`MCP_LIFECYCLE_FLAGS`、`MCP_QUERYABLE_FLAGS`、`MCP_INSTALLABLE_FLAGS` 三个数组各自末尾（`]` 之前）均加：

```ts
  'temporal',
  'temporal-cli',
```

- [ ] **Step 6: fork + main 编译验证**

Run: `cd E:/Github/FlyEnv && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/fork/index.ts --outfile=dist/electron/fork.mjs`
Expected: 无报错

Run: `cd E:/Github/FlyEnv && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/main/index.dev.ts --outfile=dist/electron/main.mjs`
Expected: 无报错

- [ ] **Step 7: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv
git add src/render/core/type.ts src/fork/BaseManager.ts src/fork/module/Version/index.ts src/fork/module/Base/index.ts src/main/core/mcpToolMetadata.ts
git commit -m "feat: register temporal and temporal-cli modules"
```

## Task 8: TemporalCli 渲染组件

**Files:**
- Create: `E:/Github/FlyEnv/src/render/components/TemporalCli/Module.ts`
- Create: `E:/Github/FlyEnv/src/render/components/TemporalCli/Index.vue`
- Create: `E:/Github/FlyEnv/src/render/components/TemporalCli/aside.vue`
- Create: `E:/Github/FlyEnv/src/render/components/TemporalCli/Config.vue`
- Create: `E:/Github/FlyEnv/src/render/components/TemporalCli/Logs.vue`
- Create: `E:/Github/FlyEnv/src/render/svg/temporal-cli.svg`

**Interfaces:**
- Consumes: `AsideSetup('temporal-cli')` / `AppServiceModule`（`@/core/ASide`）；`AppModuleSetup('temporal-cli')`（`@/core/Module`）；通用 `ServiceManager`（`../ServiceManager/index.vue`）与 `VersionManager`（`../VersionManager/index.vue`）；`Conf`（`@/components/Conf/index.vue`）；`LogVM`/`ToolVM`（`@/components/Log/*`）；`IPC` 响应包壳为 `{code, msg, data}`（`res.code === 0` 成功）。
- Produces: 路由 `/temporal-cli` 与侧边栏项（glob 自动注册，无需改路由）。

- [ ] **Step 1: Module.ts**

```ts
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'cacheAndQueue',
  typeFlag: 'temporal-cli',
  label: 'Temporal CLI',
  icon: import('@/svg/temporal-cli.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 51,
  isService: true,
  isTray: true
}
export default module
```

（`asideIndex` 与同组模块错开即可，组内按 typeFlag 字母序兜底。）

- [ ] **Step 2: Index.vue**

```vue
<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="temporal-cli" title="Temporal CLI">
        <template #tool-left>
          <div class="flex items-center gap-1 pl-4 pr-2">
            <el-button class="flex-shrink-0" link :icon="Link" @click.stop="openURL"></el-button>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="temporal-cli"
        :has-static="true"
        url="https://docs.temporal.io/cli"
        title="Temporal CLI"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { fs, shell } from '@/util/NodeFn'
  import { Link } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { computed } from 'vue'
  import { join } from '@/util/path-browserify'

  const { tab, checkVersion } = AppModuleSetup('temporal-cli')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal-cli')
  })

  const openURL = async () => {
    let port = '8233'
    const v = currentVersion?.value?.version ?? ''
    if (v) {
      const confFile = join(window.Server.BaseDir!, `temporal-cli/temporal-cli-v${v}.conf`)
      const exists = await fs.existsSync(confFile)
      if (exists) {
        const content = await fs.readFile(confFile)
        const line = content.split('\n').find((s: string) => s.trim().startsWith('ui-port'))
        port = line?.split('=')?.pop()?.trim() || '8233'
      }
    }
    shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
  }
</script>
```

- [ ] **Step 3: aside.vue**

```vue
<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/temporal-cli' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/temporal-cli.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Temporal CLI</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'

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
  } = AsideSetup('temporal-cli')

  AppServiceModule['temporal-cli'] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
```

- [ ] **Step 4: Config.vue**

```vue
<template>
  <Conf
    ref="conf"
    :type-flag="'temporal-cli'"
    :default-file="defaultFile"
    :file="file"
    :file-ext="'conf'"
    :show-commond="false"
  >
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'

  const conf = ref()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal-cli')
  })

  const file = computed(() => {
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(window.Server.BaseDir!, `temporal-cli/temporal-cli-v${v}.conf`)
  })
  const defaultFile = computed(() => {
    return file.value ? `${file.value}.default` : ''
  })

  fs.existsSync(file.value).then((e) => {
    if (!e && currentVersion.value) {
      IPC.send(
        'app-fork:temporal-cli',
        'initConfig',
        JSON.parse(JSON.stringify(currentVersion.value))
      ).then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
```

- [ ] **Step 5: Logs.vue**

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
  import { computed, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal-cli')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value?.version) {
      return ''
    }
    const v = currentVersion.value.version.trim().split(' ').join('')
    return join(window.Server.BaseDir!, `temporal-cli/temporal-cli-${v}-start-out.log`)
  })
</script>
```

- [ ] **Step 6: 图标**

新建 `src/render/svg/temporal-cli.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path d="M2 2h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm0 1.5v9h12v-9H2z"/>
  <path d="M3.5 5.5 6 8l-2.5 2.5 1 1L8 8 4.5 4.5l-1 1zM8 10.9h4.5v1.2H8V10.9z"/>
</svg>
```

- [ ] **Step 7: 渲染构建验证**

Run: `cd E:/Github/FlyEnv && npx cross-env NODE_ENV=production vite build --config configs/vite.config.ts`
Expected: 构建成功（耗时数分钟正常）；若报内存不足，重跑或加大 `NODE_OPTIONS=--max-old-space-size=8192`

- [ ] **Step 8: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv
git add src/render/components/TemporalCli src/render/svg/temporal-cli.svg
git commit -m "feat: add Temporal CLI renderer components"
```

## Task 9: Temporal 渲染组件（含 Web UI 区块）

**Files:**
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/Module.ts`
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/Index.vue`
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/aside.vue`
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/Config.vue`
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/Logs.vue`
- Create: `E:/Github/FlyEnv/src/render/components/Temporal/setup.ts`
- Create: `E:/Github/FlyEnv/src/render/svg/temporal.svg`

**Interfaces:**
- Consumes: Task 6 的 fork IPC 方法 `uiServerInfo` / `fetchUiLatest` / `installUiLatest` / `initConfig` / `initUiConfig`；`startExtParam` 注入 `_startServer(version, uiFlag)` 的第二个参数（`'1'` 启用 UI）。
- Produces: 路由 `/temporal`；`TemporalSetup.uiEnabled`（localForage 持久化，key `flyenv-temporal-ui-enabled`，默认 `true`）。

- [ ] **Step 1: setup.ts**

```ts
import { reactive } from 'vue'
import localForage from 'localforage'

export const TemporalSetup: {
  uiEnabled: boolean
  init: () => void
  save: () => void
} = reactive({
  uiEnabled: true,
  init() {
    localForage
      .getItem('flyenv-temporal-ui-enabled')
      .then((res: boolean | null) => {
        if (res !== null && res !== undefined) {
          TemporalSetup.uiEnabled = !!res
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem('flyenv-temporal-ui-enabled', TemporalSetup.uiEnabled)
      .then()
      .catch()
  }
})
```

- [ ] **Step 2: Module.ts**

```ts
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'cacheAndQueue',
  typeFlag: 'temporal',
  label: 'Temporal',
  icon: import('@/svg/temporal.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 50,
  isService: true,
  isTray: true
}
export default module
```

- [ ] **Step 3: Index.vue（含 Web UI 区块）**

```vue
<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="temporal" title="Temporal">
        <template #tool-left>
          <div class="flex items-center gap-2 pl-4 pr-2">
            <span class="flex-shrink-0">Web UI</span>
            <el-switch v-model="uiEnabled" />
            <template v-if="uiEnabled">
              <span v-if="uiInfo.installed && uiInfo.version" class="text-xs opacity-70"
                >v{{ uiInfo.version }}</span
              >
              <el-button link type="primary" :loading="uiInstalling" @click.stop="installUi">
                {{ I18nT('base.install') }}
              </el-button>
              <el-button
                v-if="uiInfo.installed"
                link
                :icon="Link"
                @click.stop="openURL"
              ></el-button>
            </template>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="temporal"
        :has-static="true"
        url="https://docs.temporal.io/self-hosted-guide"
        title="Temporal"
      ></Manager>
      <Config v-if="tab === 2"></Config>
      <Logs v-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { fs, shell } from '@/util/NodeFn'
  import { Link } from '@element-plus/icons-vue'
  import { computed, ref } from 'vue'
  import { join } from '@/util/path-browserify'
  import IPC from '@/util/IPC'
  import { MessageError } from '@/util/Element'
  import { TemporalSetup } from '@/components/Temporal/setup'

  const { tab, checkVersion } = AppModuleSetup('temporal')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  TemporalSetup.init()

  const uiEnabled = computed({
    get: () => TemporalSetup.uiEnabled,
    set: (v: boolean) => {
      TemporalSetup.uiEnabled = v
      TemporalSetup.save()
    }
  })

  const uiInfo = ref<{ installed: boolean; version: string | null }>({
    installed: false,
    version: null
  })
  const uiInstalling = ref(false)

  const refreshUiInfo = () => {
    IPC.send('app-fork:temporal', 'uiServerInfo').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        uiInfo.value = res.data
      }
    })
  }

  const installUi = () => {
    if (uiInstalling.value) {
      return
    }
    uiInstalling.value = true
    IPC.send('app-fork:temporal', 'fetchUiLatest').then((key: string, res: any) => {
      IPC.off(key)
      const row = res?.code === 0 ? res?.data : null
      if (!row?.url) {
        uiInstalling.value = false
        MessageError(I18nT('fork.downloadFileFail'))
        return
      }
      IPC.send('app-fork:temporal', 'installUiLatest', JSON.parse(JSON.stringify(row))).then(
        (k2: string, res2: any) => {
          IPC.off(k2)
          uiInstalling.value = false
          if (res2?.code === 0) {
            refreshUiInfo()
          } else {
            MessageError(res2?.msg ?? I18nT('fork.downloadFileFail'))
          }
        }
      )
    })
  }

  const openURL = async () => {
    let port = '8233'
    const confFile = join(window.Server.BaseDir!, 'temporal/config/temporal-ui.yaml')
    const exists = await fs.existsSync(confFile)
    if (exists) {
      const content = await fs.readFile(confFile)
      const line = content.split('\n').find((s: string) => s.trim().startsWith('port:'))
      port = line?.split(':')?.pop()?.trim() || '8233'
    }
    shell.openExternal(`http://127.0.0.1:${port}/`).then().catch()
  }

  refreshUiInfo()
</script>
```

- [ ] **Step 4: aside.vue（startExtParam 注入 UI 开关）**

```vue
<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/temporal' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          :svg="import('@/svg/temporal.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Temporal</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange()"
    >
    </el-switch>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import { TemporalSetup } from '@/components/Temporal/setup'

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
  } = AsideSetup('temporal')

  TemporalSetup.init()

  const brewStore = BrewStore()

  const module = brewStore.module('temporal')
  if (!module?.startExtParam) {
    module.startExtParam = () => {
      return new Promise<any[]>((resolve) => {
        resolve([TemporalSetup.uiEnabled ? '1' : '0'])
      })
    }
  }

  AppServiceModule.temporal = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
```

- [ ] **Step 5: Config.vue（server / ui 配置切换）**

```vue
<template>
  <div>
    <el-radio-group v-model="confType" class="mb-2 px-3">
      <el-radio-button label="server" value="server">Server</el-radio-button>
      <el-radio-button label="ui" value="ui">UI</el-radio-button>
    </el-radio-group>
    <Conf
      :key="file"
      ref="conf"
      :type-flag="'temporal'"
      :default-file="defaultFile"
      :file="file"
      :file-ext="'yaml'"
      :show-commond="false"
    >
    </Conf>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'

  const conf = ref()
  const confType = ref<'server' | 'ui'>('server')

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal')
  })

  const file = computed(() => {
    const configDir = join(window.Server.BaseDir!, 'temporal', 'config')
    if (confType.value === 'ui') {
      return join(configDir, 'temporal-ui.yaml')
    }
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(configDir, `temporal-v${v}.yaml`)
  })
  const defaultFile = computed(() => {
    return file.value ? `${file.value}.default` : ''
  })

  fs.existsSync(file.value).then((e) => {
    if (e) {
      return
    }
    if (confType.value === 'ui') {
      IPC.send('app-fork:temporal', 'initUiConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    } else if (currentVersion.value) {
      IPC.send(
        'app-fork:temporal',
        'initConfig',
        JSON.parse(JSON.stringify(currentVersion.value))
      ).then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
```

- [ ] **Step 6: Logs.vue（server / ui 日志切换）**

```vue
<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <el-radio-group v-model="logType">
          <el-radio-button
            v-for="f in files"
            :key="f.path"
            :label="f.name"
            :value="f.path"
          ></el-radio-button>
        </el-radio-group>
      </template>
      <LogVM ref="log" :key="logType" :log-file="logType" />
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
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal')
  })

  const log = ref()

  const files = computed(() => {
    const baseDir = join(window.Server.BaseDir!, 'temporal')
    const v = currentVersion?.value?.version?.trim()?.split(' ')?.join('') ?? ''
    const list = [
      { name: 'ui-out', path: join(baseDir, 'temporal-ui-start-out.log') },
      { name: 'ui-error', path: join(baseDir, 'temporal-ui-start-error.log') }
    ]
    if (v) {
      list.unshift(
        { name: 'server-out', path: join(baseDir, `temporal-${v}-start-out.log`) },
        { name: 'server-error', path: join(baseDir, `temporal-${v}-start-error.log`) }
      )
    }
    return list
  })

  const logType = ref('')

  watch(
    files,
    (list) => {
      if (!logType.value || !list.some((f) => f.path === logType.value)) {
        logType.value = list?.[0]?.path ?? ''
      }
    },
    { immediate: true }
  )
</script>
```

- [ ] **Step 7: 图标**

新建 `src/render/svg/temporal.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 12.5A5.5 5.5 0 1 1 13.5 8 5.5 5.5 0 0 1 8 13.5z"/>
  <path d="M8.5 4.5v3.7l3 1.8-.7 1.2L7 9.1V4.5h1.5z"/>
</svg>
```

- [ ] **Step 8: 渲染构建验证**

Run: `cd E:/Github/FlyEnv && npx cross-env NODE_ENV=production vite build --config configs/vite.config.ts`
Expected: 构建成功

- [ ] **Step 9: Commit（先向用户确认）**

```bash
cd E:/Github/FlyEnv
git add src/render/components/Temporal src/render/svg/temporal.svg
git commit -m "feat: add Temporal renderer components with managed Web UI"
```

## Task 10: 全量验证与手动验收

**Files:** 无代码改动（如有修复，回归对应 Task）。

- [ ] **Step 1: 冒烟测试全跑**

Run: `cd E:/Github/FlyEnv && yarn test:temporal`
Expected: `ALL CHECKS PASSED`（两个脚本）

Run: `cd E:/Github/FlyEnv-Admin/servers && npx ts-node scripts/temporal-version-test.ts`
Expected: `ALL CHECKS PASSED`

- [ ] **Step 2: 三端构建**

Run: `cd E:/Github/FlyEnv && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/main/index.dev.ts --outfile=dist/electron/main.mjs && npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm src/fork/index.ts --outfile=dist/electron/fork.mjs`
Expected: 无报错

Run: `cd E:/Github/FlyEnv && npx cross-env NODE_ENV=production vite build --config configs/vite.config.ts`
Expected: 构建成功

Run: `cd E:/Github/FlyEnv-Admin/servers && npm run build`
Expected: nest build 成功

- [ ] **Step 3: 手动验收（yarn dev，依赖 Task 4 服务端已部署）**

1. 侧边栏"缓存与队列"组出现 Temporal 与 Temporal CLI，图标正常
2. Temporal CLI → 版本管理：在线列表非空 → 安装最新版 → 服务 Tab 启动 → 点"打开 UI"：`:8233` 展示 Temporal Web UI（dev server 自带）且能看到 `default` namespace → 配置 Tab 改 `ui-port=8333` → 重启服务生效 → 停止，无 `temporal` 进程残留
3. Temporal → 版本管理安装 temporal-server → 服务 Tab 打开 Web UI 开关 → 点安装（拉取 ui-server 最新版）→ 启动服务 → "打开 UI"：`:8233` 可访问，工作流列表正常 → 已装 Temporal CLI 时 `default` namespace 自动存在 → 停止，无 `temporal-server` / `ui-server` 进程残留
4. 配置 Tab 编辑 server yaml 端口（如 grpcPort 7233→7333 并同步 rpcAddress）→ 重启生效；`temporal operator namespace list --address 127.0.0.1:7333` 连通
5. 日志 Tab 各日志文件可读；托盘图标启停正常
6. 数据落盘检查：`server/temporal/data/*.db`、`server/temporal-cli/data/dev.db` 存在

- [ ] **Step 4: 最终 Commit（先向用户确认，如有修复）**

```bash
cd E:/Github/FlyEnv
git add -A
git commit -m "fix: temporal integration acceptance fixes"
```
