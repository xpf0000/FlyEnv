# SignPath 接入 — 待办与说明

本文件记录 FlyEnv 接入 SignPath 代码签名的进度。**「我已完成」** 是代码层面已经改好的;**「你需要处理」** 是只能在 SignPath / GitHub 后台手工操作的部分。

---

## 当前进度(2026-06-19)

✅ **测试阶段已完成。** 两段签名链路全部跑通,SignPath 后台 Signing Requests 两条记录均 Completed:
- `windows-installer`(test-signing)— 签 `FlyEnv-Setup/Portable-*.exe`,origin 已识别(master / commit 18e06ca)
- `windows-helper`(test-signing)— 签 `flyenv-helper-windows-*.exe`,origin verification + malware scan 均通过

🆕 **已扩展为「全量 PE 签名」。** 之前只签 helper + 安装器外壳,安装后的 `FlyEnv.exe` 及各 dll 仍未签。现改为在打包前对 `win-unpacked/` 内**所有 PE**(exe/dll/.node/helper)批量签名。`windows-helper` 配置已被 `windows-app` 取代(见下)。

⏭️ **下一步:在后台新建 `windows-app` artifact configuration,然后切生产证书。** 见文末「切生产 checklist」。

---

## 当前确认的信息(来自后台截图)

| 项 | 值 |
| --- | --- |
| Organization | `FlyEnv [OSS]` |
| Organization ID | `4db4007d-ac9e-4889-a8d5-52d4a421d989` |
| Project slug | `FlyEnv` |
| Signing Policy(测试) | `test-signing`(VALID,自签测试证书,有效期至 2029-06-17) |
| Signing Policy(生产) | `release-signing`(INVALID — 生产证书 CSR 仍 PENDING,需等基金会签发) |

---

## 我已完成(代码层面)

1. **Artifact 配置 XML**(放仓库 `build/signpath/`,同时需粘到后台):
   - `app.artifact-configuration.xml` →(slug `windows-app`)**新**:`<zip-file>` 内用 `**/*.exe`/`**/*.dll`/`**/*.node` 通配,`min-matches="0" max-matches="unbounded"`,签整包所有 PE。(`**/*` 已覆盖根目录文件,经 SignPath artifact-description 验证;不要再加 `*.exe`/`*.dll`,否则根目录文件会被签两次。)
   - `installer.artifact-configuration.xml` →(slug `windows-installer`):签 `FlyEnv-Setup/Portable-*.exe`。
   - `helper.artifact-configuration.xml` →(slug `windows-helper`):**已被 `windows-app` 取代**,可在后台保留或删除,workflow 不再引用。

2. **全量 PE 签名钩子**:`build/afterPackSign.ts`
   - **主签名(afterSign 阶段)**:在 `signApp` 跑完 rcedit **之后**、NSIS 打包之前,遍历 `win-unpacked/` 收集所有 `.exe/.dll/.node`(含 helper),按相对路径打成 zip → PowerShell `Submit-SigningRequest`(配置 `windows-app`)→ 覆盖回原位。放 afterSign 是因为 `signApp` 对 `FlyEnv.exe` 跑 rcedit(改版本号/图标/manifest)会抹掉签名,必须在其后签。
   - **`customSign` 钩子(NSIS 阶段)**:`elevate.exe`(UAC 提权工具)和卸载器是 NSIS 打包阶段才生成的,afterSign 够不着。挂在 `win.signtoolOptions.sign`,electron-builder 复制 elevate.exe 后会触发;钩子只对白名单(`elevate.exe`/含 `uninstall`)真签、其余 PE no-op,避免逐文件签整包。只在首个 hash(`isNest=false`)处理,防重复请求。
   - **动态跳过已签名文件**:打包前对每个 PE 跑 `Get-AuthenticodeSignature`,`Status=Valid`(如微软自带 `d3dcompiler_47.dll`)的跳过;并用 `MZ` 文件头校验剔除伪装成 PE 的非 PE 文件(如多平台 `.node`)。
   - 守卫:无 `SIGNPATH_API_TOKEN` 时跳过(本地构建不受影响)。

3. **改造 Windows 构建流程**:`.github/workflows/windows-version-build.yml`
   - 新增 `Install-Module SignPath` 步骤。
   - 给 `yarn build` 注入 `SIGNPATH_*` 环境变量(token + org/project/policy/app-config-slug)。
   - **移除**了打包前那段独立的 "Sign helper" 步骤(helper 现由 `afterPack` 批量覆盖)。
   - 打包后的 installer 签名步骤(`windows-installer`)保留不变。

4. **`configs/electron-builder.win.ts`**
   - 注册 `afterPack: AfterPackSign`(保留 `afterSign` 移 helper 逻辑——移动不破坏签名)。
   - 此前已移除失效的 `signExts`。

---

## 你需要处理(后台手工操作)

### 1. 在 SignPath 后台创建 Artifact Configuration
进入 Project `FlyEnv` → **Artifact Configurations**,确保存在:

| 文件 | 建议 slug | 用途 |
| --- | --- | --- |
| `build/signpath/app.artifact-configuration.xml` | `windows-app` | **新增,必建**:打包前签整包所有 PE |
| `build/signpath/installer.artifact-configuration.xml` | `windows-installer` | 打包后签安装器/便携版外壳 |

- 粘 XML 时**只粘 `<artifact-configuration>` 元素本身**(不要 `<?xml?>` 声明、不要注释,否则后台报 `xml-file` 无效)。
- `windows-helper` 不再需要,可保留或删。

