# MySQL Deep Dive

> **模块类型**: 数据库服务器  
> **模块标识**: `mysql`  
> **分析日期**: 2026-04-12  
> **分析基线版本**: 4.13.2

---

## Overview

MySQL 模块是 FlyEnv 中用于管理 MySQL 数据库服务的核心组件，支持多版本管理、多实例运行（Group 模式）、数据库管理和备份功能。模块提供了完整的数据库生命周期管理，包括安装、配置、启动/停止、用户管理和数据备份。

相关文档链接:
- [MariaDB](mariadb.md) - 同源分支，共享大部分实现
- [PostgreSQL](postgresql.md) - 另一种关系型数据库实现
- [MongoDB](mongodb.md) - NoSQL 数据库实现

---

## Architecture

### Component Hierarchy Diagram

```
MySQL Module
├── Fork Process (src/fork/module/Mysql/index.ts)
│   ├── Mysql Class (extends Base)
│   │   ├── _startServer()       # 启动主服务
│   │   ├── _stopServer()        # 停止主服务
│   │   ├── startGroupServer()   # 启动 Group 实例
│   │   ├── stopGroupService()   # 停止 Group 实例
│   │   ├── passwordChange()     # 密码修改
│   │   ├── getDatabasesWithUsers()  # 获取数据库列表
│   │   ├── addDatabase()        # 创建数据库
│   │   └── backupDatabase()     # 备份数据库
│   └── Base Class (src/fork/module/Base/index.ts)
│       ├── startService()       # 通用服务启动
│       ├── _stopServer()        # 通用服务停止
│       └── exec()               # IPC 命令分发
├── Renderer Process
│   ├── Module.ts                # 模块注册
│   ├── Index.vue                # 主界面
│   ├── aside.vue                # 侧边栏控制
│   ├── Config.vue               # 配置文件管理
│   ├── mysql.ts                 # Group 状态管理 (Pinia Store)
│   └── Manage/manage.ts         # 数据库管理逻辑
└── Configuration Files
    ├── my-{version}.cnf         # 主配置文件 (按版本)
    ├── data-{version}/          # 数据目录 (按版本)
    └── group/                   # Group 实例目录
        ├── my-group-{id}.cnf    # Group 配置文件
        ├── my-group-{id}.pid    # Group PID 文件
        └── group.json           # Group 配置持久化
```

### Data Flow Sequence

```
1. User Action (UI)
   │
   ▼
2. Renderer Component (Index.vue/aside.vue)
   │ IPC: app-fork:mysql
   ▼
3. Main Process (ForkManager)
   │
   ▼
4. Fork Process (BaseManager)
   │
   ▼
5. Mysql.exec() → Command Dispatch
   │
   ├──► _startServer() / _stopServer()
   ├──► startGroupServer() / stopGroupService()
   ├──► passwordChange()
   ├──► getDatabasesWithUsers()
   ├──► addDatabase()
   └──► backupDatabase()
```

Sources: src/fork/module/Mysql/index.ts:42-46 src/fork/module/Base/index.ts:34-43

---

## Data Model

### Core TypeScript Interfaces

| Interface | Location | Description |
|-----------|----------|-------------|
| `MysqlGroupItem` | src/shared/app.d.ts:91 | Group 实例配置项 |
| `SoftInstalled` | src/shared/app.d.ts | 已安装软件版本信息 |
| `OnlineVersionItem` | src/shared/app.d.ts:98 | 在线版本信息 |

### MysqlGroupItem

```typescript
export interface MysqlGroupItem {
  id: string                    // Group 实例唯一标识
  version: AppServerCurrent     // 关联的版本信息
  port: number | string         // 实例端口号
  dataDir: string              // 实例数据目录
}
```

Sources: src/shared/app.d.ts:91-96

### MySQLManage Types (Frontend)

```typescript
type MySQLDatabaseItem = {
  name: string      // 数据库名称
  users: string[]   // 有权限的用户列表
}

type MySQLDatabaseSavedItem = {
  database: string  // 数据库名
  user: string      // 关联用户
  mark: string      // 备注
}

type MySQLUserItem = Record<string, string>
```

Sources: src/render/components/Mysql/Manage/manage.ts:11-22

---

## Core Components

