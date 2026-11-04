# llama.cpp 集成调研

> **调研主题**: llama.cpp 是否可集成进 FlyEnv  
> **调研日期**: 2026-09-29  
> **参考项目**: ggml-org/llama.cpp  
> **结论**: 可行性高。建议将 llama.cpp 作为可选的本地推理后端；先复用现有 OpenAI 兼容 Provider 验证连接，再决定是否新增独立服务模块。不要把它并入 Ollama 的运行时和模型管理流程。

---

## 结论摘要

llama.cpp 是 C/C++ 本地推理引擎，可将 GGUF 模型运行在 CPU、Apple Metal、NVIDIA CUDA、Vulkan 等后端，并提供 `llama serve` / `llama-server` HTTP 服务。服务支持 OpenAI 兼容的 Chat Completions、Responses、Embeddings 等 API，也有健康检查和自带 Web UI，能被 FlyEnv 的本地 AI 服务与 Provider 流程使用。

截至本次调研，官方 Releases 页面列出 2026-09-28 发布的 `b11236` 预发布构建及多个操作系统和后端变体。版本迭代很快，版本目录不能把同一个构建号下的 CPU、CUDA、Vulkan 等二进制当作同一个无差异安装包。llama.cpp README 提供的当前快速开始路径也已可以通过 `llama cli -hf ...` 和 `llama serve -hf ...` 从 Hugging Face 获取模型并运行。

FlyEnv 已有 Ollama 服务模块和 OpenAI 兼容 Provider 的设计基础。Ollama 聚焦模型目录、拉取和服务管理；llama.cpp 提供更直接的 GGUF 与推理后端控制。它们可以并存，但各自维护运行时和模型目录。官方项目为 MIT 许可；用户选用的 GGUF 模型仍需单独检查其模型许可与分发条件。

官方资料：

