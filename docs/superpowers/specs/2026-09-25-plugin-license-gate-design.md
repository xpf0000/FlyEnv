# 插件市场许可证门禁与扫描加固设计

日期：2026-09-25

## 背景

- 插件市场（Settings → Plugin Market）此前安装/升级插件不做任何许可证校验。
- 插件扫描（`PluginManager.refresh()`）加载插件目录下任何含 `plugin.json` 的目录，且
  无状态记录的插件默认启用 —— 直接复制插件文件到数据目录即可绕过市场安装流程使用。

## 设计

### 1. 许可证门禁（安装/升级）

- 渲染端 `src/render/components/Setup/Plugins/index.vue`：读取 `SetupStore.isActive`
  （应用启动时 `main.ts` 已调用 `SetupStore().init()`，许可证变化经
  `APP-License-Need-Update` 广播刷新）。未激活时安装/升级按钮为 warning 色 + Lock
  图标，点击弹窗提示并跳转到许可证页。
- 主进程 `PluginManager.installInternal()`：下载前执行 `licenseCheck()`，默认实现为
  `verifyLicenseCode(global.Server.Licenses)`（RSA 公钥解密激活码并与 machineId 比对，
  公钥抽到 `src/shared/license.ts`，fork 端 App 模块复用）。校验失败直接抛错，
  防止绕过 UI 直接发 IPC。
- `IPCHandler` 收到 `APP-Licenses-Code` 时同步刷新 `global.Server.Licenses`（含空码
  清除），保证新激活/失效立即生效，无需重启。
- 已完成 token 迁移的插件，其启用/禁用/卸载不受门禁影响。

### 2. 扫描加固（防直接复制）

- `plugins.json` 状态文件升级到 version 2，每个安装记录写入
  `installToken = sha256(安装密钥 : pluginId : version : plugin.json 原文)`。
  安装密钥是首次使用时生成的随机值，持久化在数据目录的 `.plugin-install-secret`
  隐藏文件中（不在 `plugins/` 目录、不在 `plugins.json` 里）。不使用 machineId，
  因为 machineId 可能变化，会导致合法用户的已装插件被误判。
- 应用内密钥经 Electron `safeStorage` 用 OS 账户钥匙串加密存储
  （Keychain / DPAPI / 系统 keyring）：即使把密钥文件一起复制到别的机器，
  密文也无法解开，复制的插件会被拒绝加载；无系统加密能力的环境回退为明文存储。
  已存在的 `enc:` 密钥解密失败视为复制/篡改，阻断 token 校验；
  密钥文件缺失时生成新密钥，已有 token 因不匹配而拒绝加载；不可读时拒绝加载。
- `refresh()` 对非开发模式的选中记录执行 `assertScannedPluginAllowed`：
  无状态记录或无 `activeVersion` → 拒绝加载并记诊断；token 不匹配 → 拒绝。
- 兼容存量：version 1 状态文件（无 token）仅在许可证有效时回填 token；所有旧记录
  完成迁移后以 version 2 重写。
- 复制插件文件到目录：无状态记录 → 不加载。连同 plugins.json 一起复制到另一套
  FlyEnv 安装：密钥不同导致 token 不匹配 → 不加载。
- 开发模式 `FLYENV_PLUGIN_PATH` 绕过该守卫。
- 密钥文件不可读写时插件扫描拒绝加载，避免绕过 token 校验。

### 3. 测试注入

- `PluginManagerOptions.licenseCheck` 可注入；单元测试注入 `async () => licenseOk`，
  运行时 smoke 测试经 `FLYENV_PLUGIN_SMOKE=1` 在 `Application.ts` 注入放行。

## 已知局限

本项目开源，token 算法可被阅读源码后伪造；完全防护需要服务端签发 Ed25519 插件签名
（`docs/task/plugin.md` 已建议），作为后续工作。

## i18n

新增 `setup.pluginsLicenseRequiredTitle` / `setup.pluginsLicenseRequiredTips`，
写入 `en` 与 `zh`；其余语言与现有 plugins* key 一样经 vue-i18n 回退到 en。
