# Windows shared 简化实施说明

## 范围与执行顺序

本次依据 `windows-shared-architecture-review.md` 的审查结论，优化既有实现。保留插件/独立脚本仍可能使用的旧 fallback 入口，先让标准 UAC 动作构造与旧命令/TEMP 传输分离。没有新增模块、Pinia 状态、共享配置或业务 IPC，也没有模块边界例外。

1. 删除无调用进程身份 ALS 与对应消费分支、旧 CSV 身份解析、无发送方阶段白名单。
2. PowerShell 环境构造归统一系统工具文件；交互终端使用明确的系统 PowerShell 路径。
3. 动作构造直接返回业务脚本；旧计划适配单独消费同一验证/脚本能力，根目录上下文改为显式参数。
4. Helper 安装/停用执行器移到 main；跨平台阶段计时改用通用文件名，更新实际调用和既有脚本引用。
5. 静态复核所有导入、动作覆盖、失败分支、兼容入口和文档。

## 操作与失败契约

- 所有者：main 继续持有授权选择、租约与 Helper 管理；fork 继续持有业务写入、进程与停止；renderer 继续仅持有已有 UI/控制器状态。
- 生命周期：从现有业务请求开始，经验证/授权/执行到现有 resolve/reject；不增加新中间业务事件，阶段日志仍只是观察信息。
- 成功条件：文件/注册表/安装等必要动作由真实执行结果证明；日志、DNS 与环境通知失败不能覆盖主结果。
- 重复调用：沿用现有 Helper 停用合并、权限租约、未知写操作禁止重放；不增加全局请求上下文或重试策略。
- 服务关系：普通服务继续 `ProcessKillStrict` → 一次有序 taskkill；端口工具继续保持等待前后的目标身份保护；共享批次进程列表传参不变。
- 副作用：本次不执行权限操作，不生成新版 Go 二进制，不改变 Go 协议。
- 后续验证范围：既有身份/授权/计划/终端/计时脚本、插件构建、中文路径、跨账户 UAC、取消和未知终态。按会话约束本次不新增或运行测试、构建、格式工具；既有脚本的失效导入/断言随实现更新。

## 实际改动与复核

### 1. 删除失效进程上下文与便利接口

`WindowsProcessSafety.ts` 删除两个服务身份 ALS、对应 with/getter、启动证明类型与包装校验；`WindowsPrivilegeOperation.ts` 删除消费这些永远未设置上下文的分支、启动证明脚本及跨来源比较说明。保留实际仍调用的身份类型、进程保护、监听端口查找、普通身份采样与权限拒绝后的 CIM 采样。

普通服务早已通过首次列表和 `ProcessKillStrict` 执行，这些删除不会增加服务查询或改变停止排序。端口工具仍可能需要提权，不因本次删除而变成裸 PID 授权。

`Process.win.ts` 删除仅测试引用的 `ProcessPidListByPids` 便利包装，保留实际使用的单根查询和公共快照建树实现；对应旧测试导入及两条重复便利接口断言移除。没有移除真实进程查询行为。

### 2. 清理旧身份解析与诊断阶段

`WindowsHelperIdentity.ts` 删除 `parseWindowsWhoAmIUserCsv` 及其两个旧测试断言。当前账户/SID 继续由 WindowsIdentity 与 UTF-8 JSON 获取，账户中文处理未更换。

`WindowsActionStage.ts` 删除已经没有发送方的 PATH 注册表细分、旧通知细分和 CIM 细分白名单。当前 broker、launch、认证、action 执行和结果传输诊断仍保留；安装错误、可信结果 JSON、nonce 和计时协议没有删除。

### 3. 系统 PowerShell 工具统一归属

`windowsPowerShellEnv` 移至 `WindowsSystemPaths.ts`，所有生产引用改为直接导入系统工具；同时移除 Identity 中没有必要继续保留的路径转导出。

普通进程查询、卷查询、环境广播、服务身份、权限探测和管道不再为了准备 PowerShell 环境而依赖 Helper 身份模块。继承环境和固定系统 `PSModulePath` 的行为保持一致，不改 PATH 内容，也不增加环境同步。

`WindowsTerminal.ts` 使用完整系统 PowerShell 路径，Windows Terminal 内部启动的 PowerShell 也使用该路径。可选 wt/pwsh 通过 `Get-Command -CommandType Application` 解析后使用实际程序路径，系统 PowerShell 回退不再搜 PATH。传给 Windows Terminal 的系统路径保留命令行引号，支持空格；命令内容继续用 UTF-8/EncodedCommand 编码。