### 1. Mysql Class (Fork Process)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | void | 初始化 PID 路径 |
| `_startServer()` | version, skipGrantTables?, password? | ForkPromise | 启动 MySQL 服务 |
| `_stopServer()` | version | ForkPromise | 停止 MySQL 服务 |
| `startGroupServer()` | MysqlGroupItem | ForkPromise | 启动 Group 实例 |
| `stopGroupService()` | MysqlGroupItem | ForkPromise | 停止 Group 实例 |
| `passwordChange()` | version, user, password | ForkPromise | 修改用户密码 |
| `getDatabasesWithUsers()` | version | ForkPromise | 获取数据库和用户列表 |
| `addDatabase()` | version, data | ForkPromise | 创建数据库和用户 |
| `backupDatabase()` | version, databases[], saveDir | ForkPromise | 备份数据库 |
| `allInstalledVersions()` | setup | ForkPromise | 获取已安装版本 |
| `brewinfo()` | - | ForkPromise | 获取 Homebrew 版本 |
| `portinfo()` | - | ForkPromise | 获取 MacPorts 版本 |

Sources: src/fork/module/Mysql/index.ts:42-1264

### 2. Base Class (Parent)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `exec()` | fnName, ...args | ForkPromise | IPC 命令分发入口 |
| `startService()` | version, ...args | ForkPromise | 通用服务启动流程 |
| `_stopServer()` | version, ...args | ForkPromise | 通用服务停止流程 |
| `_linkVersion()` | version | ForkPromise | Homebrew 版本链接 |
| `waitPidFile()` | pidFile, errLog?, maxTime? | Promise | 等待 PID 文件生成 |

Sources: src/fork/module/Base/index.ts:26-447

### 3. MysqlStore (Frontend Pinia Store)

| State | Type | Description |
|-------|------|-------------|
| `inited` | boolean | 初始化状态 |
| `all` | MysqlGroupItem[] | Group 实例列表 |

| Action | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | - | Promise | 初始化 Store，加载 group.json |
| `save()` | - | Promise | 保存 Group 配置 |
| `start()` | MysqlGroupItem | Promise<true \| string> | 启动 Group 实例 |
| `stop()` | MysqlGroupItem | Promise<true \| string> | 停止 Group 实例 |
| `groupStart()` | - | Promise<true \| string> | 启动所有 Group 实例 |
| `groupStop()` | - | Promise<true \| string> | 停止所有 Group 实例 |

Sources: src/render/components/Mysql/mysql.ts:17-148

### 4. MySQLManage (Frontend Reactive)

| Property | Type | Description |
|----------|------|-------------|
| `userPassword` | Record<string, MySQLUserItem> | 用户密码缓存 |
| `backupDir` | Record<string, string> | 备份目录配置 |
| `updating` | Record<string, boolean> | 密码更新状态 |
| `backuping` | Record<string, boolean> | 备份进行状态 |
| `databaseRaw` | MySQLDatabaseItem[] | 原始数据库列表 |
| `databaseSaved` | Record<string, MySQLDatabaseSavedItem[]> | 保存的数据库配置 |

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init()` | flag | void | 初始化管理器 |
| `save()` | - | void | 持久化配置到 localForage |
| `passwordChange()` | item, user, password | Promise<boolean> | 修改密码 |
| `fetchDatabase()` | item | Promise<MySQLDatabaseItem[]> | 获取数据库列表 |
| `addDatabase()` | item, data | Promise<boolean> | 创建数据库 |
| `backupDatabase()` | item, databases[] | Promise<boolean> | 备份数据库 |

Sources: src/render/components/Mysql/Manage/manage.ts:42-89

---

## Lifecycle Management

### Service Startup Flow

```
startService() [Base]
    │
    ├──► Version Validation
    │    └── Check binary exists (non-Windows)
    │
    ├──► Link Version (Homebrew)
    │    └── brew unlink && brew link --force
    │
    ├──► Stop Existing
    │    └── _stopServer() → Kill processes
    │
    └──► _startServer() [Mysql]
         │
         ├──► Check/Create Config
         │    └── my-{version}.cnf (if not exists)
         │
         ├──► Check Data Directory
         │    ├── Exists & Non-empty → Skip init
         │    └── Empty/Missing → Initialize
         │        │
         │        ├──► Windows: mysqld --initialize-insecure
         │        ├──► MySQL < 5.7: mysql_install_db
         │        └──► MySQL >= 5.7: mysqld --initialize-insecure
         │
         ├──► Start Server
         │    ├──► Windows: serviceStartExecCMD()
         │    └──► Unix: serviceStartExec()
         │
         └──► Init Password (first time)
              └── _initPassword() → mysqladmin password
```

### Service Stop Flow

```
_stopServer() [Mysql overrides Base for Windows]
    │
    ├──► Collect PIDs
    │    ├── App PID file (pid/mysql.pid)
    │    └── version.pid
    │
    ├──► Windows Specific
    │    ├── Try graceful shutdown via mysqladmin
    │    │   └── mysqladmin.exe --defaults-file=... shutdown
    │    └── Force kill if needed (taskkill /f /t)
    │
    └──► Unix (Base._stopServer)
         ├──► Collect process list
         ├──► Search for 'mysqld' processes
         │    └── Filter by BaseDir/AppDir
         └──► Send SIGTERM (-TERM)
              └── waitTime(500) for process exit
