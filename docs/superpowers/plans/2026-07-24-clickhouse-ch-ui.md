# ClickHouse CH-UI 管理入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在运行中的 ClickHouse 服务页提供按需下载、启动并打开 CH-UI 的网络图标入口。

**Architecture:** 将可确定性逻辑放入 `ClickHouse/chUI.ts`，供 fork 启动路径和无框架回归脚本直接调用。`ClickHouse/index.ts` 仅管理文件、下载与进程；`ClickHouse/Index.vue` 沿用 Mailpit 的服务工具插槽并负责浏览器打开和错误展示。

**Tech Stack:** Electron、Vue 3、TypeScript、ForkPromise、GitHub Releases、Node child process。

---

### Task 1: CH-UI 配置纯函数与回归测试

**Files:**
- Create: `src/fork/module/ClickHouse/chUI.ts`
- Create: `scripts/clickhouse-ch-ui-test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写入失败测试，描述四个平台资产、latest URL、受控 SQLite 配置和 XML 端口回退。**

```ts
assert.equal(chUIAssetName('darwin', 'arm64'), 'ch-ui-darwin-arm64')
assert.equal(chUIAssetName('linux', 'x64'), 'ch-ui-linux-amd64')
assert.equal(
  chUIReleaseURL('darwin', 'arm64'),
  'https://github.com/caioricciuti/ch-ui/releases/latest/download/ch-ui-darwin-arm64'
)
assert.equal(clickHouseHttpPort('<clickhouse><http_port>18123</http_port></clickhouse>'), 18123)
assert.equal(clickHouseHttpPort('<clickhouse><http_port>invalid</http_port></clickhouse>'), 8123)
assert.match(chUIConfigContent('/tmp/ch-ui/data/ch-ui.db', 'http://127.0.0.1:18123'), /database_path: .*ch-ui\.db/)
```

- [ ] **Step 2: 运行测试，确认因 `chUI.ts` 尚不存在而失败。**

Run: `yarn test:clickhouse-ch-ui`

Expected: 模块解析失败，明确指出 `src/fork/module/ClickHouse/chUI.ts` 缺失。

- [ ] **Step 3: 实现最小纯函数。**

```ts
export const CH_UI_PORT = 3488
export function chUIAssetName(platform: NodeJS.Platform, arch: string) {
  const os = platform === 'darwin' ? 'darwin' : 'linux'
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64'
  return `ch-ui-${os}-${cpu}`
}
export function chUIReleaseURL(platform: NodeJS.Platform, arch: string) {
  return `https://github.com/caioricciuti/ch-ui/releases/latest/download/${chUIAssetName(platform, arch)}`
}
export function clickHouseHttpPort(xml: string) {
  const match = xml.match(/<http_port>\s*(\d+)\s*<\/http_port>/)
  const port = Number(match?.[1])
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8123
}
```

- [ ] **Step 4: 再次运行测试。**

Run: `yarn test:clickhouse-ch-ui`

Expected: `clickhouse CH-UI regression tests passed`。

### Task 2: ClickHouse fork 的下载和 CH-UI 启动路径

**Files:**
- Modify: `src/fork/module/ClickHouse/index.ts`
- Modify: `scripts/clickhouse-ch-ui-test.ts`

- [ ] **Step 1: 扩展失败测试，要求 fork 源码暴露 `openCHUI()`，使用 `downloadFile`、`serviceStartSpawn`、`chUIReleaseURL`，并把配置/日志/pid 放入 `ClickHouseDir/ch-ui`。**

```ts
assert.match(forkSource, /openCHUI\(\): ForkPromise/)
assert.match(forkSource, /await downloadFile\(chUIReleaseURL\(/)
assert.match(forkSource, /serviceStartSpawn\(/)
assert.match(forkSource, /join\(this\.chUIDir\(\), 'server\.yaml'\)/)
assert.match(forkSource, /join\(this\.chUIDir\(\), 'ch-ui\.pid'\)/)
```

- [ ] **Step 2: 运行测试，确认新 fork 契约尚未满足。**

Run: `yarn test:clickhouse-ch-ui`

Expected: source assertion failure for `openCHUI`。

- [ ] **Step 3: 实现下载与启动。**

```ts
openCHUI(): ForkPromise<{ url: string }> {
  return new ForkPromise(async (resolve, reject, on) => {
    const bin = await this.ensureCHUI(on)
    const configPath = await this.initCHUIConfig()
    if (!(await this.isCHUIRunning(bin))) {
      await serviceStartSpawn({
        version: {
          typeFlag: 'clickhouse',
          version: 'ch-ui',
          bin,
          path: dirname(bin),
          num: null,
          enable: true,
          run: false,
          running: false
        },
        pidPath: this.chUIPidPath(),
        baseDir: this.chUIDir(),
        bin,
        execArgs: ['server', '--config', configPath, '--port', `${CH_UI_PORT}`, '--clickhouse-url', await this.clickHouseURL()],
        on
      })
    }
    resolve({ url: `http://127.0.0.1:${CH_UI_PORT}` })
  })
}
```

- [ ] **Step 4: 运行回归脚本与目标 lint。**

Run: `yarn test:clickhouse-ch-ui && yarn -s eslint src/fork/module/ClickHouse/index.ts src/fork/module/ClickHouse/chUI.ts scripts/clickhouse-ch-ui-test.ts`

Expected: 测试成功，ESLint 无输出。

### Task 3: 服务页网络入口

**Files:**
- Modify: `src/render/components/ClickHouse/Index.vue`
- Modify: `scripts/clickhouse-ch-ui-test.ts`

- [ ] **Step 1: 扩展失败测试，要求运行状态门控的 `tool-left` 插槽、加载状态、fork 调用和 `shell.openExternal(res.data.url)`。**

```ts
assert.match(pageSource, /<template v-if="isRunning" #tool-left>/)
assert.match(pageSource, /:loading="chUIOpening"/)
assert.match(pageSource, /IPC\.send\('app-fork:clickhouse', 'openCHUI'\)/)
assert.match(pageSource, /shell\.openExternal\(res\.data\.url\)/)
```

- [ ] **Step 2: 运行测试，确认服务页尚未实现管理入口。**

Run: `yarn test:clickhouse-ch-ui`

Expected: source assertion failure for `tool-left`。

- [ ] **Step 3: 按 Mailpit 模式实现图标和点击处理。**

```vue
<template v-if="isRunning" #tool-left>
  <el-button :loading="chUIOpening" link @click.stop="openCHUI">
    <yb-icon :svg="import('@/svg/http.svg?raw')" />
  </el-button>
</template>
```

```ts
const openCHUI = () => {
  if (chUIOpening.value) return
  chUIOpening.value = true
  IPC.send('app-fork:clickhouse', 'openCHUI').then((key, res) => {
    IPC.off(key)
    chUIOpening.value = false
    if (res?.code === 0 && res.data?.url) shell.openExternal(res.data.url).catch()
    else MessageError(res?.msg ?? 'CH-UI failed to start')
  })
}
```

- [ ] **Step 4: 运行 UI 回归脚本。**

Run: `yarn test:clickhouse-ch-ui`

Expected: `clickhouse CH-UI regression tests passed`。

### Task 4: 完整验证与提交

**Files:**
- Modify: `docs/superpowers/specs/2026-07-24-clickhouse-ch-ui-design.md`
- Create: `docs/superpowers/plans/2026-07-24-clickhouse-ch-ui.md`

- [ ] **Step 1: 运行所有针对性检查。**

Run: `yarn test:clickhouse-config-page && yarn test:clickhouse-ch-ui && yarn -s eslint src/fork/module/ClickHouse/index.ts src/fork/module/ClickHouse/chUI.ts src/render/components/ClickHouse/Index.vue scripts/clickhouse-ch-ui-test.ts && npx vue-tsc --noEmit -p tsconfig.json && git diff --check`

Expected: 所有命令以 0 退出；测试脚本输出对应通过消息。

- [ ] **Step 2: 使用真实 CH-UI 官方二进制做手动冒烟验证。**

Run: 在空闲端口启动 CH-UI，传入临时 `server.yaml` 和本机 ClickHouse URL；检查 `GET /health` 返回成功，随后终止临时进程。

Expected: CH-UI 进程可执行、监听服务健康、临时进程被清理。

- [ ] **Step 3: 仅暂存本功能文件并提交。**

```bash
git add docs/superpowers/specs/2026-07-24-clickhouse-ch-ui-design.md \
  docs/superpowers/plans/2026-07-24-clickhouse-ch-ui.md \
  scripts/clickhouse-ch-ui-test.ts \
  src/fork/module/ClickHouse/chUI.ts \
  src/fork/module/ClickHouse/index.ts \
  src/render/components/ClickHouse/Index.vue
git commit -m "feat: add ClickHouse CH-UI launcher"
```

Expected: 一个只包含 CH-UI 集成的提交。
