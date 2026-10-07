# 端口/进程工具交互式 sudo 查杀

## 范围与操作契约

用户明确授权：端口查杀和进程查杀增加 sudo 勾选项；勾选后在 XTerm 弹窗输入
sudo 密码执行 kill。选项默认为 false、仅 Unix 显示，输入/选择/确认框属于页面，
选项不持久化；正常 kill 保留现有普通权限 IPC。

- 进程查询复用普通 `/bin/ps` 的全量表与既有 ProcessSearch，不读取 socket fd；
  先验证普通用户可见 capability 进程及系统用户进程，查询错误不伪装成零匹配。
- PortKill / ProcessKill 模块控制器拥有查询、停止、快照、进度、终态、提示和重入。
  页面仅绑定状态与命令；ProcessKill 收回页面 IPC 至模块局部 reactiveBind 单例。
- sudo 路径复用现有 XTermExecDialog / XTerm，以 Tools 模块内任务承载终端；
  全模块共用一次终端停止任务；相同目标复用正在进行的任务，不同目标拒绝并提示忙碌。
- 点击确认前固定 PID 和 sudo 选项，命令仅可包含合法数字 PID，使用固定
  `/usr/bin/sudo /bin/kill -9 -- ...`；用户的密码只经终端键盘传给 PTY/sudo。
- 终端挂载、发送和真实退出是必要步骤；使用 `send(commands, 'direct', true)`，
  非零退出、挂载错误、取消均不能报告成功，不能自动改走 Helper 或重放 kill。
- 弹窗关闭/取消负责终止并销毁本任务 PTY，等待中的 send 被 stop 解开时仍保持
  取消结果；真实命令已完成时关闭弹窗保留实际完成结果。
- 寿命不依赖入口页面；通过 document.body 的既有弹窗保持终端，页面切换/重入
  不丢失正在进行的停止。弹窗关闭后释放重入 guard 和终端资源。
- 查询 IPC code 200 留存，code 0 成功、其他为失败，终态 off；最新请求胜出。
  停止后的刷新是附加动作，必须取新快照，其失败不能否定已完成的 kill。
- 无新 Pinia、共享配置、持久化、服务生命周期或 root Helper 能力；Helper 保持 v47。

## 验证

采用先失败再修复的回归：普通进程查询、ProcessKill 查询/停止错误、sudo/普通权限
路由、PID 与选项快照、终端退出/取消/初始化失败、关闭清理与重复执行、停止与查询
重叠的刷新；然后运行既有 renderer 边界、终端、进程回归及相关构建/lint。
系统验收只终止测试创建的进程，不结束用户的现有服务。

## 实现与验收结果

- `ProcessControl/Controller.ts` 在 Tools 内复用查询/停止策略；Windows 已有嵌套
  返回值先递归展开再建树，全部查杀包含子孙，进程页查询/停止错误保留真实失败。
- 两页新增默认关闭的 `sudo` 选项，仅 Linux/macOS 显示；点击确认前固定目标和选项。
  模块局部 `SudoKillTask` 复用现有 XTerm 弹窗并校验真实退出码，弹窗关闭完成清理。
- `XTerm` 键盘与程序写入通过 sensitive IPC 发送，fire-and-forget 写入不登记回调；
  停止/销毁/终态释放执行监听器。sudo 命令直接写入 PTY，复用已有 inline shell
  封装和真实 onExit 回包，不生成临时脚本，不增加 Helper 能力。
- Debian ARM64 原生验收：普通 UID1000 的 `/bin/ps` 经生产 parse/search 可找到
  UID1000 + CAP_NET_BIND_SERVICE 的 sleep PID3612（CapEff/CapAmb 均 0400）
  及 root sleep PID3613，证明进程查询无需端口查询所需的 fd 访问权限。
  固定 sudo kill 命令仅结束这两个本轮创建的进程，退出码 0、两个进程均 SIGKILL；
  macOS `/bin/kill -9 -- <PID>` 对本轮创建的 sleep 语法/结束验收通过。
- 新回归已先验证失败再修复：终端退出/取消/挂载中关闭/初始化失败/重入、真实 IPC
  输入隐私与取消清理、普通/sudo 路由、确认快照、Windows 子孙保留及直接执行不生成文件。
  既有端口控制器、renderer 操作边界、Unix 进程与 MacPorts 终端回归通过；独立复审
  无剩余重要问题。
- Linux 构建触发 86 → 87；Helper 仍 v47。未提交、推送、安装发布包或执行 GUI
  手动输入密码验收，真实 sudo 退出/权限的 UI 终态由 PTY/IPC 回归验证。
- 完整 renderer 生产构建及 main 等价生产编译通过（输出 `/tmp/flyenv-sudo-*`），
  相关 ESLint 通过；全量 vue-tsc 仍 65 条既有诊断，改动文件无诊断。renderer
  首次因默认 Node 堆上限退出，提高构建进程堆上限至 8 GiB 后通过，未修改项目配置。

## 交互收尾

用户要求两个页面 sudo 选项与左侧按钮垂直居中，并在终端输出绿色完成提示。
两页按钮行采用 flex/items-center，checkbox 增加左侧间距；既有 SudoKillTask
直接命令尾记录 kill 退出码，成功时 printf ANSI 绿色的本地化 `base.success`，
最后以原 kill 退出码退出。输出是附加提示，不能覆盖已执行 kill 的结果；失败或取消
不显示成功提示，不改变现有所有者、清理、重入及无临时脚本契约。
回归执行实际 `/bin/sh` 命令尾（首个 kill 替换为受控退出），验证绿色输出及非零结果保留。
