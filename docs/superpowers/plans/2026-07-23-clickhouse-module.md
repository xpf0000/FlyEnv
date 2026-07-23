# ClickHouse 模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FlyEnv 桌面端（macOS/Linux）新增 ClickHouse 数据库模块（启停/在线安装/配置/日志/托盘/MCP），并在 FlyEnv-Admin 后台新增 clickhouse 版本抓取模块提供在线版本列表。

**Architecture:** 版本数据走既有统一通道：FlyEnv-Admin 用 GitHub Releases API 抓 `ClickHouse/ClickHouse` 各平台资产（Redis 缓存 6h），桌面端 fork 模块经 `POST api.one-env.com/api/version/fetch` 取列表；Linux 装 tgz（`Base.installSoft` 流程），macOS 装裸二进制（自定义 `_installSoftHandle`），启动用 `serviceStartSpawn` 前台 spawn `clickhouse server`。渲染端靠 `import.meta.glob` 自动发现，Windows 用 `platform` 字段隐藏。

**Tech Stack:** NestJS 10（Admin）、Electron 39 + Vue 3 + Pinia（桌面端）、TypeScript 5.8。

**参考规格文档:** `docs/superpowers/specs/2026-07-23-clickhouse-module-design.md`

**涉及两个 git 仓库：**
- Admin：`E:\Github\FlyEnv-Admin`（Task 1–3）
- 桌面端：`E:\Github\FlyEnv`（Task 4–9）

**准备工作（执行前）：** 建议在两个仓库各建特性分支（如 `feat/clickhouse`）。创建分支属于 git 操作，执行时向用户确认后创建。

**已验证的关键事实（2026-07-23）：**
- GitHub Releases 每个 release（`-stable`/`-lts` 频道）固定挂 50 个资产，含 `clickhouse-macos`、`clickhouse-macos-aarch64`（裸二进制）与 `clickhouse-common-static-{version}-amd64.tgz` / `-arm64.tgz`
- tag 形如 `v25.8.28.1-lts`；需排除 `-new`/`-prestable` 频道
- 资产 URL：`https://github.com/ClickHouse/ClickHouse/releases/download/{tag}/{asset}`，302 跳转可下载
- ClickHouse 是单一静态二进制，`clickhouse server` 即可运行；HTTP 端口 8123、Native 端口 9000 均非特权端口

---

## 文件结构

### FlyEnv-Admin（`E:\Github\FlyEnv-Admin`）

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `servers/src/api/version/module/clickhouse.ts` | clickhouse 版本抓取（GitHub Releases 资产匹配） | 新建 |
| `servers/scripts/clickhouse-version-test.ts` | 抓取模块独立验证脚本（不依赖 Nest 启动/MySQL/Redis） | 新建 |
| `servers/src/api/version/version.req.dto.ts` | `@IsIn` 白名单 + app 联合类型 | 修改 |
| `servers/src/api/version/version.service.ts` | 模块字段声明 + `clickhouse(dto)` 分发方法 | 修改 |
| `servers/src/api/version/dto/version.dto.ts` | 手工版本维护的 app 联合类型 | 修改 |
| `client/src/views/version/manage/index.vue` 等 3 个 | 管理后台版本管理页（可选） | 修改 |

### FlyEnv（`E:\Github\FlyEnv`）

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `src/fork/module/ClickHouse/index.ts` | fork 模块：安装/启停/配置生成/版本扫描/brewinfo | 新建 |
| `src/render/components/ClickHouse/{Module.ts,Index.vue,aside.vue,Config.vue,Logs.vue}` | 渲染组件（自动发现） | 新建 |
| `src/render/svg/clickhouse.svg` | 图标 | 新建 |
| `src/render/core/type.ts` | `AppModuleEnum` 加 `clickhouse` | 修改 |
| `src/global.d.ts` | `ServerType` 加 `ClickHouseDir` | 修改 |
| `src/main/utils/ServerPath.ts` | `SetupGlobalPaths` 设置 `ClickHouseDir` | 修改 |
| `src/fork/BaseManager.ts` | exec 分发链加分支 | 修改 |
| `src/fork/module/Version/index.ts` | `allInstalledVersions` 分发加分支 | 修改 |
| `src/fork/module/Base/index.ts` | `_stopServer` 的 `dis` 进程名映射加 clickhouse | 修改 |
| `src/main/core/mcpToolMetadata.ts`、`MCPTools.ts`、`MCPContextResolver.ts` | MCP flag 集成 | 修改 |