- [llama.cpp README](https://github.com/ggml-org/llama.cpp)
- [llama.cpp Releases](https://github.com/ggml-org/llama.cpp/releases)
- [llama-server/API 说明](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [模型获取与 GGUF 说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/models.md)
- [Hugging Face 模型搜索](https://huggingface.co/docs/huggingface_hub/guides/search)
- [Hugging Face CLI](https://huggingface.co/docs/huggingface_hub/guides/cli)
- [官方安装方式](https://github.com/ggml-org/llama.cpp/blob/master/docs/install.md)
- [构建与后端说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)

---

## 发行方式与支持平台

官方 GitHub Releases 直接提供按 OS、CPU 架构及推理后端区分的可执行包；也可用 Winget、Homebrew、Conda 等包管理器安装。FlyEnv 若需统一版本、目录和生命周期，优先考虑下载并校验官方 Release 资产，而不是调用用户全局的包管理器。

| 平台 | 官方发布包示例 | 说明 |
|---|---|---|
| Windows x64 | CPU、CUDA 12/13、Vulkan、OpenVINO、SYCL、ROCm | CUDA 变体还需匹配的 CUDA DLL/驱动；Vulkan 和其他 GPU 后端依赖对应系统驱动 |
| Windows ARM64 | CPU、OpenCL/Adreno、部分 CUDA 变体 | 设备与后端覆盖仍在演进，第一版可先支持 CPU |
| macOS Apple Silicon | ARM64，Metal 后端 | 官方构建面向 Apple Silicon；Metal 是主要 GPU 加速路径 |
| macOS Intel | x64 | 官方发布 CPU 构建；可用后端应按具体二进制确认 |
| Linux x64 / ARM64 | Ubuntu CPU、Vulkan；x64 另有 CUDA、ROCm、OpenVINO、SYCL 等 | 官方 Release 常以 Ubuntu 为构建基线；其他发行版需要验证 glibc 和驱动兼容性 |

上述资产名称、后端和驱动版本随 release 更新。本次页面显示的预发布包已包含 macOS ARM64/x64、Windows x64/ARM64 和 Ubuntu x64/ARM64 CPU 变体，以及若干 GPU 构建；实施时应通过 GitHub Releases/API 获取资产清单，按 FlyEnv 的 OS 与架构筛选，不要硬编码旧构建号里的包名。

### 运行时变体

版本身份至少应包含 release/build、OS、架构、backend；CUDA 等还要包含运行库变体。例如 `b11236 / Windows / x64 / CUDA 13` 与同构建的 CPU 包是两个独立运行时。需要下载额外 DLL 的构建应作为完整变体一起校验、安装和清理。

建议第一版先覆盖：

- Windows x64 CPU 与 macOS ARM64 Metal。
- Linux x64/ARM64 CPU（以官方 Ubuntu 构建在目标 Linux 环境的实测结果为准）。
- Vulkan 可作为第二步：虽然跨平台覆盖较好，但需要确认系统驱动和安装包依赖。
- CUDA、ROCm、SYCL、OpenVINO、Windows ARM GPU 等高依赖变体后续逐步加入。

### Vulkan / CUDA Release 包与命令是否一致

**有官方预编译变体，但不是每个 OS/架构都同时提供所有后端。**以当前官方 Release 清单为例，Windows x64 有 CPU、CUDA 12/13、Vulkan 等包；Ubuntu x64 有 CPU、Vulkan、CUDA 12/13 等包，Ubuntu ARM64 也有 CPU、Vulkan 及部分 CUDA 构建。应按具体 Release 页面核对组合；不能因为项目源码支持某个后端，就推断该平台一定有官方预编译包。

**常规使用方式基本一致，但不能说完全一致。**同一个功能在 CUDA/Vulkan/CPU 变体中通常使用相同的 CLI 工具名、模型参数和服务参数；后端由所下载的构建决定，而不是像 Ollama 那样另加一个 `--backend cuda` 开关。常见启动例子：

```bash
# Vulkan 包或 CUDA 包均沿用同一组模型/API参数
llama-server -m ./model.gguf -c 4096 -ngl 99 --host 127.0.0.1 --port 8080

# 新版统一 CLI 对应写法
llama serve -m ./model.gguf -c 4096 -ngl 99 --host 127.0.0.1 --port 8080
```

`-ngl` / `--n-gpu-layers` 表示最多把多少层放到 GPU 显存；新版还有 `--device` 和 `--list-devices` 用于选择/查看当前构建识别到的设备。CPU 包没有 GPU 后端可供 offload。Vulkan 与 CUDA 包中的设备名称、可用设备、offload 能力和性能选项会随编译后端变化，因此设备选择值不能跨后端照搬。除驱动外，仍需留意 OS 可执行文件扩展名/路径、压缩包布局，以及 CUDA 变体可能附带的特定 CUDA runtime DLL/共享库包；不能把不同包互换或只替换一个可执行文件。

因此，若 FlyEnv 管理官方 Release，建议把 `release + OS + CPU 架构 + backend + CUDA runtime 版本` 作为变体标识；安装时整套解包、校验，并按变体生成启动参数。对普通用户可复用同一个模型路径、上下文长度和服务地址设置，后端相关设备选择则单独呈现，并以所选二进制的 `--help` / `--list-devices` 能力为准。

参考：[官方 Release 构建工作流](https://github.com/ggml-org/llama.cpp/blob/master/.github/workflows/release.yml)、[官方 CLI 参数](https://github.com/ggml-org/llama.cpp/blob/master/tools/cli/README.md)。

---

## 服务与 API 能力

基础服务示例：

```bash
llama serve -m /path/to/model.gguf --host 127.0.0.1 --port 8080
```

官方 CLI 也支持 `llama serve -hf <repo>`，可直接从 Hugging Face 下载和启动模型。Release 中仍可能提供 `llama-server` 程序入口，具体可执行文件布局需对每个发行资产检测，不能只依赖一个入口名称。

服务端包括：

- OpenAI 兼容 API，例如 `/v1/chat/completions`、`/v1/responses`、`/v1/embeddings`。
- `GET /health` 健康检查：模型加载时返回 503，准备好后返回 200。
- CPU 线程、上下文长度、GPU offload 层数、设备等启动参数。
- 内置 Web UI、多用户并行、连续批处理，以及部分模型的多模态能力。

OpenAI 兼容性适合接入现有 AI 客户端，但不是对 OpenAI 所有参数和模型行为的完全等价保证；尤其是 chat template 和模型能力会影响对话、工具调用和结构化输出效果。FlyEnv Provider 应允许用户选择模型 ID 与 Base URL，不应假设所有 GGUF 都有相同功能。

默认建议绑定 `127.0.0.1`。如用户选择监听局域网或全部网卡，应明确展示 API 暴露范围与认证设置，避免将无认证的本地推理服务暴露到不可信网络。

### 服务配置文件与环境变量

`llama-server` 的单模型运行通常**没有一个必需的通用配置文件**：启动配置通过 CLI 参数传入，也可将大部分对应选项设为环境变量。官方参数表会在支持环境变量的选项旁标出变量名，常见映射是 `--ctx-size` → `LLAMA_ARG_CTX_SIZE`、`--host` → `LLAMA_ARG_HOST`。同一参数同时出现在命令行和环境变量时，命令行优先；布尔变量支持 `true/false`、`1/0`、`on/off`、`enabled/disabled` 等形式。不是每个 CLI 参数都必然有环境变量映射，应以所用版本的 `--help` 和 Server 参数表为准。

```bash
LLAMA_ARG_MODEL=/models/model.gguf \
LLAMA_ARG_CTX_SIZE=8192 \
LLAMA_ARG_N_GPU_LAYERS=99 \
LLAMA_ARG_HOST=127.0.0.1 \
LLAMA_ARG_PORT=8080 \
./llama-server
```

配置项很多，实用上可按用途归类如下（下面是常见项，不是完整参数清单）：

| 配置类别 | 常见 CLI 参数 / 环境变量 | 用途 |
|---|---|---|
| 模型来源 | `-m/--model` (`LLAMA_ARG_MODEL`)、`-hf/--hf-repo` (`LLAMA_ARG_HF_REPO`)、`--hf-file`、`--model-url` | 本地 GGUF、Hub 仓库/文件或 URL |
| 推理资源 | `-c/--ctx-size`、`-t/--threads`、`-np/--parallel`、`-ngl/--n-gpu-layers`、`--device`、`--split-mode`、`--tensor-split` | 上下文、并行、CPU 线程、GPU offload 和多设备分配 |
| 模型行为 | `--batch-size`、`--ubatch-size`、`--flash-attn`、KV cache 类型/offload、采样参数、`--jinja`、`--chat-template` | 推理速度/内存、采样和聊天模板 |
| 网络与认证 | `--host` (`LLAMA_ARG_HOST`)、`--port` (`LLAMA_ARG_PORT`)、`--api-key` (`LLAMA_API_KEY`)、`--api-key-file`、SSL key/cert、CORS、API prefix | 监听地址、端口、服务认证、TLS 和跨域策略 |
| 服务功能 | `--embedding`、`--rerank`、`--metrics`、`--props`、`--slots`、`--ui/--no-ui`、超时与 HTTP 线程数 | 开关 API 能力、监控端点和 Web UI |
| Router 多模型 | `--models-dir` (`LLAMA_ARG_MODELS_DIR`)、`--models-preset` (`LLAMA_ARG_MODELS_PRESET`)、`--models-max`、`--models-autoload` | 多模型目录发现、并发加载和自动加载策略 |
| 日志和缓存 | `--log-file`、`--log-jsonl`、`LLAMA_CACHE`、缓存相关 CLI 项 | 日志落盘、Hub 下载缓存及推理缓存行为 |

此外，官方提供几种**用途专属配置文件**，不要把它们误认为一个覆盖所有启动参数的配置系统：

- Router 的 `--models-preset <file.ini>`：INI 中可写全局 `[*]` 默认值及模型专属配置，例如 `ctx-size = 8192`、`n-gpu-layers = 99`。模型专属 preset 覆盖全局 preset，命令行参数优先级最高；Router 控制的 host、port、API key 等会被移除或覆盖。
- Web UI 的 `--ui-config-file <file.json>`：只设置 Web UI 偏好，不配置模型推理和服务启动参数。
- API Key 的 `--api-key-file`：每行一个 key，`#` 开头的行为注释。
- MCP 工具的 `--mcp-servers-config <file.json>`：仅配置 MCP server 定义；内置工具/MCP 属于高权限功能，不应对不可信环境开放。

除 `LLAMA_ARG_*` 映射外，还需留意专用环境变量：`HF_TOKEN` 用于 Hugging Face 访问，`LLAMA_CACHE` 控制 Hub 模型缓存目录，`LLAMA_API_KEY` 设置 API key。不要把这些秘密写进可共享的模型 preset 或日志；FlyEnv 若管理服务，可由模块 controller 组装参数和进程环境，敏感 key 单独安全存储，并优先避免在命令行明文暴露。

官方完整项随版本演进，建议查[Server 参数与环境变量清单](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)；文档标注的映射之外不要凭变量名推断支持情况。环境变量与命令行覆盖规则、Router INI preset 示例也见同一官方文档。

---

## 在线模型列表能否获取

可以，模型目录由 Hugging Face Hub 等模型仓库提供，llama.cpp 本身不维护类似 Ollama Library 的统一模型商城。Hugging Face Hub 有模型搜索、按下载量排序、仓库文件列表和模型卡；当前官方 `hf` CLI 可按“可由 llama.cpp 运行”筛选，例如：

> `hf` 是 Hugging Face Hub CLI，需单独安装 `huggingface_hub`/`hf`；它不包含在 llama.cpp 的发行包中。FlyEnv 若实现模型浏览，不应要求用户预装 `hf`，可直接调用 Hugging Face Hub API。

```bash
hf models ls --apps llama.cpp --sort downloads --limit 20
hf models ls --search "Qwen GGUF" --apps llama.cpp --sort downloads --limit 20
hf models ls <owner>/<repo> --tree -h
```

Hugging Face Hub API / `huggingface_hub` Python 客户端也能查询模型列表，读取仓库 ID、下载量、标签、模型卡元数据和文件信息。UI 可以据此实现远端搜索、作者/任务/许可证筛选，再打开模型卡让用户选 GGUF 量化文件。`--apps llama.cpp` 或 `gguf` 标签只能作为搜索过滤信号；仓库内容、模型卡和许可证信息应再核对，不能把搜索结果等同于官方推荐或质量认证。

要区分两种“模型列表”：远端列表由 Hub 搜索 API 提供；llama.cpp Server Router 的 `/v1/models` 或 models UI 用于本地缓存/目录中的模型和运行实例，不是整个 Hub 的在线目录。Router 可从 `LLAMA_CACHE`、`--models-dir` 或 preset 中发现本地模型。实现 FlyEnv 在线模型页时，需单独接 Hugging Face API；不应把 Server 的 `/v1/models` 当远端搜索接口。

### Hub API 是否公开、是否需要 token

Hugging Face 将 Hub API endpoint 文档为开放接口。查询公开模型目录、读取公开模型卡和公开仓库元数据，通常可匿名访问，不要求 API key/token；下载公开模型文件通常也可匿名访问。需要访问 private 仓库、gated 模型或执行写操作时，必须提供有对应权限的用户 token。Gated 模型还要求用户先登录、在 Hub 页面申请/接受模型方设置的访问条件，并获得访问授权；单有 token 不会绕过模型方的 gate。

官方速率限制区分 Hub API、文件 Resolver（URL 含 `/resolve/`，包括大文件下载）和网页访问三类额度，并按 5 分钟窗口计算。官方限制页当前展示的基准值标注为 2025 年 9 月：匿名访问每 IP 的 Hub API 约 500 次/5 分钟、Resolver 约 3,000 次/5 分钟；登录 Free 账户分别约 1,000 和 5,000 次/5 分钟。匿名与 Free 档标注为会随平台负载调整，额度不应作为固定 SLA；触发限制会收到 HTTP 429，响应头会提供限额/重置时间信息。

对 FlyEnv 的影响：公开目录浏览无需把全局 HF token 内置到应用中；搜索应分页、去抖并缓存结果，收到 429 时按响应头等待后重试。避免启动时批量扫描整个 Hub。可选地允许用户配置自己的只读 token，用于其 gated/private 仓库访问和个人额度；token 应由用户持有并安全存储，不能在客户端共享硬编码开发者 token。模型列表 API 额度和 GGUF 文件下载额度是分开的，下载模型时应单独处理网络失败、限速和断点续传。

参考：[Hub API Endpoints](https://huggingface.co/docs/hub/api)、[Hub Rate Limits](https://huggingface.co/docs/hub/rate-limits)、[User Access Tokens](https://huggingface.co/docs/hub/security-tokens)、[Gated Models](https://huggingface.co/docs/hub/models-gated)。

---

## llama.cpp 是否自带模型下载命令

**当前统一 `llama` 命令已经提供单独下载子命令。**官方 `llama download` 可从 Hugging Face 仓库或指定模型 URL 下载，并输出本地缓存路径；它和 `llama cli -hf` / `llama serve -hf` 的区别是前者只下载，后两者会在下载/命中缓存后继续加载模型并进入对话或启动服务。

```bash
# 下载仓库默认量化（通常优先 Q4_K_M；没有时回退到仓库可用文件）
llama download -hf ggml-org/gemma-3-1b-it-GGUF

# 指定量化 tag
llama download -hf bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M

# 指定仓库内的精确 GGUF 文件
llama download -hf <owner>/<repo> -hff <filename.gguf>

# 从直链下载单文件到 llama.cpp 的模型缓存
llama download -mu <GGUF-file-URL> -m <local-filename.gguf>
```

`-hf` 指向 Hugging Face 仓库，`:Q4_K_M` 这类后缀选择量化；需要精确控制文件时用 `-hff/--hf-file`。带视觉投影文件或多分片模型时，还需确认相关文件是否被一并下载并按 Server 要求放入同一模型子目录。对 gated/private 仓库需先取得访问权限，再通过 `HF_TOKEN` 或 `-hft` 提供令牌。

llama.cpp 的下载器保存到 Hugging Face 风格的缓存目录，默认在用户缓存目录下；可以通过 `LLAMA_CACHE` 指向 FlyEnv 模型缓存。缓存结构按仓库和 snapshot 组织，并不等于一个用户友好的平铺模型目录。下载完可以通过 `llama serve -hf ...` 直接启动，或用 Router 查找缓存；也可以自己把文件组织到目录后传给 `llama serve -m <path>`。

### 其他下载方式

如果当前二进制没有 `llama download`（例如较旧的独立可执行包），可以用旧入口把模型下载并启动：

```bash
llama-cli -hf <owner>/<repo>:<quant>
llama-server -hf <owner>/<repo>:<quant>
```

如果希望 GGUF 落在显式路径，可使用单独安装的 Hugging Face 官方 CLI：

```bash
# 查看仓库文件和大小，选择量化文件及所需的 mmproj/分片
hf models ls <owner>/<repo> --tree -h

# 将选定文件下载到指定目录
hf download <owner>/<repo> <filename.gguf> --local-dir ./models/<model-name>

# 使用本地文件启动
llama serve -m ./models/<model-name>/<filename.gguf> --host 127.0.0.1 --port 8080
```

Hugging Face gated/private 模型先执行 `hf auth login`，或为 `hf download` 设置 token。Hub CLI 会处理缓存、分片传输和进度；仓库含多个量化文件时应指定目标文件，不要不加筛选地下载整个仓库。直接从 Hub 页面下载也可行，但要检查是否漏掉多分片权重或多模态模型需要的 `mmproj` 文件。

需要注意：最新下载入口近期仍在快速演进。2026 年 9 月有[公开 issue](https://github.com/ggml-org/llama.cpp/issues/28950) 报告 `llama download -hf` 未下载 `mmproj`，而 `llama cli -hf` / `llama-server -hf` 路径行为不同；多模态模型的下载完成校验应确认主 GGUF、投影文件和所有分片都齐全，并在实现时复测选定 Release。

---

## 常用命令速查

新的统一 CLI 将常见动作组织为 `llama <subcommand>`；有些发行包仍以独立二进制提供同一工具（例如 `llama-cli`、`llama-server`、`llama-quantize`、`llama-bench`）。以具体 Release 包内文件和 `--help` 输出为准。

| 用途 | 当前统一命令 | 旧式独立二进制/备注 |
|---|---|---|
| 查看命令与构建版本 | `llama --help`、`llama --version` | 各程序也支持 `--help`；核验 Release/build/backend |
| 搜索 Hub 模型 | `hf models ls --apps llama.cpp --sort downloads --limit 20` | 需另行安装 Hugging Face CLI；llama.cpp 不包含 `hf` |
| 下载模型 | `llama download -hf <repo>:<quant>` | 旧包通常通过 `llama-cli -hf ...` 下载并加载 |
| 交互式本地对话 | `llama cli -m <model.gguf>` | `llama-cli -m <model.gguf>` |
| 从 Hub 下载并对话 | `llama cli -hf <repo>:<quant>` | 下载模型后进入交互运行 |
| 启动 API/Web UI 服务 | `llama serve -m <model.gguf> --host 127.0.0.1 --port 8080` | `llama-server -m ...`，默认监听 localhost:8080 |
| 从 Hub 加载并启动服务 | `llama serve -hf <repo>:<quant>` | `llama-server -hf ...` |
| 多模型 Router | `llama serve --models-dir <dir>` | 不指定单个 `-m`，由 Router 管理本地模型目录/缓存 |
| 硬件/速度基准 | `llama bench -m <model.gguf>` | `llama-bench -m ...` |
| GGUF 量化 | `llama quantize <input.gguf> <output.gguf> Q4_K_M` | `llama-quantize ...`；量化会生成另一份大文件 |
| 评估困惑度 | `llama perplexity -m <model.gguf> -f <text-file>` | `llama-perplexity ...`，偏开发/评估用途 |

模型初次启动最常用的两种完整命令：

```bash
# 下载并在终端交互
llama cli -hf <owner>/<GGUF-repo>:<quant>

# 下载/命中缓存并提供本机 API
llama serve -hf <owner>/<GGUF-repo>:<quant> --host 127.0.0.1 --port 8080
```

老版本独立程序常见参数 `-m`、`-hf`、`-ngl`/`--n-gpu-layers`、`-c`/`--ctx-size`、`-t`/`--threads`、`--port`，但参数别名、`llama` 命令分组和模型缓存选项会随版本变更。FlyEnv 集成应探测或绑定具体 Release 的版本能力，避免跨版本拼接参数。

---

## FlyEnv 现有基础与产品边界

- [Ollama 模块定义](../../src/render/components/Ollama/Module.ts) 把 Ollama 注册为 `ai` 服务模块，页面已经包含服务启停、版本、模型、配置和日志入口。
- [Ollama Fork 模块](../../src/fork/module/Ollama/index.ts) 可参考其服务进程管理，但不能复用其专有模型管理协议替代 GGUF/Hugging Face 流程。
- [Hermes Provider](../../src/render/components/Hermes/providers.ts) 已有 Ollama/OpenAI 类端点配置，可参考其 OpenAI 兼容地址设置。
- [AI Coding CLI 设计](../design/712-ai-coding-cli-integration.md) 已规划 Ollama 与 OpenAI 兼容 Provider 的统一入口。

### 建议的接入层次

**第一步：Provider 接入。** 允许现有 OpenAI 兼容客户端连接用户已经运行的 llama.cpp 服务，例如 `http://127.0.0.1:8080/v1`。这能验证模型 ID、流式响应、工具调用等使用场景，几乎不涉及新的安装和进程管理代码。

**第二步：FlyEnv 管理的独立服务。** 若用户需要一键安装与启动，再新增独立的 llama.cpp 模块：负责运行时变体、GGUF 选择、启动参数、日志、PID、端口、健康检查和 API 地址。模型文件放在独立目录；下载/删除 GGUF 不复用 Ollama 模型命令。

两步可以先后上线，也可以只实现第一步。若只是让 AI Coding 或 Hermes 连接本地推理，Provider 已能覆盖主要价值；若 FlyEnv 要管理 GPU 变体和模型运行配置，才需要完整服务模块。

---

## 服务生命周期和状态归属建议

- Fork 模块拥有外部推理服务进程、PID、端口、服务存活状态和退出清理。
- 对话框、运行时下拉框、模型选择和展示筛选由挂载页面组件持有。
- 可跨页面继续的运行时安装、模型下载和启动健康等待，由模块级 controller 持有进度、终止事件、重入保护和监听器清理。
- 启停优先走 `ModuleInstalledItem.start()`、`stop()`、`restart()`，模块特有的模型参数通过 `startExtParam`/`stopExtParam` 注册；若共享生命周期表达不了推理服务参数，再论证专用工作流。
- 新模块数据使用 `StorageSetAsync` / `StorageGetAsync` 持久化；不为新模块新建 Pinia，也不把模块专属状态写进 `config.setup`。
- 实施计划需明确操作 owner、开始/进度/结束事件、重复调用行为、停止时的子进程处理、页面卸载后任务行为及生命周期验证。

---

## 模型管理、数据和许可

模型输入是 GGUF 文件，可以来自本地文件，也可以按 Hugging Face 仓库/量化选择下载。当前统一 CLI 有 `llama download`，Hub 也有可用于在线目录和指定目录下载的官方 CLI；FlyEnv 若自建模型工作台，仍需自己解决大文件的断点续传、磁盘空间预检查、取消、缓存管理、文件完整性和失败清理。

模型数据与程序运行时应分开保存：

```text
app/llama.cpp/<release>/<platform>/<backend>/   # 推理程序
data/llama.cpp/models/                          # GGUF 模型
server/llama.cpp/<instance>/                    # 实例配置、日志和运行数据
```

llama.cpp 仓库使用 MIT 许可，适合以外部开源运行时方式集成；但各 GGUF 模型的许可、商用权和再分发规则由模型方决定，FlyEnv 应保留模型来源信息，并避免默认代用户再分发模型文件。

模型发现和在线文件列表可由 FlyEnv 直接调用 Hub API，或在用户自行安装 Hugging Face CLI 时调用 Hub CLI；不要把 `hf` 作为 llama.cpp 已包含的命令。提供来源、仓库链接、模型卡、许可证、量化文件和大小信息，结果应标注为第三方 Hub 内容。仅由 llama.cpp 自带的 `llama download` 下载到缓存即可满足基础体验；用户期望的“下载模型库、搜索、筛选、安装、删除、显示磁盘占用”等 Ollama 风格管理面板，仍需 FlyEnv 提供 UI 与本地模型索引。

---

## 主要风险

- **发布变化频繁**：每日构建和后端变体众多；下载索引、资产校验和包内文件探测要能容忍命名变化。
- **硬件差异**：CUDA/Vulkan/Metal 等构建依赖不同系统驱动和运行库。二进制存在不代表目标设备一定可用，初版应提供 CPU 运行基线。
- **模型资源**：RAM/VRAM 不够会导致加载失败或系统内存压力；初版可显示模型文件大小、上下文配置和资源提醒，但实际显存估算会因量化、KV cache、模型架构和 offload 策略变化。
- **API 差异**：OpenAI 兼容接口支持常见调用，但不同模型的 chat template、工具调用和多模态能力不同，需显示服务返回的模型列表并允许验证连接。
- **模型信任与许可**：模型下载源可能提供不同许可证或来源；运行任意模型文件也需要把安全边界和网络绑定设置讲清楚。
- **并发/退出清理**：下载可能跨页面继续；停止推理进程时必须确认子进程和后端 worker 被回收，不应由 renderer 的临时 `running` 标志代表真实状态。

## 最终判断

llama.cpp 适合集成到 FlyEnv，且比 TDengine 更贴合现有 AI 服务和 OpenAI Provider 体系。若目标是让现有 AI 客户端使用它，先提供 Provider 连接入口即可；若目标是完整管理推理程序、GPU 后端和 GGUF 模型，则作为独立 `llama.cpp` 服务模块实现，首期支持 CPU 与平台原生 Metal，随后按需求增加 Vulkan/CUDA。Ollama 与 llama.cpp 面向相邻但不同的工作流，应各自拥有运行时和模型生命周期。
