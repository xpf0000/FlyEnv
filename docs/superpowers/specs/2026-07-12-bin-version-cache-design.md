# Bin Version Cache Design

## Goal

为已安装版本扫描增加主进程共享的持久化 bin 版本缓存，避免多个 Fork 在每次刷新和应用重启后重复执行大量版本命令，从而降低瞬时 CPU 和内存占用。

缓存只优化“已经找到具体 bin 后获取版本信息”的阶段。安装目录扫描、`which`/`where`、自定义目录搜索以及新增或删除版本检测继续实时执行。

## Confirmed Constraints

- 主进程只负责缓存查询、内存更新和持久化，不执行任何版本命令。
- 缓存未命中时，版本命令仍在原 Fork 中执行。
- 不增加跨 Fork 全局版本命令并发限制。
- 不增加同 bin singleflight；现有已安装版本流程会先按 bin 去重，极少数跨入口重复 miss 接受 last-write-wins。
- 尽可能覆盖所有能可靠绑定到具体 bin 文件的已安装版本探测。
- 只缓存成功且有效的结果，失败和空版本不缓存。
- 使用独立的 `electron-store` 文件，并使用默认 userData 路径。
- 内存更新后使用 trailing debounce 2 秒持久化。
- 缓存故障不得改变原有版本探测结果或错误语义。

## Architecture

### Components

#### Shared IPC Types

`src/shared/BinVersionCache.ts` 定义：

- bin fingerprint、持久化 entry 和 IPC 消息类型；
- get、get-response 和 set 消息；
- 消息类型守卫。

#### Main Store

`src/main/core/BinVersionCacheStore.ts` 负责：

- 从独立 `electron-store` 读取缓存文件；
- 将 entries 加载到内存 Map；
- 根据 fingerprint 执行 get/set；
- trailing debounce 2 秒保存完整内存快照；
- 应用退出前 flush 尚未落盘的变更；
- 将读取、解析和保存错误降级为缓存不可用。

#### Main Bridge

`src/main/core/BinVersionCacheBridge.ts` 负责处理 UtilityProcess 发来的缓存消息：

- get 请求查询共享 Store，并把响应发送回原 UtilityProcess；
- set 消息更新共享 Store；
- 非缓存消息返回未处理，由现有 Fork 消息流程继续处理。

所有 `ForkItem` 共享同一个 Store 和 Bridge。

#### Fork Client

`src/fork/BinVersionCacheClient.ts` 负责：

- 为 get 请求生成 requestId；
- 管理 pending Promise 和 2 秒安全超时；
- 匹配主进程 get-response；
- 发送 fire-and-forget set 消息；
- IPC 失败时让调用方降级执行原版本探测。

#### Fork Wrapper

`src/fork/util/BinVersionCache.ts` 提供：

```ts
async function withBinVersionCache<T>(
  bin: string,
  loader: () => Promise<T>,
  isValid: (value: unknown) => value is T
): Promise<T>
```

该包装器负责：

- 对 bin 执行 `realpath` 和 `stat`；
- 生成 fingerprint；
- 查询主进程缓存；
- 校验缓存 value；
- miss 时执行 loader；
- 只把有效结果发送给主进程。

### Data Flow

```text
已安装版本模块
  -> withBinVersionCache(bin, loader, isValid)
  -> Fork: realpath + stat
  -> Main: get(path, mtimeMs, size)
     -> hit: Fork 校验 value 后直接返回
     -> miss / timeout / IPC error:
        -> Fork 执行原版本命令或文件读取
        -> Fork 使用原有解析逻辑生成结果
        -> 有效结果通过 set 回传主进程
        -> Main 更新内存 Map
        -> debounce 2 秒写入 electron-store
```

## Cache Identity and File Format

### Fingerprint

```ts
type BinVersionFingerprint = {
  path: string
  mtimeMs: number
  size: number
}
```

规则：

- `path` 使用 `realpath(bin)`；
- Windows 将分隔符统一为 `/` 并转为小写；
- macOS 和 Linux 保留大小写；
- `mtimeMs` 使用 `stat.mtimeMs`；
- `size` 使用 `stat.size`。

不使用：

- `atimeMs`，因为读取或执行可能改变它；
- `ctimeMs`，因为 chmod/chown 等元数据变化可能导致无意义失效；
- `birthtimeMs`，因为原地覆盖文件时可能不变。