---

## Task 1: Admin — clickhouse 版本抓取模块

仓库：`E:\Github\FlyEnv-Admin`

**Files:**
- Create: `servers/src/api/version/module/clickhouse.ts`
- Create: `servers/scripts/clickhouse-version-test.ts`

背景知识（实现者无需再查）：`servers/src/api/version/module/base.ts` 的 `fetchFromGitHubReleases(repos, versionFetch, mvLength, urlFetch, minVersino)` 会拉 `https://api.github.com/repos/{repos}/releases`（带 `request.ts` 里的 token），`versionFetch(tag)` 返回版本字符串（**返回空串则跳过该 tag**），`urlFetch(tag)` 返回下载 URL（空串跳过），按 versionSort 前 `mvLength` 段分组成 mVersion，每组降序取第一个 HEAD 验证通过的。参考实现 `servers/src/api/version/module/qdrant.ts`。

- [ ] **Step 1: 创建抓取模块**

创建 `servers/src/api/version/module/clickhouse.ts`，完整内容：

```ts
import { Base, GitHubReleases } from './base'

const CHANNELS = ['-stable', '-lts']

class ClickHouse extends Base {
  private parseVersion(tag: GitHubReleases): string {
    const name = tag.tag_name
    if (!CHANNELS.some((c) => name.endsWith(c))) {
      return ''
    }
    // 保留频道后缀（如 25.8.28.1-lts），versionSort/mVersion 由 Base 按数字段生成
    return name.replace(/^v/, '')
  }

  async win() {
    return []
  }

  async mac(arch: 'x86' | 'arm') {
    const asset = arch === 'x86' ? 'clickhouse-macos' : 'clickhouse-macos-aarch64'
    return await this.fetchFromGitHubReleases(
      'ClickHouse/ClickHouse',
      (tag: GitHubReleases) => this.parseVersion(tag),
      2,
      (tag: GitHubReleases) => {
        return tag.assets.find((a) => a.name === asset)?.browser_download_url ?? ''
      },
      '22.0.0'
    )
  }

  async linux(arch: 'x86' | 'arm') {
    const assetArch = arch === 'x86' ? 'amd64' : 'arm64'
    return await this.fetchFromGitHubReleases(
      'ClickHouse/ClickHouse',
      (tag: GitHubReleases) => this.parseVersion(tag),
      2,
      (tag: GitHubReleases) => {
        const version = this.parseVersion(tag)
        if (!version) {
          return ''
        }
        const bare = version.replace(/-(stable|lts)$/, '')
        const name = `clickhouse-common-static-${bare}-${assetArch}.tgz`
        return tag.assets.find((a) => a.name === name)?.browser_download_url ?? ''
      },
      '22.0.0'
    )
  }
}

export default new ClickHouse()
```

- [ ] **Step 2: 创建独立验证脚本**

创建 `servers/scripts/clickhouse-version-test.ts`（不启动 Nest、不需要 MySQL/Redis，直接调模块；GitHub 请求自动带 `request.ts` 里的 token），完整内容：

