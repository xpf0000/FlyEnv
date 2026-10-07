# 设置布局与 llama.cpp 修复

## 范围与实施计划

- 将设置下方布局拆成 macOS、Linux、Windows 三个文件；语言、主题、代理和现有配置监听留在 Common.vue。各端显式配对启动隐藏和托盘样式，单项保留半宽空列；macOS 镜像两列顶部对齐并允许收缩，空终端隐藏。
- 模型大小仍使用实际字节转换后的 GiB；统一以显存、内存可用路径中较宽裕的阈值评级，避免越过显存容量后颜色由黄变绿。覆盖 800MiB/1.3GiB 与容量边界。
- llama.cpp 安装依赖的解压入口按宿主平台选择已有 zipUnpack（Windows）或 unpack（Unix）。覆盖真实 Windows ZIP 解压、安装成功及损坏 ZIP 失败，不改共享解压工具或新增提权/重试。

## 操作契约与失败边界

安装操作继续由插件内 LlamaCppController 单例持有，跨页面生命周期不变；installRuntimeVariant 的 fork 模块持有 runtimeMutationInProgress，重复安装及与服务启动并发仍拒绝。下载进度是中间事件，ForkPromise resolve/reject 是终态；替换活动版本之前继续走既有停服务流程。解压是校验、探测、激活的必要依赖，失败必须向原终态传播并清理 staging，不能激活半成品；已激活后的备份/暂存清理仍为附加动作，保持成功结果。主包和 CUDA 配套包复用同一个平台解压入口。

无新增状态、共享配置、Pinia、服务启停流程或公共模块专用属性，也没有约束例外。设置使用既有 AppStore，终端仍归 MacPorts 控制器。验证复用既有插件安装失败/回滚、重复调用、进度/终态、页面重新绑定测试，并检查三端 SFC 编译与变更文件 lint。

## 验证结果

- `scripts/model-size-color-test.ts`：修复前 800MiB 误判为 warning，修复后大小边界及不同显存下的颜色单调性均通过；共享评级同时适用于 Ollama。
- `scripts/llamacpp-windows-extract-test.ts`：修复前真实 ZIP 安装复现 unzip + /dev/null 错误；修复后 Windows 主包和 CUDA 配套包真实解压、可执行文件探测、激活、损坏包拒绝及保留旧版本/清理 staging 均通过。仅替代联网下载，解压与磁盘操作使用生产实现。
- 五个相关 Vue SFC 编译、renderer-operation-boundaries、llamacpp-fork-affinity、变更文件 ESLint 均通过；runtime.ts 原有 Prettier 格式问题保留，针对该文件关闭格式规则后的代码 lint 通过。
- llama.cpp 插件 production 构建通过，输出 `dist/plugins/llamacpp/llama-cpp`；未修改 registry、发布或提交。
- `test:llamacpp-plugin` 的 `testRuntimeInstallSuccessPairsCudaRuntime` 在 Windows 因 POSIX 路径夹具失败；使用 HEAD 原始 runtime.ts 单独重跑复现同一失败。全量 vue-tsc 报告 65 项变更文件之外的诊断，本次变更文件无诊断。
- macOS/Linux 桌面布局尚未实机验收。按失败边界复查，平台解压失败仍传播为安装失败，不新增重试、权限请求或服务生命周期分支。
