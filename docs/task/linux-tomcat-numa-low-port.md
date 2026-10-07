# Linux Tomcat / NUMA 低端口启动修复

## 原因与实现

现有 `serviceStartSpawn` 可按已知监听端口选择 Linux `service.launchLowPort`，
但 Tomcat / NUMA 没有启用，Helper 白名单也没有对应启动形式。
复用该固定 RPC、普通账户凭据和 `CAP_NET_BIND_SERVICE`，不增加通用 root 执行接口。
Tomcat 只允许 `catalina.sh run`，并检查数据根内的 CATALINA_BASE / CATALINA_PID；
NUMA 只允许 `numa <数据根内配置文件>`。
读取实际 XML / TOML 监听端口，兼顾系统端口阈值；配置读取失败只影响端口预判，
保留现有普通启动及明确 bind 权限错误回退，真实启动失败仍传播。

## 操作契约与约束

- Owner：复用 ModuleInstalledItem 生命周期与 fork Tomcat / Numa / ServiceStart；Helper 只负责降权并启动。
- Lifetime：已有 start 请求至 PID 登记或失败；进程由 fork 的既有停止逻辑管理。
- Events：沿用 APP-On-Log 等中间事件和 APP-Service-Start-PID 成功 / reject 失败终态。
- Duplicate / re-entry：沿用已有公共生命周期，不新增 UI 操作状态或 IPC 监听。
- Service interaction：Tomcat 前台脚本 exec JVM；NUMA 保留现有 PID 发现；不新增 companion。
- 新模块约束：不新增持久化、Pinia、公共模块字段或单独 start/stop 流程；无例外授权需求。
- 必要步骤：配置初始化、服务启动；失败阻断本服务并如实返回。PID 落盘按既有契约报告。
- 附加步骤：监听端口预判；失败不得把有效配置启动全局阻断，不重放已经成功的启动。

## 实施与验证

- [x] 先增加实际模块启动回归，证明低端口路由缺失；Go 回归覆盖固定启动形式及越界拒绝。
- [x] 补充模块内端口解析和 Helper 两种固定启动校验。
- [x] 同步 Helper 发布版本 v46 与六种平台产物，确保旧 Helper 不被误认兼容。
- [x] 执行模块/公共启动回归、Go 测试与 Linux 交叉编译/vet、版本检查及 fork 构建。
- [x] 独立 review 失败边界，两项 NUMA 监听遗漏已修复并通过 RED→GREEN 回归。

### 验证记录

- `yarn test:linux-tomcat-numa-start`：RED→GREEN，覆盖真实模块调用、XML 注释、多 Service、
  portOffset、NUMA IPv6 DNS/API/启用与禁用代理、端口预判失败、真实启动失败及 macOS 路由。
  复查后补充默认配置、DNS 多监听地址、默认/自定义 DoT、显式禁用低端口监听、默认代理和移动 API。
- `scripts/linux-service-start-test.ts`：通过，已有系统端口阈值、直接启动与新 bind 错误回退规则保持。
- `TestLinuxServiceBusinessOptions`：从实际源码提取校验函数、共享路径函数与测试至临时 Go 包，
  macOS 上验证新增服务先因白名单缺失失败，实施后通过；完整 Linux 包仅交叉编译，未原生执行。
- Go `test ./...` / `vet ./...`（macOS）：通过；Linux amd64 的全包 test 交叉编译与 vet：通过。
- Helper contract / version、Linux 安装流程、传输与帮助程序错误链路：通过。
- fork 使用现有生产配置等效的 esbuild 参数构建：通过；改动 TS 文件 ESLint：通过。
- 全项目 vue-tsc 仍有 65 条诊断，本次模块与新增脚本无诊断；未修复已有类型问题。
- `src/helper-go/dist` 中 Darwin/Linux/Windows 两种架构的六份二进制已重建；未安装系统 Helper。

初次验证命令中的默认 Go 在 Helper 子目录为 1.23.3，改用已安装的 1.24.5；
直接 tsx 导入完整 esbuild 配置触发已有 node-machine-id CJS 问题，改用等效 CLI 构建。

### Review 修复

独立 reviewer 发现 NUMA 端口扫描遗漏了默认 DoT 853，以及缺省 DNS / proxy 配置和
`bind_addr` 数组。依据 [NUMA 配置源码](https://github.com/razvandimescu/numa/blob/main/src/config.rs)
补齐 DNS 53、API 5380、默认启用的 proxy 80/443、默认启用的 DoT 853，
以及显式启用的 mobile API（默认 8765）。
[NUMA 启动源码](https://github.com/razvandimescu/numa/blob/main/src/serve.rs) 将代理/DoT
放在后台任务中，其绑定失败不会保证主进程退出，因此这些端口必须在启动前识别。
新增断言先验证 DoT 遗漏失败，补齐后再验证缺省配置遗漏失败，最后全部通过；
显式关闭 proxy / DoT 的高端口配置仍无需低端口能力。未发现 Tomcat 或特权边界阻断问题。

当前环境是 macOS，Linux 真实 80/53 监听、JVM 能力继承与 root Helper 部署需 Linux 验收。
