# 版本管理安装状态修复

## 根因与计划

服务列表 `Module.applyInstalledVersions()` 调用共享 `syncStaticInstalledFlags()`，按 bin 或版本号匹配；不同 Java 发行版、外部安装、同版本不同目录都会被误认作在线包已安装。版本管理 `fetchVerion()` 与 fork 则检查包自己的 bin，导致状态随刷新入口变化。这是所有使用静态版本管理模块的共性问题。

统一以在线包自己的 bin 是否存在判断，服务扫描结果不再用于推断另一个安装目录。保留无法执行但文件仍存在的安装包状态，以及符号链接路径；缺少 bin 视为未安装，单项查询失败保留原状态并记录，不能影响其他行或否定已完成的服务列表刷新。

Java 另有独立问题：Linux 使用了 macOS 的 `Contents/Home/bin/java`。改为 Linux `bin/java`，保持 macOS/Windows 路径；Java 在线缓存换代，避免旧 bin 路径持续一小时。

## 所有权与操作契约

- 复用现有 Module 实例管理已安装列表及静态列表，不增加状态、Pinia、持久化或生命周期工作流，无新模块规则例外。
- 服务刷新仍由 `Module.fetchInstalled()` 发起、合并重复请求、处理已有 IPC 终态及超时；本次只调整列表应用时的附加状态校验，Promise 完成后继续原收尾。
- 在线获取仍由 `Module.fetchStatic()` / `fetchVerion()` 管理；进度、安装/卸载及父子服务关系不变。
- 安装文件检查为逐项独立、只读附加步骤；一行失败仅记录自己的错误，已完成的服务扫描结果保留，不重试、不提权、不触发安装或删除。

## 实施与验证

- [x] 扩展共享回归：Java 同版本不同发行版、外部安装、Bun 同版本异目录、符号链接、移除、缺失 bin 和单项查询失败；旧实现已复现同版本异目录被标记为 true。
- [x] 共享校验改用实际文件检查，并在服务刷新、在线缓存命中时复用。
- [x] 三平台 Java fork 回归覆盖在线路径、实际 installed 状态及旧缓存失效，修复 Linux 路径；旧实现已复现 Linux 路径断言失败。
- [x] 运行定向回归及改动文件 lint，复核错误边界；留在当前工作区供用户审阅，不提交其他任务的 Apache 改动。

验证命令：

```sh
node_modules/.bin/tsx scripts/version-manager-static-installed-sync-test.ts
node_modules/.bin/tsx scripts/java-online-installed-status-test.ts
node_modules/.bin/tsx scripts/version-manager-online-cache-test.ts
```

以上三个脚本、改动文件 ESLint、`git diff --check` 均通过。`tsc --noEmit --pretty false` 有 38 条诊断，本轮改动文件无诊断；本轮未对比基线。未进行桌面界面实测或完整发行包构建，三平台路径通过模拟平台分支及临时文件夹验证。

独立代码复核无确认的阻断项；未覆盖真实 IPC 延迟、查询无响应以及安装/卸载与刷新并发的桌面验收。