```

### Group Instance Lifecycle

```
startGroupServer(MysqlGroupItem)
    │
    ├──► stopGroupService() // Ensure clean state
    │
    ├──► Check/Create Config
    │    └── group/my-group-{id}.cnf
    │
    ├──► Check Data Directory
    │    └── Initialize if empty (same as main)
    │
    └──► Start Instance
         ├──► Windows: serviceStartExecCMD() + batch script
         └──► Unix: serviceStartExec()

stopGroupService(MysqlGroupItem)
    │
    ├──► Windows: ProcessListSearch → taskkill
    └──► Unix: ps aux → grep → kill -TERM
```

Sources: src/fork/module/Mysql/index.ts:112-173 src/fork/module/Mysql/index.ts:175-414 src/fork/module/Mysql/index.ts:416-767

---

## Configuration System

### Main Configuration (my-{version}.cnf)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `bind-address` | 127.0.0.1 | 仅允许本地连接 |
| `sql-mode` | NO_ENGINE_SUBSTITUTION | SQL 模式 |
| `datadir` | {MysqlDir}/data-{version} | 数据目录 |
| `port` | 3306 | 服务端口号 |

### Dynamic Configuration (Config.vue)

| Setting | Section | Default | Version Specific |
|---------|---------|---------|------------------|
| `port` | mysqld | 3306 | - |
| `key_buffer_size` | mysqld | 64M | - |
| `query_cache_size` | mysqld | 32M | MySQL 5.x only |
| `tmp_table_size` | mysqld | 64M | - |
| `innodb_buffer_pool_size` | mysqld | 256M | - |
| `innodb_log_buffer_size` | mysqld | 32M | - |
| `sort_buffer_size` | mysqld | 1M | - |
| `read_buffer_size` | mysqld | 1M | - |
| `read_rnd_buffer_size` | mysqld | 256K | - |
| `thread_cache_size` | mysqld | 32 | - |
| `table_open_cache` | mysqld | 256 | - |
| `max_connections` | mysqld | 500 | - |

Sources: src/render/components/Mysql/Config.vue:60-170

---

## API/IPC Interface

### Command List

| Command | Parameters | Action | Returns |
|---------|-----------|--------|---------|
| `startService` | SoftInstalled | 启动主服务 | `{APP-Service-Start-PID}` |
| `_stopServer` | SoftInstalled | 停止主服务 | `{APP-Service-Stop-PID: []}` |
| `startGroupServer` | MysqlGroupItem | 启动 Group 实例 | boolean |
| `stopGroupService` | MysqlGroupItem | 停止 Group 实例 | `{APP-Service-Stop-PID: []}` |
| `passwordChange` | SoftInstalled, user, password | 修改用户密码 | boolean |
| `getDatabasesWithUsers` | SoftInstalled | 获取数据库列表 | `{list, databases, dbPrivileges, globalUsers, allUsers}` |
| `addDatabase` | SoftInstalled, data | 创建数据库 | `{userExists}` |
| `backupDatabase` | SoftInstalled, databases[], saveDir | 备份数据库 | error[] |
| `allInstalledVersions` | setup | 获取已安装版本 | SoftInstalled[] |
| `brewinfo` | - | 获取 Homebrew 信息 | `{[name]: brewInfo}` |
| `portinfo` | - | 获取 MacPorts 信息 | `{[name]: portInfo}` |

### IPC Communication Pattern

```typescript
// Renderer → Fork
IPC.send(`app-fork:mysql`, 'commandName', ...args)
  .then((key: string, res: any) => {
    IPC.off(key)
    if (res.code === 0) {
      // Success: res.data
    } else if (res.code === 1) {
      // Error: res.msg
    } else if (res.code === 200) {
      // Progress: res.msg (log)
    }
  })
```

Sources: src/fork/module/Base/index.ts:34-43 src/render/components/Mysql/mysql.ts:56-77

---

## UI Components

### Component Structure

```
Mysql/
├── Module.ts           # 模块注册定义
├── Index.vue           # 主界面 (Tab 容器)
├── aside.vue           # 侧边栏服务控制
├── Config.vue          # 配置文件管理
├── Logs.vue            # 日志查看
├── mysql.ts            # Group Store
├── Group/
│   ├── Index.vue       # Group 管理主界面
│   ├── Add.vue         # 添加 Group 实例
│   ├── Config.vue      # Group 配置编辑
│   └── Logs.vue        # Group 日志查看
└── Manage/
    ├── index.vue       # 数据库管理界面
    ├── manage.ts       # 管理逻辑
    ├── addDatabase.vue # 创建数据库
    ├── database.vue    # 数据库列表
    └── setPassword.vue # 设置密码