```ts
import ClickHouse from '../src/api/version/module/clickhouse'

async function main() {
  const [linuxX86, linuxArm, macX86, macArm, win] = [
    await ClickHouse.linux('x86'),
    await ClickHouse.linux('arm'),
    await ClickHouse.mac('x86'),
    await ClickHouse.mac('arm'),
    await ClickHouse.win()
  ]
  console.log('linux x86:', linuxX86.length, linuxX86[0])
  console.log('linux arm:', linuxArm.length, linuxArm[0])
  console.log('mac x86:', macX86.length, macX86[0])
  console.log('mac arm:', macArm.length, macArm[0])
  console.log('win:', win)

  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      throw new Error(`CHECK FAILED: ${msg}`)
    }
  }
  assert(linuxX86.length > 0, 'linux x86 list empty')
  assert(linuxArm.length > 0, 'linux arm list empty')
  assert(macX86.length > 0, 'mac x86 list empty')
  assert(macArm.length > 0, 'mac arm list empty')
  assert(win.length === 0, 'win should be empty')
  assert(
    linuxX86.every((v) => v.url!.includes('clickhouse-common-static-') && v.url!.includes('-amd64.tgz')),
    'linux x86 url mismatch'
  )
  assert(
    linuxArm.every((v) => v.url!.includes('-arm64.tgz')),
    'linux arm url mismatch'
  )
  assert(
    macX86.every((v) => v.url!.endsWith('/clickhouse-macos')),
    'mac x86 url mismatch'
  )
  assert(
    macArm.every((v) => v.url!.endsWith('/clickhouse-macos-aarch64')),
    'mac arm url mismatch'
  )
  assert(
    linuxX86.every((v) => /^\d+\.\d+\.\d+\.\d+-(stable|lts)$/.test(v.version)),
    `version format mismatch: ${linuxX86.map((v) => v.version).join(',')}`
  )
  console.log('ALL CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 3: 运行验证脚本**

```bash
cd /e/Github/FlyEnv-Admin/servers && npx tsx scripts/clickhouse-version-test.ts
```

预期：输出 5 行列表统计（linux/mac 各 >0 条，win 为空数组）+ `ALL CHECKS PASSED`。
若 npx 提示安装 tsx，确认安装（装在 npx 缓存，不污染 package.json）。
注意：脚本会对 GitHub 资产 URL 发大量 HEAD 请求（Base 内置验证），耗时 1–3 分钟属正常；GitHub API 已带 token 不会触发匿名限流。

- [ ] **Step 4: 提交（FlyEnv-Admin 仓库）**

```bash
cd /e/Github/FlyEnv-Admin && git add servers/src/api/version/module/clickhouse.ts servers/scripts/clickhouse-version-test.ts && git commit -m "feat: add ClickHouse version fetch module"
```

---

## Task 2: Admin — 注册 clickhouse（DTO + Service）

仓库：`E:\Github\FlyEnv-Admin`

**Files:**
- Modify: `servers/src/api/version/version.req.dto.ts`
- Modify: `servers/src/api/version/version.service.ts`
- Modify: `servers/src/api/version/dto/version.dto.ts`

- [ ] **Step 1: `version.req.dto.ts` 两处加白名单**

`@IsIn([...])` 数组中 `'frankenphp'` 后加 `'clickhouse'`：

```ts
      'r-nacos',
      'frankenphp',
      'clickhouse',
    ],
```

`readonly app:` 联合类型末尾同样加：

```ts
    | 'r-nacos'
    | 'frankenphp'
    | 'clickhouse'
```

- [ ] **Step 2: `version.service.ts` 加字段声明与分发方法**

字段声明区（`private FrankenPHPModule: VersionClass` 之后）加：

```ts
  private ClickHouseModule: VersionClass
```

类末尾（`frankenphp(dto)` 方法之后）加方法（`clickhouse` 无连字符，controller 的 `replace(/-/g, '_')` 分发后方法名就是 `clickhouse`）：

```ts
  async clickhouse(dto: VersionReqDto) {
    if (!this.ClickHouseModule) {
      this.ClickHouseModule = (await import('./module/clickhouse')).default
    }
    return this.fetch(dto, this.ClickHouseModule)
  }
```

- [ ] **Step 3: `dto/version.dto.ts` 联合类型加 clickhouse**

`readonly app?:` 联合类型末尾加：

```ts
    | 'r-nacos'
    | 'frankenphp'
    | 'clickhouse'
