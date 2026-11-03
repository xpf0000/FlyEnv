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
