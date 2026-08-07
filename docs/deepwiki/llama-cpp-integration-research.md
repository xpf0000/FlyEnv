# llama.cpp 集成调研

> **调研对象**: [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)  
> **调研日期**: 2026-08-06  
> **最新 Release**: [`b10293`](https://github.com/ggml-org/llama.cpp/releases/tag/b10293)

---

## 结论

llama.cpp 可以集成进 FlyEnv，并且适合做成独立的 AI 服务模块。

推荐以官方预编译可执行文件作为外部进程运行，不建议第一版将 `libllama` 直接编译成 Electron/Node 原生扩展。这样可以复用 FlyEnv 当前服务模块、版本管理、PID 管理、日志和端口检查机制，同时避免 Electron ABI、CMake、GPU SDK 和跨平台签名带来的维护成本。

llama.cpp 与 Ollama 是互补关系：

- Ollama 更偏向开箱即用的模型下载、存储和服务管理。
- llama.cpp 更偏向直接运行 GGUF、精细控制后端、线程、上下文和 GPU layers。

---

## 官方 Release 包的含义

官方 Release 提供的是多组彼此独立的预编译包，不是一个包含所有后端的万能包。

需要区分两个概念：

- `x64`、`arm64`、`s390x` 是 CPU/平台架构。
- CPU、Vulkan、CUDA、HIP、SYCL、OpenVINO 是推理后端或后端构建变体。

### b10293 主要包

| 平台 | 官方包 | 说明 |
|---|---|---|
| Windows | `win-cpu-x64`、`win-cpu-arm64` | CPU 构建 |
| Windows | `win-vulkan-x64` | Vulkan GPU 后端 |
| Windows | `win-cuda-12.4-x64`、`win-cuda-13.3-x64` | NVIDIA CUDA 构建 |
| Windows | `win-hip-radeon-x64` | AMD Radeon/HIP 构建 |
| Windows | `win-sycl-x64` | SYCL 构建 |
| Windows | `win-openvino-2026.2.1-x64` | Intel OpenVINO 构建 |
| Windows ARM64 | `win-opencl-adreno-arm64` | Adreno OpenCL 构建 |
| macOS | `macos-arm64`、`macos-x64` | 按 Apple Silicon/Intel 区分；官方没有单独的 Metal 下载包 |
| Ubuntu | `ubuntu-x64`、`ubuntu-arm64`、`ubuntu-s390x` | CPU 构建 |
| Ubuntu | `ubuntu-vulkan-x64`、`ubuntu-vulkan-arm64` | Vulkan 构建 |
| Ubuntu | `ubuntu-rocm-7.2-x64` | AMD ROCm 构建 |
| Ubuntu | `ubuntu-openvino-2026.2.1-x64` | OpenVINO 构建 |
| Ubuntu | `ubuntu-sycl-fp16-x64`、`ubuntu-sycl-fp32-x64` | SYCL 精度变体 |
| Android | `android-arm64` | Android CPU 构建 |

Windows CUDA 发布包还额外提供对应的 CUDA DLL 包：

```text
llama-b10293-bin-win-cuda-12.4-x64.zip
cudart-llama-bin-win-cuda-12.4-x64.zip
```

CUDA 13.3 也是同样的主包和 `cudart` DLL 包组合。FlyEnv 应将它们作为一个完整的 CUDA 运行时变体管理，而不是把 `cudart` 当成独立版本。

官方 Release 资产提供 SHA-256 digest，安装时应校验 digest 后再解压和执行。

---

## 不同后端的运行差异

整体启动方式和模型格式是一致的。当前 CLI 支持 `llama serve`，发行包也可能提供 `llama-server` 入口；服务参数体系基本相同：

```bash
llama serve \
  -m model.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --n-gpu-layers 99
```

通用能力包括：

- GGUF 模型加载
- OpenAI 兼容的 `/v1/models`、`/v1/chat/completions`、`/v1/embeddings` 等 API
- `GET /health` 健康检查
- `--list-devices` 查看可用设备
- `--device` 选择后端设备
- `--n-gpu-layers`（旧别名 `-ngl`）控制 GPU offload 层数

差异主要体现在二进制、驱动和运行时依赖，而不是 HTTP API。

| 后端 | 运行要求 | FlyEnv 运行时处理 |
|---|---|---|
| CPU | 不需要 GPU 驱动；模型完全在 CPU/RAM 中运行 | 直接启动；可用 `--device none` 禁用 GPU |
| Vulkan | 系统显卡驱动必须提供 Vulkan | 启动前检查驱动；允许用户选择设备 |
| CUDA 12.4/13.3 | NVIDIA 驱动、匹配的 llama 主包和 CUDA DLL 包 | 将 CUDA 版本作为独立运行时变体 |
| HIP/ROCm | AMD Radeon 驱动；Linux 通常还涉及 ROCm 环境 | 首期不建议默认安装，作为高级后端 |
| SYCL | Intel GPU/CPU 及 oneAPI/SYCL 运行环境 | FP16/FP32 作为不同构建变体展示 |
| OpenVINO | Intel OpenVINO 与硬件驱动 | 仅在检测到 Intel 环境时推荐 |
| macOS | 选择正确的 `arm64` 或 `x64` 包；实际后端以 `--list-devices` 为准 | 根据 Electron/系统架构自动筛选包 |

特别注意：

1. 安装 CPU 包不会因为机器有显卡而自动获得 CUDA/Vulkan 能力。
2. CUDA 12.4 和 CUDA 13.3 的启动命令基本相同，区别在驱动和 DLL 兼容性。
3. Vulkan、CUDA、HIP 等包可能仍然需要系统厂商驱动；“有对应二进制包”不等于任何机器都能运行。
4. SYCL FP16/FP32 是后端构建精度变体，不是 GGUF 模型量化版本。
5. 模型能否正常对话还取决于 GGUF 中的 chat template；嵌入、视觉和工具调用也有模型能力要求。

---

## 与 FlyEnv 现有架构的匹配

FlyEnv 已经有 Ollama 模块，可以作为结构参考：

- [Ollama fork 模块](../../src/fork/module/Ollama/index.ts)
- [Ollama 模块定义](../../src/render/components/Ollama/Module.ts)
- [Ollama 主页面](../../src/render/components/Ollama/Index.vue)
- [Ollama 的 fork 懒加载注册](../../src/fork/BaseManager.ts)
- [模块枚举](../../src/render/core/type.ts)

建议新增独立的 `llamaCpp`/`llama-cpp` 模块，而不是把它塞入 Ollama：

```text
src/fork/module/LlamaCpp/index.ts
src/render/components/LlamaCpp/Module.ts
src/render/components/LlamaCpp/Index.vue
src/render/components/LlamaCpp/Config.vue
src/render/components/LlamaCpp/Models.vue
src/render/components/LlamaCpp/Logs.vue
```

### 推荐的版本记录

llama.cpp 的 Release 标识通常是 `b10293` 这类构建号，不是传统的 `1.2.3` 语义版本。因此版本记录至少应包含：

```typescript
type LlamaCppRuntime = {
  release: string       // b10293
  os: 'Windows' | 'macOS' | 'Linux'
  arch: 'x64' | 'arm64' | 's390x'
  backend: 'cpu' | 'vulkan' | 'cuda' | 'hip' | 'sycl' | 'openvino'
  runtimeVariant?: string // cuda-12.4, sycl-fp16 ...
  bin: string
  sha256: string
}
```

不要将不同后端的同一 Release 合并成一个可执行版本，否则用户无法知道当前实际使用的 GPU 后端和运行时依赖。

### 推荐的服务启动流程

```text
选择运行时和 GGUF 模型
        │
        ▼
检查架构、驱动、端口、模型路径和内存/显存预估
        │
        ▼
Fork 模块启动 llama serve/llama-server
        │
        ▼
保存 PID，持续转发日志
        │
        ▼
轮询 GET /health，确认模型加载完成
        │
        ▼
暴露 OpenAI 兼容地址：http://127.0.0.1:<port>/v1
```

进程存活应以 fork 进程的 PID/端口/健康检查为准，不应以 renderer 中的 `running` 状态作为事实来源。

### Operation contract（实现前需固化）

| 项目 | 建议归属 |
|---|---|
| 子进程、PID、端口、伴随进程停止 | fork 的 LlamaCpp 模块 |
| 安装/下载进度、重入保护、通知和清理 | 模块级 renderer controller |
| 页面输入、模型选择、展示过滤 | 挂载页面组件 |
| 当前运行时、已安装模型、默认端口等领域状态 | Pinia/模块 store |
| 页面关闭后的进程和下载操作 | controller/fork，不能由页面生命周期直接终止 |

---

## 模型管理建议

llama.cpp 要求模型为 GGUF 格式。它支持：

- 本地 GGUF 文件
- Hugging Face 仓库和量化选择，例如 `-hf ggml-org/gemma-3-1b-it-GGUF`
- 已下载模型的本地路径

与 Ollama 不同，llama.cpp 没有同等定位的统一官方模型目录和模型名称协议。FlyEnv 不应直接复用 Ollama 的 `pull/rm/list` 语义，建议分成：

1. 本地模型导入：选择 GGUF 文件或模型目录。
2. Hugging Face 下载：输入仓库、量化版本和保存目录，显示文件级进度。
3. 运行配置：模型路径、上下文长度、线程数、GPU layers、设备、端口和 API key。

模型文件通常远大于运行时二进制，应使用独立模型目录、断点续传、磁盘空间预检查和取消/清理能力。

---

## 安全与兼容性风险

- 下载二进制后校验 GitHub API 提供的 SHA-256 digest。
- 默认只绑定 `127.0.0.1`；绑定 `0.0.0.0` 时必须提示 API key 和网络暴露风险。
- llama.cpp Release 构建号更新频繁，不能假设 CLI 参数和包布局永久不变；运行中的实例不要无提示自动替换二进制。
- GGUF 模型的许可证由模型作者决定，不能因为 llama.cpp 是 MIT 就假定模型也可自由分发。
- 模型加载可能消耗大量 RAM/VRAM，应在启动前做容量预估，并将 OOM、驱动错误和 chat template 错误区分展示。
- Windows CUDA 变体需要同时管理主包和对应 DLL 包；Linux 的 Ubuntu 包也需要实机验证在目标发行版上的 glibc/驱动兼容性。
- 下载、启动、停止、健康检查和页面销毁需要覆盖重复点击、进程提前退出、端口冲突、取消和孤儿进程清理测试。

---

## 分阶段建议

### 阶段 0：外部 Provider

在现有 OpenAI 兼容 Provider 中允许用户填写：

```text
Base URL: http://127.0.0.1:8080/v1
Model: <model id>
```

这可以先验证 API 兼容性，不需要新增安装器。

### 阶段 1：一等服务模块

支持 Windows CPU/Vulkan、macOS 两种架构和 Ubuntu CPU/Vulkan：

- Release 查询、下载、SHA-256 校验和安装
- 服务启停、PID、日志和 `/health` 检查
- 本地 GGUF 模型导入
- OpenAI Provider 自动生成本地地址
- 基础配置：模型、端口、上下文、线程和 GPU layers

### 阶段 2：高级后端和模型下载

再加入 CUDA 12.4/13.3、HIP、SYCL、OpenVINO、Hugging Face 下载、显存预估、断点续传和多模型路由。

粗略工作量：外部 Provider 约 0.5–1 天；CPU/Vulkan 一等模块约 3–7 个开发日；完整多后端和模型工作台约 2–4 周。

---

## 官方参考资料

- [llama.cpp README](https://github.com/ggml-org/llama.cpp)
- [最新 Release b10293](https://github.com/ggml-org/llama.cpp/releases/tag/b10293)
- [构建与后端说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)
- [Server/API 说明](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [模型与 GGUF 说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/models.md)