```

- [ ] **Step 4: 编译验证**

```bash
cd /e/Github/FlyEnv-Admin/servers && npx tsc --noEmit -p tsconfig.json
```

预期：无错误退出（exit 0）。

- [ ] **Step 5（可选，需本地 MySQL+Redis）: 端点联调**

若本地有 dev.yml 要求的 MySQL（127.0.0.1:3306/flyenvpws）和 Redis（localhost:6379）：

```bash
cd /e/Github/FlyEnv-Admin/servers && npm run start:dev
# 另开终端：
curl -s -X POST http://localhost:8081/api/version/fetch -H "Content-Type: application/json" -d '{"app":"clickhouse","os":"linux","arch":"x86","nocache":"xpf0000"}' | head -c 400
curl -s -X POST http://localhost:8081/api/version/fetch -H "Content-Type: application/json" -d '{"app":"clickhouse","os":"mac","arch":"arm","nocache":"xpf0000"}' | head -c 400
curl -s -X POST http://localhost:8081/api/version/fetch -H "Content-Type: application/json" -d '{"app":"clickhouse","os":"win","arch":"x86"}'
```

预期：linux 返回 `clickhouse-common-static-*.tgz` 列表；mac arm 返回 `clickhouse-macos-aarch64` 列表；win 返回 `{"code":200,"data":[]}`。没有本地环境则跳过此步，Task 1 的脚本验证已覆盖抓取逻辑。

- [ ] **Step 6: 提交（FlyEnv-Admin 仓库）**

```bash
cd /e/Github/FlyEnv-Admin && git add servers/src/api/version/version.req.dto.ts servers/src/api/version/version.service.ts servers/src/api/version/dto/version.dto.ts && git commit -m "feat: register ClickHouse in version fetch API"
```

---

## Task 3（可选）: Admin client 管理后台三处

仓库：`E:\Github\FlyEnv-Admin`。仅影响管理后台"版本管理"页能否手工维护 clickhouse 自定义版本，建议保持一致。

**Files:**
- Modify: `client/src/views/version/manage/index.vue`（`all` 数组，第 18–38 行）
- Modify: `client/src/views/version/manage/list.vue`（props 类型，第 40–61 行）
- Modify: `client/src/api/version.ts`（`AppServiceVersion` 类型，第 4–30 行）

- [ ] **Step 1: 三处联合类型/数组各加 `'clickhouse'`**

`index.vue` 的 `all` 数组 `'mailpit'` 后加 `'clickhouse'`；`list.vue` 与 `api/version.ts` 的联合类型 `| 'mailpit'` 后加 `| 'clickhouse'`。

- [ ] **Step 2: 提交（FlyEnv-Admin 仓库）**

```bash
cd /e/Github/FlyEnv-Admin && git add client/src/views/version/manage/index.vue client/src/views/version/manage/list.vue client/src/api/version.ts && git commit -m "feat: add ClickHouse to version manage UI"
```

---

## Task 4: 桌面端 — 全局注册（枚举 + ServerType + ServerPath）

仓库：`E:\Github\FlyEnv`

**Files:**
- Modify: `src/render/core/type.ts`（`AppModuleEnum`，第 55 行 `postgresql = 'postgresql',` 附近）
- Modify: `src/global.d.ts`（`ServerType` 接口，第 25 行 `PostgreSqlDir?: string` 附近）
- Modify: `src/main/utils/ServerPath.ts`（`SetupGlobalPaths`，`PostgreSqlDir` 赋值行之后）

- [ ] **Step 1: `AppModuleEnum` 加枚举**

`src/render/core/type.ts` 中 `postgresql = 'postgresql',` 之后加：

```ts
  clickhouse = 'clickhouse',
```

（**不**加进 `AppWithRoot`——8123/9000 均非特权端口。）

- [ ] **Step 2: `ServerType` 加字段**

`src/global.d.ts` 的 `ServerType` 接口中 `PostgreSqlDir?: string` 之后加：

```ts
  ClickHouseDir?: string
```

- [ ] **Step 3: `SetupGlobalPaths` 加路径**

`src/main/utils/ServerPath.ts` 中 `global.Server.PostgreSqlDir = join(runpath, 'server/postgresql')` 之后加：

```ts
  global.Server.ClickHouseDir = join(runpath, 'server/clickhouse')
