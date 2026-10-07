# Linux llama.cpp b10549 安装失败

## 根因与原生复现

用户指定包：
https://github.com/ggml-org/llama.cpp/releases/download/b10549/llama-b10549-bin-ubuntu-arm64.tar.gz

下载完整官方包，大小 13,536,090 字节，SHA-256 与 GitHub asset digest 一致：
`461d4b8775807fe39a418ea82b69c477e0e861ab8c5141af20d9c2c4975a3f2a`。

本机 Debian GNU/Linux 12 ARM64 VM（Debian 12.15、glibc 2.36），普通账户 parallels
直接执行解压后的 `llama-b10549/llama-server --version`，退出码为 1，动态加载器报告：

- `GLIBC_2.38` not found：libc/libm 不能满足多个包内共享库的要求。
- `GLIBCXX_3.4.32` not found：libstdc++ 不能满足 server/common 库要求。
- `CXXABI_1.3.15` not found：同属 libstdc++ 的 C++ ABI 版本不匹配。

该 tag 的[官方 release workflow](https://github.com/ggml-org/llama.cpp/blob/b10549/.github/workflows/release.yml)
在 Ubuntu 24.04 ARM runner 上安装 GCC/G++ 14 构建此包，使用 `$ORIGIN` RPATH。
这些系统符号版本要求已由实际二进制执行证实；在当前 Debian 12 环境中，该预编译包
无法通过探测或启动。可行方向是使用兼容 Debian 12 的构建、在目标系统编译同 tag，
或使用同时满足上述 glibc 与 libstdc++ 要求的系统环境。

本轮没有升级系统库、安装系统软件、自动触发源码编译或改变插件版本安装选择策略。

## 修复范围与操作契约

原 `defaultDeps.probe` 已收集 stdout/stderr，但非零退出时丢弃全部输出，只给出
`llama-server version probe failed (1)`，导致真实原因不可见。

`plugins/llamacpp/fork/runtime.ts` 现在在失败异常中保留退出码/终止信号和进程输出，
累计输出只保留最后 64,000 个字符。非零退出仍失败，不能把不可运行的包标记为安装成功。

沿用既有生命周期，无新增状态或例外授权：

- owner：renderer 的 LlamaCppController 持有不可变 variant 请求、进度、通知和终态；
  fork 的 LlamaCppModule 持有版本级互斥与真实进程停止。
- lifetime：从下载请求到激活的 resolve/reject，页面销毁不改变任务归属。
- intermediate：APP-On-Progress；terminal：resolve/reject。
- duplicates：同版本操作拒绝，不同版本可并行；服务启动与版本变更保留既有互斥。
- service interaction：替换正在运行的版本时由现有 fork 所有者先停止。
- required dependencies：下载、校验、解压、可执行探测、manifest 写入、原子激活；
  探测失败只阻断该版本，保留旧安装。激活后清理为附加操作，不反转安装结果。
- constraints：无 Pinia/共享配置/公共类型变更，不新增生命周期，模块代码仍在插件内。

## 验证

新增 `scripts/llamacpp-runtime-probe-test.ts`，接入 `yarn test:llamacpp-plugin`。
只替代网络下载，执行真实 tar 解压、真实子进程和生产安装逻辑：

- 修复前测试因异常缺失 GLIBC 原始输出而失败；修复后通过。
- 覆盖成功探测、stderr/stdout 错误、无输出失败、信号终止和输出长度限制。
- 探测失败保留已安装 executable/manifest，清理 staging。
- 既有插件契约与 fork affinity 回归通过，插件完整构建通过，独立代码复审无阻断问题。
- 完整官方 b10549 包原生执行仍因系统库不兼容退出 1；本轮并未修复系统兼容性。

诊断修复插件包：`release/llamacpp-linux-probe/llama-cpp-0.1.0-probe-diagnostics.zip`。
仅本地构建，未发布或覆盖 VM 已安装插件；构建时 catalog 自动修改已恢复至用户原有内容。
