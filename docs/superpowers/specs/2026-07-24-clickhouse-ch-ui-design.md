# ClickHouse CH-UI 管理入口设计

- 日期：2026-07-24
- 状态：已确认

## 目标

在 ClickHouse 的服务页中，服务运行时显示与 Mailpit 相同的网络图标。点击该图标后，FlyEnv 自动下载（仅首次）、启动 CH-UI 并在系统浏览器中打开本地管理页。

## 已确认的产品决策

- 使用官方 `caioricciuti/ch-ui` 发布的原生二进制；许可证为 Apache-2.0。
- 不引入 Docker、PHP、虚拟主机或管理员权限。
- 仅支持 ClickHouse 已支持的平台：macOS 与 Linux；根据 `process.arch` 选择 amd64 或 arm64 资产。
- 首次安装使用 GitHub Releases 的 `latest/download/ch-ui-{darwin|linux}-{amd64|arm64}` URL。二进制已存在时不自动升级，只启动已有文件。
- 接受官方 CH-UI 当前监听所有网卡的行为；FlyEnv 打开地址仍固定为 `http://127.0.0.1:3488`。
- CH-UI 是按需启动的辅助管理服务；停止 ClickHouse 不自动停止 CH-UI。

## 架构

渲染端只负责展示网络图标、避免重复点击、调用 `app-fork:clickhouse/openCHUI` 并使用 `shell.openExternal` 打开 fork 返回的 URL。下载、状态目录初始化、ClickHouse HTTP 端口解析、子进程启动和 pid 校验均留在 ClickHouse fork 模块。

新增的纯函数文件只保存平台资产名、下载 URL、CH-UI YAML 内容和 ClickHouse XML HTTP 端口解析规则，使下载/启动配置能以独立脚本回归测试。`Manager.openCHUI()` 组合这些函数：确保二进制存在，写入 `server.yaml`，若 pid 对应的 CH-UI 进程不存在则通过 `serviceStartSpawn` 启动，再返回浏览器 URL。

## 文件与状态边界

| 用途 | 路径 |
| --- | --- |
| 官方二进制 | `global.Server.AppDir/ch-ui/ch-ui` |
| 下载缓存 | `global.Server.Cache/ch-ui-{平台}-{架构}` |
| CH-UI 根目录 | `global.Server.ClickHouseDir/ch-ui` |
| CH-UI 配置 | `.../ch-ui/server.yaml` |
| CH-UI SQLite 状态 | `.../ch-ui/data/ch-ui.db` |
| FlyEnv 维护的 pid | `.../ch-ui/ch-ui.pid` |
| 启动 stdout/stderr | `.../ch-ui/log/ch-ui.start.{out,error}.log` |

`server.yaml` 固定把 SQLite 数据放入上述目录，并记录当前 ClickHouse URL 与连接名。每次打开前从 `config.xml` 的 `<http_port>` 读取端口；不存在、非法或超出范围时退回 8123。ClickHouse 的监听地址仍按本模块现有默认值使用 `127.0.0.1`。

## 失败处理

- GitHub 下载、文件复制、`chmod` 或 `ch-ui --version` 失败时，fork 返回错误；渲染端关闭加载状态并显示现有的错误提示组件。
- 3488 被其他进程占用或 CH-UI 在两秒启动窗口内退出时，`serviceStartSpawn` 返回启动失败；不会打开浏览器。
- 仅当 pid 存在且进程命令行包含 FlyEnv 管理的 CH-UI 二进制路径时，才视为已运行；陈旧 pid 文件会删除并重新启动。
- ClickHouse 自定义 HTTP 端口会在下一次打开管理页面时生效；CH-UI 的登录凭据继续由其自身登录页管理，FlyEnv 不传递或保存密码。

## 验收标准

1. ClickHouse 未运行时，服务页不出现 CH-UI 网络图标。
2. ClickHouse 运行时，图标显示；首次点击下载官方当前平台资产、写入 FlyEnv 私有状态目录、启动 CH-UI，并打开 `http://127.0.0.1:3488`。
3. 再次点击不重新下载，也不重复启动 pid 对应的 CH-UI；直接打开管理页。
4. 自定义 `<http_port>` 被传给 CH-UI；缺失或非法配置回退 8123。
5. 单元式回归脚本覆盖平台资产 URL、状态配置、端口解析和服务页入口；TypeScript、ESLint 与现有 ClickHouse 回归测试通过。