路径作为 Map key。命中条件为缓存 entry 的 `mtimeMs` 和 `size` 同时与当前 fingerprint 相同。

### Persisted Structure

```ts
type BinVersionCacheEntry = {
  mtimeMs: number
  size: number
  value: unknown
}

type BinVersionCacheFile = {
  schemaVersion: 1
  entries: Record<string, BinVersionCacheEntry>
}
```

示例：

```json
{
  "schemaVersion": 1,
  "entries": {
    "/opt/homebrew/Cellar/nginx/1.27.4/bin/nginx": {
      "mtimeMs": 1750000000123.5,
      "size": 1283912,
      "value": {
        "version": "1.27.4"
      }
    }
  }
}
```

不使用 probeId。同一个具体 bin 在已安装版本流程中对应一份最终版本信息；多命令 fallback 作为一个完整 loader 执行并缓存最终解析结果。未来缓存格式或结果语义发生不兼容变化时增加全局 `schemaVersion`。

不在启动时遍历或 stat 缓存中的 bin，不设置记录数量上限，也不主动清理已经删除但不再查询的路径。同一路径的新 set 会直接覆盖旧 entry。

## Persistence

使用默认路径的独立 `electron-store`：

```ts
new Store<BinVersionCacheFile>({
  name: 'bin-version-cache',
  clearInvalidConfig: true,
  defaults: {
    schemaVersion: 1,
    entries: {}
  }
})
```

文件由 Electron 放置在应用默认 userData 目录，通常名为 `bin-version-cache.json`。

启动时读取 `store.store`，验证 `schemaVersion` 和 entries 后构造内存 Map。后续 get 只读取内存，不重复读取文件。

set 更新内存后触发 trailing debounce 2 秒。定时器触发时将当前完整 Map 转为普通对象并一次性写入 `store.store`。正常退出前调用 `flush()`，立即保存尚未落盘的变更。

electron-store 初始化、读取、解析或保存失败时记录不包含路径和 value 的 debug 事件，并按空缓存或仅内存缓存继续运行。

## IPC Protocol

### Get

```ts
type BinVersionCacheGet = {
  type: 'bin-version-cache-get'
  requestId: string
  fingerprint: BinVersionFingerprint
}
```

### Get Response

```ts
type BinVersionCacheGetResponse = {
  type: 'bin-version-cache-get-response'
  requestId: string
  hit: boolean
  value?: unknown
}
```

### Set

```ts
type BinVersionCacheSet = {
  type: 'bin-version-cache-set'
  fingerprint: BinVersionFingerprint
  value: unknown
}
```

get 使用 2 秒安全超时。超时或任何通信错误都视为 miss，Fork 继续执行 loader。set 不等待 ack；缓存写入失败不影响本次版本结果。

主进程 Bridge 验证消息字段类型，包括非空 path、有限的 `mtimeMs`、非负有限的 `size` 以及可序列化 value。无效消息被忽略并记录安全日志。

## Cache Wrapper Semantics

```ts
const fingerprint = await getBinFingerprint(bin).catch(() => undefined)
if (!fingerprint) return loader()

const cached = await provider.get(fingerprint).catch(() => undefined)
if (cached?.hit && isValid(cached.value)) {
  return cached.value
}

const value = await loader()
if (isValid(value)) {
  provider.set(fingerprint, value)
}
return value
```

`isValid` 同时用于缓存命中和新结果：

- 防止损坏或旧结构 value 进入业务；
- 公共版本函数要求 `version` 为非空字符串；
- 自定义探测根据自身结果结构检查 version 及附加字段；
- 无效结果保持原调用方可见，但不缓存。

## Coverage

### Automatic Coverage

在以下公共异步函数内部接入包装器：

- `versionBinVersion()`；
- `versionBinVersionOutput()`。

这会覆盖大部分通过具体 bin 获取已安装版本的模块，包括 Apache、Nginx、PHP、MySQL、MariaDB、Redis、Node、Python、Java、Go、Rust、MongoDB 和 PostgreSQL 等。

### Custom Coverage

对绕过公共函数的 `allInstalledVersions()` 探测逐项接入，在整个探测函数外层包装完整 loader：

- RoadRunner 的多命令 fallback；
- SwooleCli 的 `{ version, php }`；
- FrankenPHP 的 `{ version, php, caddy }`；
- Ollama 的自定义解析；
- Composer 的文件内容解析；
- PureFtpd 的文件内容解析；
- 其他能绑定到具体 bin 文件的自定义已安装版本探测。

