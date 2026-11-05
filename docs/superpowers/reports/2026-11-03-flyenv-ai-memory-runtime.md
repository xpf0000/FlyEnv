# AI Memory 原生运行时验证

日期：2026-11-03。只使用临时目录；尚未接入正式插件数据。

## 选型与实现

使用固定版本 fs-native-extensions 1.5.3 的 tryLock/unlock，锁对象为数据根下固定 .flyenv-owner.lock。独立文件描述符持有排他锁，不删除锁文件，不使用 PID/心跳超时接管；正常释放关闭句柄，崩溃由内核释放。上游为 Apache-2.0，包包含原生预构建产物；当前实测 macOS arm64 的 Electron utilityProcess 可加载。

依据：[上游 API 与源码](https://github.com/holepunchto/fs-native-extensions)。其他平台存在预构建文件不代表 FlyEnv 已完成验收。

AtomicFile 先写同目录临时文件、文件 sync/关闭、rename，再同步目录；替换前失败保留旧版，替换后同步失败返回 unknown。Windows 目录同步路径尚待原生验收，不用 macOS 结果代替。

## 实测结果

- Node 测试：5 个原子替换/故障案例通过；独立描述符及 realpath 别名争锁通过。
- Electron 39.8.10 / 内置 Node 22.22.1 / darwin arm64：争锁拒绝、worker 被杀后释放、正常退出、文件原子替换及目录 sync 通过。
- 在 write、sync、rename 后 SIGKILL：磁盘保持完整旧版或完整新版，没有半条 JSON。
- 最小 app.asar + native .node 解包布局下重复上述 Electron 验证通过。现有 esbuild packages:external 和 electron-builder **/*.node 解包策略可复用，无须另加 esbuild 特例。
- 本机 Electron 宿主 SIGKILL 后 utility worker 随之退出，因此没有观察到存活的 Electron 遗留 worker；额外真实 Node 孤儿进程测试验证：父进程死亡、持锁子进程仍活着时拒绝新所有者，子进程退出后方可接管。
- Windows、Linux、其他架构：未验收。未做硬件断电测试；不能宣称任意断电绝不丢失。

重跑：`yarn tsx --test plugins/ai-memory/tests/atomic-file.test.ts test/data-root-lease.test.ts test/data-root-owner-crash.test.ts`，`yarn tsx scripts/plugin-memory-runtime-probe.ts`。原生脚本有超时，并只清理自己创建的进程/临时数据。

完整 JSON 结果：

```json
{
  "passed": true,
  "platform": "darwin",
  "arch": "arm64",
  "versions": {
    "acquired": true,
    "pid": 69073,
    "node": "22.22.1",
    "electron": "39.8.10"
  },
  "checks": [
    "contending utilityProcess rejected",
    "kernel lease released after killed worker exit",
    "atomic replacement and directory sync in utilityProcess",
    "graceful close exit",
    "SIGKILL at write/sync/rename leaves complete old/new record"
  ],
  "hostCrash": {
    "survivingWorkerBlockedReplacement": false,
    "workerPid": 69094
  },
  "packagedAsar": true
}
```

## 阶段 B：通用宿主闭环

2026-11-03，在同一 macOS ARM64 / Electron 39.8.10 环境运行 `yarn tsx scripts/plugin-mcp-runtime-smoke.ts`，使用临时 `FLYENV_DATA_ROOT`、Electron `userData`、本机样例包下载地址及临时 MCP token；未访问正式插件目录、记忆库或客户端配置。测试结束删除临时数据。

通过的真实进程检查：

- API 2 样例经生产 PluginManager 安装，HTTP 未启动时经 IPC 列出工具；初始工具均关闭。
- 打包后的 Vue 样例页面实际挂载、按钮通过 IPCHandler 调用 ForkManager，与 HTTP MCP 请求交替读写同一计数器；返回 PID 一致。
- 有延迟写入时禁用会等待该写入终态和实际 worker exit；禁用后 HTTP 拒绝调用。
- 原生审批边界中禁用插件，随后批准仍拒绝旧请求。
- 升级到第二个包后使用新安装代次及新代码，计数器数据保留；卸载移除工具但保留数据目录。

相关自动测试 49 项通过，另有既有 MCP 工具元数据及 HTTP stop 回归通过。诊断测试覆盖成功、失败、异常、取消、未知、停用、伪 ID、嵌套内容、原生错误 report，确认声明路径不写 `audit.log`/`fork.error.txt`，易失白名单记录第 201 条淘汰最旧一条。异步初始化后的真实派发边界再次检查工具开关，诊断失败不改变主操作结果。

这是生产宿主组件在独立最小 Electron 容器中的集成验证；不等同于完整 FlyEnv 应用 UI、Windows/Linux 或正式记忆插件验收。原生锁/ASAR 探针在 Task 4 重跑通过。

## 正式插件与完整页面

阶段 D 已增加生产 AI Memory 插件的 HTTP/renderer IPC 双向读写、真实宿主退出后同数据根恢复，以及完整 Application 的分页/保存后页面重入和深浅色/中文页面冒烟。详见[最终验收](2026-11-03-flyenv-ai-memory-acceptance.md)。原生平台支持范围仍为 macOS ARM64；未因 TypeScript 测试通过扩大平台声明。