`Exec.ts` 在真实启动前解析并检查系统 PowerShell，同一个路径传给内外两层。纯脚本构造仍可以注入完整路径，不强制在生成脚本时访问系统文件，实际执行方负责检查。

### 4. 现代动作直接获取业务脚本

`WindowsHelperFallback.ts` 内部使用统一 `buildWindowsActionPayload` 验证动作并构造业务脚本。`buildWindowsPrivilegeAction` 直接取得 `script`，不再调用旧 plan、编码完整 shell 命令、生成 TEMP 文件名或用 `Number.MAX_SAFE_INTEGER` 绕过旧阈值。

需要兼容数据文件的写动作在同一验证结果上提供可选适配信息；内容使用函数延后求值。现代入口不序列化该文件内容；只有旧 `buildWindowsHelperFallbackPlan` 在确实超过 inline 阈值时才读取内容、生成文件名和编码旧命令。路径校验、环境键限制、PATH 冲突检查以及具体脚本共用，避免复制两套验证。

旧 `runWindowsHelperFallback`、inline/TEMP、独立 shell integration 与 Sudo 仍存在。这些是无 provider 的脚本/插件兼容能力，不是普通服务停止的再次回退。标准业务入口仍走既有 provider、用户选择和租约，没有改为自动换授权方式。

旧执行器需要的 EnvSync 与 Sudo 改为在真正执行兼容分支时动态加载。现代构造不再因静态依赖初始化这两项旧执行能力。这里只能确认依赖和初始化入口收敛，未测量实际启动耗时改善。

### 5. 根目录上下文显式传递

删除 `scopedRuntimeRoots`、`scopedAllowedRootsFilePath`、`withTargetAllowedRoots` 及设置/恢复全局状态的 try/finally。私有验证函数明确要求 `WindowsActionScope` 实参：现代入口传 main 的根目录副本，旧入口传目标 SID。

现代入口即使传入空 roots，也表示明确的空白名单，不会回到旧目录名猜测；旧入口仍按其原契约查目标 SID 的 allowed-roots。脚本执行前后路径保护、数据目录精确根校验、原用户 Documents 校验保留。

原全局切换是同步执行，本次没有宣称它已发生并发故障；删除原因是减少隐式依赖，并使后续新增校验不能靠默认上下文悄悄选到旧路径。已经不需要切换全局状态的 shell integration 双层包装也合并为一个入口。

### 6. 文件位置与通用命名

- `src/shared/WindowsHelperInstaller.ts` → `src/main/core/WindowsHelperInstaller.ts`：仅 main AppHelper 持有安装执行生命周期。
- `src/shared/WindowsHelperDisable.ts` → `src/main/core/WindowsHelperDisable.ts`：仅 main 权限切换持有停用执行生命周期，合并进行中的操作不变。
- `src/shared/WindowsPrivilegeTiming.ts` → `src/shared/OperationTiming.ts`：通用服务、环境和权限步骤共用观察器；基础 API 改用 `timeOperation`、`withOperationTiming` 等名称。固定 Windows 子进程计时标记内容仍兼容现有报告。

生产静态/动态导入、既有脚本导入、源码读取位置和对应 VM 依赖映射均同步调整；没有为旧内部路径再增加转导出文件。通用 `Helper.send`、`stopService` 公开调用形状、插件 host 桥及 Go Helper 协议不变。本次未调整 Go 源码，不需要因这些 TypeScript 内部整理升级 Helper 版本。

`shared` 中按原审查口径的 Windows 文件由 22 个变为 19 个。减少的一部分来自两个 main 文件迁移与计时文件改名，不能全部算作删除功能。`WindowsHelperFallback.ts` 仍较大，详细注释和显式参数会增加局部行数；本轮实质优化是去掉失效分支、隐式状态和现代入口的旧运输包装，未为了压缩行数删除兼容或保护能力。

### 7. 静态复核与验证边界

对 `src/scripts/configs` 的 1,005 个 TypeScript 文件进行源码解析，核对相关移动文件/新命名的静态与动态导入、命名导出；没有语法诊断或相关引用缺失。现代动作的 AST 调用列表没有旧 plan/命令/TEMP 构造调用，也没有残余可变 scoped-root 全局声明。

再次检索，旧身份 ALS、CSV 解析、多根便利查询、计时旧名与迁移前的 Helper 文件引用已清除。`git diff --check` 未报告补丁空白错误；Git 对部分已有 CRLF 文件提示未来归一化，不代表运行失败。

没有运行测试、构建、类型检查、真实 UAC/Helper 安装或系统写入。上述结果只证明本轮静态语法、引用和代码路径核对，不代表 Windows 实机、插件或跨账户行为已经通过运行验证。