```

### Module Registration

```typescript
const module: AppModuleItem = {
  moduleType: 'dataBaseServer',    // 模块类型
  typeFlag: 'mysql',               // 唯一标识
  label: 'MySQL',                  // 显示名称
  icon: import('@/svg/mysql.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 6,                   // 侧边栏排序
  isService: true,                 // 是服务模块
  isTray: true                     // 在托盘显示
}
```

Sources: src/render/components/Mysql/Module.ts:1-15

---

## Platform Differences

| Feature | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| 启动方式 | serviceStartExec | serviceStartExecCMD | serviceStartExec | Windows 使用 CMD 包装 |
| 停止信号 | SIGTERM (-TERM) | taskkill /f /t | SIGTERM (-TERM) | MySQL 使用 SIGTERM |
| PID 文件 | /tmp/mysql.sock | FlyEnv-Data/pid/ | /tmp/mysql.sock | Windows 使用命名管道 |
| 初始化命令 | mysqld --initialize-insecure | Same | Same | < 5.7 使用 mysql_install_db |
| 配置路径 | ~/Library/PhpWebStudy-Data/ | C:\Program Files\FlyEnv-Data\ | ~/.config/FlyEnv/ | 数据目录差异 |
| 密码修改 | socket 连接 | named pipe 连接 | socket 连接 | 协议差异 |
| MacPorts 支持 | Yes | N/A | N/A | 特殊路径处理 |

### Version-Specific Password Handling

| MySQL Version | Auth Method | Command |
|---------------|-------------|---------|
| >= 8.0.0 | caching_sha2_password | `ALTER USER ... IDENTIFIED WITH caching_sha2_password BY 'pwd'` |
| 5.7.6 - 8.0 | mysql_native_password | `ALTER USER ... IDENTIFIED BY 'pwd'` |
| < 5.7.6 | mysql_old_password | `UPDATE mysql.user SET Password=PASSWORD('pwd')` |

Sources: src/fork/module/Mysql/index.ts:880-986 src/fork/module/Mysql/index.ts:52-110

---

## Database Management

### Password Change Flow

```
passwordChange(version, user, password)
    │
    ├──► Start with skip-grant-tables mode
    │    └── _startServer(version, true, password)
    │
    ├──► Wait 1s for server ready
    │
    ├──► Connect via socket/pipe
    │
    ├──► Execute ALTER USER (8.0+)
    │    └── FLUSH PRIVILEGES; ALTER USER ...
    │
    ├──► Update version.rootPassword
    │
    └──► Stop server (super._stopServer)
```

### Database Creation Flow

```
addDatabase(version, {database, user, password, charset})
    │
    ├──► Ensure service running
    │
    ├──► Connect as root
    │    └── host: 127.0.0.1, user: root, password: rootPassword
    │
    ├──► FLUSH PRIVILEGES
    │
    ├──► CREATE DATABASE
    │    └── CHARACTER SET {charset}
    │
    ├──► Check plugin (caching_sha2_password)
    │
    ├──► CREATE USER / ALTER USER
    │    └── Handle version-specific syntax
    │
    ├──► GRANT ALL PRIVILEGES
    │    └── ON `{database}`.* TO '{user}'@'localhost'
    │
    └──► FLUSH PRIVILEGES
```

### Backup Flow

```
backupDatabase(version, databases[], saveDir)
    │
    ├──► Validate saveDir is absolute path
    │
    ├──► Ensure saveDir exists (mkdirp)
    │
    ├──► Find mysqldump binary
    │    └── Windows: mysqldump.exe, Unix: mysqldump
    │
    ├──► Read port from config
    │
    ├──► For each database:
    │    └── Execute: mysqldump -uroot -p{pass} --port={port} ... {db} > {file}
    │
    └──► Return error array (empty = success)
```

Sources: src/fork/module/Mysql/index.ts:880-986 src/fork/module/Mysql/index.ts:1110-1214 src/fork/module/Mysql/index.ts:1216-1262

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| PID file not found | Server failed to start | Check error log in {MysqlDir}/error.log |
| Port already in use | Another MySQL running | Change port in config or stop other instance |
| Permission denied | Data dir permissions | Ensure 0777 on data directory |
| Password change fails | Authentication plugin mismatch | Use skip-grant-tables mode |
| Group start fails | Config file missing | Regenerate my-group-{id}.cnf |

### Debug Logging

Log files location:
- Error log: `{MysqlDir}/error.log`
- Slow query log: `{MysqlDir}/slow.log`
- Group error log: `{MysqlDir}/group/my-group-{id}-error.log`

Sources: src/fork/module/Mysql/index.ts:187-189 src/fork/module/Mysql/index.ts:480-482

---

*本文档遵循 DeepWiki 技术分析标准*