文件读取型探测也使用目标文件的 `realpath + mtimeMs + size`。

### Explicitly Out of Scope

- Caddy、Consul 的 `versionBinVersionSync()`，因为它们用于 MacPorts `portinfo()` 校验，不属于已安装版本扫描；
- 服务启动后的版本验证；
- 安装完成后的即时验证命令；
- 工具页主动版本检查；
- 没有可解析具体文件路径的 shell alias 或纯环境命令；
- 版本由多个文件决定且无法提供可靠代表文件的探测；
- 直接返回空数组的 `allInstalledVersions()`。

目录发现阶段始终实时执行，以保证新增、删除或移动版本能够立即反映。

## Failure and Consistency Rules

- fingerprint 获取失败时直接执行 loader；
- cache get 失败、超时或返回异常结构时直接执行 loader；
- 缓存 value 未通过 `isValid` 时视为 miss；
- loader 抛错时保持原错误行为，不 set；
- loader 返回无效或空版本时不 set；
- set 和持久化失败不改变 loader 的返回结果；
- 相同路径的并发 set 使用 last-write-wins；
- bin 在 stat 与执行之间变化时，下一次 fingerprint 不同会再次 miss，不需要命令执行后重复 stat；
- 使用工具保留 mtime 且新文件大小相同属于 fingerprint 的已知边界，本设计不计算文件内容 hash，以避免重新引入高 I/O 成本。

## Observability

建议事件：

- `load-success`；
- `load-error`；
- `hit`；
- `miss`；
- `set`；
- `save-success`；
- `save-error`；
- `get-timeout`。

日志只记录事件类型、耗时和条目数量，不记录完整 bin 路径、命令、stdout、stderr 或缓存 value。

## Testing

### Store Tests

- 相同 path、mtimeMs、size 命中；
- mtimeMs 或 size 改变时 miss；
- set 覆盖同路径旧 entry；
- schema 不匹配或损坏数据按空缓存处理；
- 多次 set 在 2 秒内只保存一次；
- `flush()` 立即保存最新快照；
- 保存失败不清空内存缓存。

为便于单元测试，Store 的核心逻辑应允许注入持久化适配器、时钟和定时器；生产适配器使用 electron-store。

### Client and Bridge Tests

- get hit 和 miss 响应；
- response 按 requestId 匹配；
- 未知消息不被 Bridge 消费；
- get 超时后清理 pending；
- set 不等待响应；
- IPC 失败时 wrapper 执行 loader。

### Wrapper Tests

- hit 时不执行 loader；
- miss 时执行 loader 并 set 有效结果；
- 无效结果、异常结果不 set；
- fingerprint 失败时直接执行 loader；
- 缓存 value 校验失败时重新执行 loader。

### Coverage Regression Tests

- 公共 `versionBinVersion()` 和 `versionBinVersionOutput()` 接入缓存；
- RoadRunner、SwooleCli、FrankenPHP、Ollama 等自定义入口接入包装器；
- Caddy、Consul 的 `portinfo()` 同步逻辑保持不变；
- 目录搜索、which/where 和安装检测保持实时。

### Final Verification

```bash
yarn test:bin-version-cache
yarn test:stop-process-list-cache
yarn test:startup-groups
yarn test:helper:contract
npx vue-tsc --noEmit
```

对所有修改文件执行 ESLint、Prettier，以及 Main/Fork esbuild 打包验证。

### Manual Verification

1. 清空缓存后刷新全部已安装版本，确认执行原版本命令并得到正确结果。
2. 等待 2 秒，确认默认 userData 中生成 `bin-version-cache.json`。
3. 再次刷新，确认相同 bin 不再执行版本命令。
4. 重启 FlyEnv 后刷新，确认持久化缓存继续命中。
5. touch 或替换一个 bin，确认只重新探测该 bin。
6. 安装或删除版本，确认实时目录扫描立即更新结果。

## Success Criteria

- 热缓存和应用重启后的已安装版本扫描不再重复执行未变化 bin 的版本命令；
- bin 的 mtimeMs 或 size 变化后能够重新探测；
- 新增和删除版本仍由实时目录扫描发现；
- 主进程不执行版本命令；
- 缓存读取、IPC 或持久化故障不会破坏原有版本获取；
- 所有可可靠绑定具体 bin 的已安装版本探测均通过公共包装器接入。
