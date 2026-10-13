# Linux pgAdmin venv 缺少 pip

## 根因与修复范围

Debian 12 ARM64 现存 `/home/parallels/.config/FlyEnv/server/postgresql/pgadmin4/venv/pyvenv.cfg`
指向 `/usr/bin/python3.11`，版本 3.11.2；该 venv 的 `python -m pip --version`
报 `No module named pip`，`importlib.util.find_spec('ensurepip')` 返回 `None`。
旧代码仅检查 venv 目录存在，创建不完整时后续启动直接调用缺失的 pip。

这是现有安装流程内的有限修复：以私有 Python 文件判断是否需要创建 venv，使用
`--without-pip` 创建，再在确需安装 pgAdmin 时检查 pip；缺失时优先 ensurepip，
没有 ensurepip 时使用 PyPA 官方 get-pip.py（Python 3.9 使用兼容入口）。
不删除 venv、数据、日志或已完成初始化记录。网络下载与引导执行失败如实传播。

## 操作契约与失败边界

- owner/lifetime：renderer 仍由 PgAdminPanel 单例持有完整 open 操作；fork PostgreSQL
  模块持有安装和子进程生命周期。无新增 UI、Pinia、配置或共享服务状态；无需例外授权。
- start/intermediate：openPGAdmin；原首次安装通知仍为中间事件。
- terminal：原 ForkPromise resolve/reject；失败由既有 renderer 终态释放 loading/监听/通知。
- duplicate：原 PgAdminSingleFlight 合并 fork 请求；renderer opening 阻止重复调用。
- service：修复之前沿用现有 `_stopPGAdmin` 归属验证及停止；不改变 PostgreSQL 生命周期。
- 必要依赖：创建 venv、引导并验证 pip、安装 pgAdmin；任一步失败阻断依赖它的启动，
  保留已创建的目录和成功安装的组件供下次使用。无附加操作或提权。
- 验证范围：pip 已存在、ensurepip 修复、无 ensurepip 的官方引导、3.9 兼容入口、
  引导失败与引导后仍缺 pip，及既有 pgAdmin 生命周期回归；真实 Linux 使用隔离临时 venv。

## 验证结果

- `node_modules/.bin/tsx scripts/postgresql-pgadmin-pip-test.ts`：通过。
- 改动 TS 文件 eslint、`git diff --check`、fork esbuild 编译：通过。
- 本机 Python 3.12 临时 `--without-pip` venv：ensurepip 离线补齐 pip 25.3，通过。
- Debian 12 ARM64、Python 3.11.2、UID 1000 的临时 venv：确认无 pip/ensurepip，
  使用官方 get-pip.py 安装 pip 26.2.1 后验证通过；第二次调用直接复用，无下载。
- 首次 Linux 下载在 60 秒时因网速较慢失败；下载超时放宽到 180 秒后验证通过。
- 旧 `postgresql-pgadmin4-test.ts` 在 `pgAdminCommandOwned(command, ...)` 源码正则处
  失败；用 HEAD 原始测试和 HEAD 原始 PostgreSQL 源码复核，修改前同样失败。
- 未改动用户原有 venv，未安装发布包，也未执行 pgAdmin GUI 端到端验收。