```

（跟随 PostgreSqlDir 先例：**不**加入 `createBaseDirectories` 的 mkdir 列表，fork 模块首次启动时自行 `mkdirp`。）

- [ ] **Step 4: 类型检查**

```bash
cd /e/Github/FlyEnv && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "clickhouse|type.ts|global.d.ts|ServerPath" ; echo "exit=$?"
```

预期：grep 无输出（无涉及本次改动文件的错误）。项目中可能存在的其他历史错误忽略。

- [ ] **Step 5: 提交（FlyEnv 仓库）**

```bash
cd /e/Github/FlyEnv && git add src/render/core/type.ts src/global.d.ts src/main/utils/ServerPath.ts && git commit -m "feat: register clickhouse module type and server path"
```

---

## Task 5: 桌面端 — fork 模块 `ClickHouse/index.ts`

仓库：`E:\Github\FlyEnv`

**Files:**
- Create: `src/fork/module/ClickHouse/index.ts`

背景知识（实现者无需再查）：
- 参考 `src/fork/module/Postgresql/index.ts`（启动/配置）与 `src/fork/module/MeiliSearch/index.ts` 的 `_installSoftHandle`（裸二进制 `copyFile(row.zip, row.bin)` + chmod 模式）
- `serviceStartSpawn`（`src/fork/util/ServiceStart.ts`）：detached spawn 前台进程，2 秒早退检测，自动写 `pidPath`（这里传 `this.appPidFile()`），成功返回 `{ 'APP-Service-Start-PID': pid }`
- `_stopServer` 用 `Base` 默认实现（pid 文件 + 进程名兜底，SIGINT），ClickHouse 收到 SIGINT 优雅退出，无需覆写
- `Base.installSoft` 负责 axios 下载（带进度）到 `row.zip` 后调 `this._installSoftHandle(row)`；macOS 裸二进制只下载不解压，所以覆写 `_installSoftHandle`
- Linux tgz 内布局为 `clickhouse-common-static-{bareVersion}/usr/bin/clickhouse`（bareVersion 不含频道后缀），带 find 兜底

- [ ] **Step 1: 创建 fork 模块**

创建 `src/fork/module/ClickHouse/index.ts`，完整内容：

```ts
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  chmod,
  copyFile,
  execPromise,
  mkdirp,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { unpack } from '../../util/Zip'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { isMacOS } from '@shared/utils'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'clickhouse'
  }

  init() {}

  getConfigFiles(version?: SoftInstalled) {
    const dir = global.Server.ClickHouseDir
    if (!dir) {
      return []
    }
    return [
      { name: 'config', path: join(dir, 'config.xml') },
      { name: 'users', path: join(dir, 'users.xml') }
    ]
  }

  getLogFiles(version?: SoftInstalled) {
    const dir = global.Server.ClickHouseDir
    if (!dir) {
      return []
    }
    const logDir = join(dir, 'log')
    return [
      { name: 'server', path: join(logDir, 'server.log') },
      { name: 'error', path: join(logDir, 'server.err.log') }
    ]
  }

  private configContent(): { config: string; users: string } {
    const baseDir = global.Server.ClickHouseDir!
    const dataDir = join(baseDir, 'data')
    const logDir = join(baseDir, 'log')
    const config = `<clickhouse>
    <logger>
        <level>information</level>
        <log>${join(logDir, 'server.log')}</log>
        <errorlog>${join(logDir, 'server.err.log')}</errorlog>
        <size>10M</size>
        <count>3</count>
    </logger>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <listen_host>127.0.0.1</listen_host>
    <path>${dataDir}/</path>
    <tmp_path>${join(dataDir, 'tmp')}/</tmp_path>
    <user_files_path>${join(dataDir, 'user_files')}/</user_files_path>
    <users_config>${join(baseDir, 'users.xml')}</users_config>
    <default_profile>default</default_profile>
</clickhouse>
`
    const users = `<clickhouse>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
</clickhouse>
`
    return { config, users }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir = global.Server.ClickHouseDir!
      const confFile = join(baseDir, 'config.xml')
      const usersFile = join(baseDir, 'users.xml')
      const logDir = join(baseDir, 'log')

      await mkdirp(baseDir)
      await mkdirp(join(baseDir, 'data'))
      await mkdirp(logDir)

      // 首次启动生成配置；.default 副本供 Conf 编辑器 "load default" 使用
      if (!existsSync(confFile)) {
        const { config, users } = this.configContent()
        await writeFile(confFile, config)
        await writeFile(`${confFile}.default`, config)
        if (!existsSync(usersFile)) {
          await writeFile(usersFile, users)
          await writeFile(`${usersFile}.default`, users)
        }
      }

      const execEnv: Record<string, string> = {
        LC_ALL: global.Server.Local!,
        LANG: global.Server.Local!
      }
      // clickhouse 多调用二进制：server 子命令前台运行，serviceStartSpawn 负责后台化与 pid
      const execArgs = ['server', `--config-file=${confFile}`]

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.appPidFile(),
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          waitTime: 3000,
          outFile: join(logDir, 'server.start.out.log'),
          errFile: join(logDir, 'server.start.err.log')
        })
        const pid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
        })
        resolve({
          'APP-Service-Start-PID': pid
        })
      } catch (e: any) {
        console.log('clickhouse start err: ', e)
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('clickhouse')
        all.forEach((a: any) => {
          a.appDir = join(global.Server.AppDir!, `clickhouse-${a.version}`)
          a.zip = isMacOS()
            ? join(global.Server.Cache!, `clickhouse-${a.version}`)
            : join(global.Server.Cache!, `clickhouse-${a.version}.tgz`)
          a.bin = join(a.appDir, 'clickhouse')
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `ClickHouse-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await mkdirp(dirname(row.bin))
    if (isMacOS()) {
      // macOS 资产是裸二进制：下载产物直接落位
      await copyFile(row.zip, row.bin)
    } else {
      // Linux 资产是 clickhouse-common-static-{bare}-{arch}.tgz
      await unpack(row.zip, row.appDir)
      const bare = `${row.version}`.replace(/-(stable|lts)$/, '')
      let extracted = join(row.appDir, `clickhouse-common-static-${bare}`, 'usr/bin/clickhouse')
      if (!existsSync(extracted)) {
        // 兜底：包内布局变化时在解压目录中定位 clickhouse 可执行文件
        const res = await execPromise(`find "${row.appDir}" -type f -name clickhouse | head -n 1`)
        extracted = res.stdout.trim()
      }
      if (!extracted || !existsSync(extracted)) {
        throw new Error(`clickhouse binary not found in ${row.appDir}`)
      }
      await copyFile(extracted, row.bin)
    }
    await chmod(row.bin, '0755')
    // 验证二进制可执行（失败则 Base.installSoft 走 fail 清理）
    await execPromise(`"${row.bin}" --version`)
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const all = [versionLocalFetch(setup?.clickhouse?.dirs ?? [], 'clickhouse', 'clickhouse')]
      Promise.all(all)
        .then(async (list) => {
          let versions: SoftInstalled[] = list.flat()
          versions = versionFilterSame(versions)
          const tasks = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(tasks).then((binVersions) => ({ versions, binVersions }))
        })
        .then(({ versions, binVersions }: any) => {
          binVersions.forEach((v: any, i: number) => {
            const { error, version } = v
            const num = version ? Number(versionFixed(version).split('.').slice(0, 2).join('')) : null
            Object.assign(versions[i], {
              version: version,
              num,
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['clickhouse']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }
}

export default new Manager()
```

- [ ] **Step 2: 类型检查**

```bash
cd /e/Github/FlyEnv && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "ClickHouse" ; echo "done"
```

预期：grep 无输出。若报 `execPromise`/`unpack` 等导入错误，按报错修正导入来源（`execPromise` 来自 `../../Fn`，`unpack` 来自 `../../util/Zip`）。

- [ ] **Step 3: 提交（FlyEnv 仓库）**

```bash
cd /e/Github/FlyEnv && git add src/fork/module/ClickHouse/index.ts && git commit -m "feat: add ClickHouse fork module"
```

---

## Task 6: 桌面端 — fork 注册（BaseManager + Version + Base dis 表）

仓库：`E:\Github\FlyEnv`

**Files:**
- Modify: `src/fork/BaseManager.ts`（属性声明区 + postgresql 分发分支之后）
- Modify: `src/fork/module/Version/index.ts`（属性声明区 + postgresql 分发分支之后）
- Modify: `src/fork/module/Base/index.ts`（`_stopServer` 内 `dis` 映射，约第 300 行）

- [ ] **Step 1: `BaseManager.ts` 加属性与分支**

类属性声明区（其他 `Xxx: any` 声明旁）加：

```ts
  ClickHouse: any
```

`else if (module === 'postgresql') { ... }` 分支之后插入：

```ts
    } else if (module === 'clickhouse') {
      if (!this.ClickHouse) {
        const res = await import('./module/ClickHouse')
        this.ClickHouse = res.default
      }
      doRun(this.ClickHouse)
    }
```

- [ ] **Step 2: `Version/index.ts` 加属性与分支**

类属性声明区加：

```ts
  ClickHouse: any
```

`allInstalledVersions` 中 `else if (type === 'postgresql') { ... }` 分支之后插入：

```ts
        } else if (type === 'clickhouse') {
          if (!this.ClickHouse) {
            const res = await import('../ClickHouse')
            this.ClickHouse = res.default
          }
          versions.clickhouse = this.ClickHouse.allInstalledVersions(setup)
        }
```

- [ ] **Step 3: `Base/index.ts` 的 `dis` 映射加进程名**

`_stopServer` 内 `dis` 对象中 `postgresql: 'postgres',` 之后加：

```ts
        clickhouse: 'clickhouse',
```

（信号无需改：默认 `-INT`，ClickHouse 可优雅处理 SIGINT。）

- [ ] **Step 4: 类型检查 + 提交**

```bash
cd /e/Github/FlyEnv && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "BaseManager|Version/index|Base/index|ClickHouse" ; echo "done"
git add src/fork/BaseManager.ts src/fork/module/Version/index.ts src/fork/module/Base/index.ts && git commit -m "feat: wire ClickHouse fork module dispatch"
```

预期：grep 无输出；提交成功。

---

## Task 7: 桌面端 — 渲染组件 + 图标

仓库：`E:\Github\FlyEnv`

**Files:**
- Create: `src/render/components/ClickHouse/Module.ts`
- Create: `src/render/components/ClickHouse/Index.vue`
- Create: `src/render/components/ClickHouse/aside.vue`
- Create: `src/render/components/ClickHouse/Config.vue`
- Create: `src/render/components/ClickHouse/Logs.vue`
- Create: `src/render/svg/clickhouse.svg`

背景知识：`src/render/core/App.ts` 用 `import.meta.glob('@/components/*/Module.ts')` 自动收集模块，路由/侧栏分组（`moduleType: 'dataBaseServer'`）/Setup/托盘全自动；`asideIndex: 24`（23 及以下已被占用，aiCoding 类从 100 起，不冲突）。PostgreSql 的 `Index.vue` 里 `AppModuleSetup('nginx')` 是复制粘贴 bug，我们不复制这个错误。

- [ ] **Step 1: 创建 `Module.ts`**

```ts
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataBaseServer',
  typeFlag: 'clickhouse',
  label: 'ClickHouse',
  icon: import('@/svg/clickhouse.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 24,
  isService: true,
  isTray: true,
  platform: ['macOS', 'Linux']
}
export default module
```

- [ ] **Step 2: 创建 `Index.vue`**

```vue
<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="clickhouse" title="ClickHouse"></Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="clickhouse"
        url="https://github.com/ClickHouse/ClickHouse/releases"
        title="ClickHouse"
      ></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3"></Logs>
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

  const { tab, checkVersion } = AppModuleSetup('clickhouse')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()
</script>
```

- [ ] **Step 3: 创建 `aside.vue`**

```vue
<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/clickhouse' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon
          style="padding: 7px"
          :svg="import('@/svg/clickhouse.svg?raw')"
          width="30"
          height="30"
        />
      </div>
      <span class="title">ClickHouse</span>
    </div>

    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled"
      @click.stop="stopNav"
      @change="switchChange"
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
  } = AsideSetup('clickhouse')

  AppServiceModule.clickhouse = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any
</script>
```

- [ ] **Step 4: 创建 `Config.vue`**

```vue
<template>
  <div>
    <el-radio-group v-model="current" class="mb-3 ml-3">
      <el-radio-button value="config.xml">config.xml</el-radio-button>
      <el-radio-button value="users.xml">users.xml</el-radio-button>
    </el-radio-group>
    <Conf
      :key="file"
      ref="conf"
      :type-flag="'clickhouse'"
      :default-file="defaultFile"
      :file="file"
      :file-ext="'xml'"
      :config-language="'xml'"
      :show-commond="false"
    >
    </Conf>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { join } from '@/util/path-browserify'

  const current = ref('config.xml')
  const conf = ref()

  const file = computed(() => {
    return join(window.Server.ClickHouseDir!, current.value)
  })

  const defaultFile = computed(() => {
    return join(window.Server.ClickHouseDir!, `${current.value}.default`)
  })
</script>
```

- [ ] **Step 5: 创建 `Logs.vue`**

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

  const log = ref()
  const filepath = computed(() => {
    return join(window.Server.ClickHouseDir!, 'log/server.log')
  })
</script>
```

- [ ] **Step 6: 创建 `src/render/svg/clickhouse.svg`（官方黄黑 Ч 造型）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="170" y="128" width="300" height="768" fill="#FFCC00"/>
  <rect x="554" y="128" width="300" height="384" fill="#FFCC00"/>
  <rect x="554" y="512" width="300" height="384" fill="#1A1A1A"/>
</svg>
```

- [ ] **Step 7: 类型检查 + 提交**

```bash
cd /e/Github/FlyEnv && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "ClickHouse|clickhouse.svg" ; echo "done"
git add src/render/components/ClickHouse src/render/svg/clickhouse.svg && git commit -m "feat: add ClickHouse render components and icon"
```

预期：grep 无输出；提交成功。

---

## Task 8: 桌面端 — MCP 集成

仓库：`E:\Github\FlyEnv`

**Files:**
- Modify: `src/main/core/mcpToolMetadata.ts`（4 个 flag 数组 + database 描述文案）
- Modify: `src/main/core/MCPTools.ts`（`SINGLE_INSTANCE_SERVICES` 第 14–28 行 + `assertDatabaseFlag` 第 307–315 行）
- Modify: `src/main/core/MCPContextResolver.ts`（`DATABASE_FLAGS` 第 30 行）

- [ ] **Step 1: `mcpToolMetadata.ts` 四处数组加 flag**

`MCP_LIFECYCLE_FLAGS` 中 `'postgresql',` 后加 `'clickhouse',`；`MCP_QUERYABLE_FLAGS` 中 `'caddy',` 后按字母序加 `'clickhouse',`；`MCP_DATABASE_FLAGS` 改为：

```ts
export const MCP_DATABASE_FLAGS = [
  'mysql',
  'mariadb',
  'postgresql',
  'clickhouse',
  'redis',
  'mongodb',
  'memcached'
] as const
```

`MCP_INSTALLABLE_FLAGS` 中 `'caddy',` 后按字母序加 `'clickhouse',`。

`MCP_FLAG_DESCRIPTIONS.database` 文案改为：

```ts
  database:
    'Database/cache module flag. Allowed values: mysql, mariadb, postgresql, clickhouse, redis, mongodb, memcached.',
```

- [ ] **Step 2: `MCPTools.ts` 两处**

`SINGLE_INSTANCE_SERVICES` 的 Set 中 `'postgresql',` 后加 `'clickhouse',`。

`assertDatabaseFlag` 的报错文案改为：

```ts
    throw new Error(
      `${flag} is not a database/cache module for this MCP tool. ` +
        'Use one of: mysql, mariadb, postgresql, clickhouse, redis, mongodb, memcached.'
    )
```

- [ ] **Step 3: `MCPContextResolver.ts` 一处**

```ts
const DATABASE_FLAGS = new Set(['mysql', 'mariadb', 'postgresql', 'clickhouse', 'redis', 'mongodb', 'memcached'])
```

- [ ] **Step 4: 类型检查 + 跑 MCP 相关已有测试 + 提交**

```bash
cd /e/Github/FlyEnv && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "MCP" ; echo "tsc done"
yarn test:mcp-lazy-runtime
git add src/main/core/mcpToolMetadata.ts src/main/core/MCPTools.ts src/main/core/MCPContextResolver.ts && git commit -m "feat: integrate ClickHouse into MCP database flags"
```

预期：grep 无输出；`test:mcp-lazy-runtime` 通过（该测试是项目已有的 MCP 懒加载回归测试）。

---

## Task 9: 端到端验证

仓库：`E:\Github\FlyEnv`（前置：FlyEnv-Admin 的 Task 1–2 已部署到 api.one-env.com；未部署则在线版本列表为空，只能验证 brew 源与本地逻辑）

- [ ] **Step 1: 启动开发实例**

```bash
cd /e/Github/FlyEnv && yarn dev
```

- [ ] **Step 2: 模块可见性检查**

- macOS/Linux：左侧栏"数据库"分组出现 ClickHouse（黄黑图标），Setup → 模块显隐中也有 ClickHouse
- Windows：侧栏与 Setup 中**不出现** ClickHouse（`platform` 字段生效）

- [ ] **Step 3: 安装 + 启停验证（macOS/Linux）**

1. 版本管理页在线安装任一版本（macOS 走裸二进制流程，Linux 走 tgz 解压流程），安装后状态为"已安装"
2. 启动服务 → 状态变绿
3. 终端验证：

```bash
curl http://127.0.0.1:8123/ping
curl "http://127.0.0.1:8123/?query=SELECT%20version()"
```

预期：`ping` 返回 `Ok.`；查询返回所装版本号。

4. 停止服务 → 状态变灰，`curl http://127.0.0.1:8123/ping` 连接拒绝

- [ ] **Step 4: 配置/日志/托盘检查**

- 配置 tab：能切换并打开 `config.xml` / `users.xml`，"load default" 可用，保存后重启服务生效（如把 8123 改为 18123 验证）
- 日志 tab：能看到 `server.log` 内容
- 托盘窗口：ClickHouse 条目出现且运行状态正确

- [ ] **Step 5: MCP 检查（可选）**

用任意 MCP 客户端调 `getDatabaseConnectionInfo(flag='clickhouse')`，预期返回端口 8123/9000、配置文件与日志路径。

---

## 部署提醒（不属于代码任务）

1. FlyEnv-Admin 的 Task 1–3 合并后需部署到 `api.one-env.com`，桌面端才能看到在线版本（Redis 缓存 6h，可用 `nocache: 'xpf0000'` 刷新验证）。
2. 建议尽快吊销轮换 `servers/src/api/version/request.ts` 中已公开的 GitHub token（与本需求无关，顺带发现）。