### 2. 创建 SignPath API Token 并加到 GitHub Secrets
- SignPath 右上角用户 → **API Tokens** → 生成一个用于 GitHub Actions 的 token(关联 `CI builds` 这个 submitter 用户)。
- GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret:
  - Name: `SIGNPATH_API_TOKEN`
  - Value: 刚生成的 token

### 3. 触发一次 Windows 构建做测试签名
- workflow 触发条件是 push 改动 `build/windows.build.yml`。把里面的 `version` 数字 +1(如 84 → 85)提交即可触发。
- 跑完后:在 SignPath 后台 **Signing Requests** 应能看到**两条** `test-signing` 记录(`windows-app` 批量 + `windows-installer`)。
- 重点验证:安装后到安装目录,确认这些都带数字签名(右键 → 属性 → 数字签名):
  - `FlyEnv.exe`(主程序)
  - `resources/helper/flyenv-helper.exe`(helper)
  - 主程序目录下的各 `.dll`、native `.node` 模块

### 4. 通知 SignPath 验收 → 切生产
- 测试签名跑通后,回复 Phillip 的邮件,告知 setup 已完成、可以 review。
- 他们 review → 下单生产证书 → 导入组织、`release-signing` 变为 VALID。
- 届时把 workflow 里 `signing-policy-slug: 'test-signing'` 改成 `'release-signing'`(建议届时再加 origin verification,见下)。

---

## 需要你确认 / 决策的问题

1. **helper 签名(已按「必须签名」实现)**
   `flyenv-helper.exe` 被打进安装包内部,是 Windows 上被杀软拦截的主要对象。已改为**两段签名**:打包前先单独签 helper,再打包,最后签外层。无需你额外决策,只要在后台建好 `windows-helper` 配置即可。
   - 注意:helper 编译输出名为 `flyenv-helper-windows-amd64-v1.exe`(arm64 则为 `flyenv-helper-windows-arm64.exe`),SignPath 签名后按原名覆盖回 `src/helper-go/dist/`,electron-builder 再重命名为 `flyenv-helper.exe` 打包。重命名**不影响**已有的 Authenticode 签名。

2. **自动更新的 hash 一致性(重要)**
   electron-builder 生成的 `latest.yml` / `*.blockmap` 里记录的是**未签名** exe 的 SHA512。SignPath 事后重新签名会改变 exe 内容,导致 `latest.yml` 的 hash 与签名后 exe 不匹配 → 若启用了 electron 自动更新,校验会失败。
   - 当前 `electron-builder.win.ts` 的 `publish: []` 为空,看起来未走 electron 内置自动更新,影响可能不大。
   - 若以后启用自动更新,需要在签名**之后**重新生成 `latest.yml`/`blockmap`(或改用「打包前签名」的方案)。先记录,测试阶段不阻塞。

3. **origin verification(切生产前建议开)**
   后台显示当前 test-signing 未开 trusted build system / origin 校验。切到 release 前,建议在 SignPath 配置 GitHub trusted build system,限定只接受来自本仓库特定 workflow 的签名请求,提升安全性。

---

## 参考链接
- Artifact configuration 语法:https://docs.signpath.io/artifact-configuration/syntax
- GitHub 集成:https://docs.signpath.io/trusted-build-systems/github
- Action 仓库:https://github.com/SignPath/github-action-submit-signing-request

---

## 切生产 checklist(测试已通过,按顺序做)

### 1. 回邮件让 SignPath 验收(立刻)
- 回复 Phillip,告知测试证书已跑通(helper + installer 两条 Signing Request 均 Completed),setup 完成,请 review 并签发生产证书。
- 邮件草稿见 `docs/task/signpath/email-draft.md`,把里面两条 Signing Request 的 URL 补上后发出。

### 2. 等待生产证书导入
- SignPath review 通过 → 下单正式证书 → 导入组织。
- 完成后,后台 `release-signing` policy 会从 INVALID 变 **VALID**。这一步在他们那边,只能等。

### 3.(建议)切生产前锁定 origin / trusted build system
- SignPath 后台 → **Trusted Build Systems** → 配置 GitHub,绑定本仓库。
- 在 `release-signing` policy 上要求 origin 必须来自本仓库的指定 workflow(防止他人拿 token 从别处发起签名)。
- 测试详情页已能「识别」origin,这一步是把它从记录提升为**强制校验**。

### 4. 切换 signing policy(等 release-signing VALID 之后)
需要把 `test-signing` 改成 `release-signing`,共**两处**:

| 位置 | 字段 | 当前 | 改为 |
| --- | --- | --- | --- |
| `.github/workflows/windows-version-build.yml`(build 步骤 env) | `SIGNPATH_POLICY_SLUG` | `test-signing` | `release-signing` |
| `.github/workflows/windows-version-build.yml`(installer 签名步骤) | `signing-policy-slug` | `test-signing` | `release-signing` |

> app 签名(afterPack)的 policy 由 build 步骤的 `SIGNPATH_POLICY_SLUG` 环境变量控制;artifact-configuration-slug(`windows-app`/`windows-installer`)测试生产通用,不用动。

### 5. 验证正式签名
- 改完触发一次构建(`build/windows.build.yml` version +1)。
- 取产物 exe + 安装后的 `flyenv-helper.exe`,右键 → 属性 → 数字签名:
  - 签发者应为 SignPath 颁发的**正式 CA**,而非 "Test certificate / self-signed"。
  - 时间戳存在、证书链可信。
- 在干净的 Windows(无开发环境)上装一遍,确认 SmartScreen / 杀软不再拦截 helper。
