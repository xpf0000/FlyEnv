# #700 建站允许 localhost + 端口 —— 详细方案

> 关联：#700（主诉，localhost 只能加一个）、#727（多端口，部分相关）
> 调研基线代码：`src/fork/module/Host/*`、`Nginx|Apache|Caddy|FrankenPHP/Host.ts`、`src/render/components/Host/Edit.vue`、`Link.vue`

## 一、用户诉求

- 本地测试只想用 `localhost:端口` 区分多个站点，不想为每个站点编域名 + 写 hosts。
- 现状：以 `localhost` 为域名只能加一个，第二个判为重复；且每次启动要管理员权限（写 hosts）。

## 二、根因定位（已逐条核实）

### R1. 前端唯一性校验只比对 `name`，不含端口
`src/render/components/Host/Edit.vue`：
- 实时校验 L137-142：`for h of hosts: if h.name===name && h.id!==id → errs.name=true`
- 保存校验 L247-252：同样逻辑。
→ 第二个 `localhost`（即便端口不同）直接被判重复，无法保存。

### R2. vhost 配置/日志文件名以 `${host.name}.conf` 命名（**核心冲突点**）
四个 web server 模块全部如此：
- Nginx：`vhost/nginx/${host.name}.conf`、`vhost/rewrite/${name}.conf`、`vhost/logs/${name}.log`
- Apache：`vhost/apache/${host.name}.conf`、`${name}-access_log`
- Caddy：`vhost/caddy/${host.name}.conf`、`${name}.caddy.log`
- FrankenPHP：`vhost/frankenphp/${host.name}.conf`
→ 两个 `localhost` 站点会**互相覆盖**配置与日志文件。`Host/index.ts` 的 edit 分支也依赖 `${old.name}.conf` 判断存在性。

### R3. hosts 文件对 localhost 做了冗余写入
`Host/index.ts._initHost()` L356-363：对所有 alias 写 `127.0.0.1  <alias>`。
→ `localhost` 本就由系统解析，写 hosts 纯属多余，还触发管理员权限（用户痛点之一）。

### R4. 服务端区分维度本应是「端口」
- Nginx：多个 `server_name localhost` 在**不同 listen 端口**下完全合法；同端口才冲突。
- Caddy：site address 已是 `http://localhost:端口`（`Caddy/Host.ts` L50-54），天然支持端口区分。
- Apache：`Listen` + `<VirtualHost *:port>` + `ServerName`，同理。
→ 即区分键应为 `name + 监听端口`，而非裸 `name`。

## 三、设计目标

1. 允许多个同名站点（典型即 `localhost`），以**监听端口**区分。
2. `localhost` / 环回域名建站**不写 hosts**，免管理员权限。
3. 三端（macOS / Windows / Linux）行为一致；存量站点平滑迁移、不破坏现有数据。

## 四、方案设计

整体思路：**(A) vhost 文件名去 name 化、改用稳定唯一 id** 解决覆盖问题（治本）；**(B) 唯一性校验改为 name+端口**；**(C) hosts 跳过 localhost**。三者配合落地。

### 方案 A：vhost / 日志文件名由 `host.name` 改为 `host.id`（推荐，治本）

`host.id` 已是唯一值（`uuid(13)` / 数字 id），用它做文件名可彻底消除 R2 的覆盖问题，且 rename 站点时不再需要搬运文件（id 不变）。

落点（统一封装一个 helper，避免散落）：
- 新增 `src/fork/module/Host/vhostName.ts`：
  ```ts
  // 兼容存量：优先 id，回退 name
  export const vhostConfName = (host: AppHost) => `${host.id}`
  ```
- 改造 4 个模块的 `make/update/del`：文件名 `${host.name}.conf` → `${vhostConfName(host)}.conf`，日志同理。
- `Host/index.ts` 的 `edit` 分支：`${old?.name}.conf` 存在性判断改用 id。
- **`server_name` / `ServerName` / Caddy site address 仍用 `host.name` + 端口**（对外仍以域名响应），仅“磁盘文件名”改为 id。
- `updateNginxConf` 等里 `if (host.name !== old.name)` 的“改名搬文件”逻辑可整段移除（id 不变，无需搬运），只保留 server_name/alias 的内容替换。

**迁移**：首次运行做一次性迁移——遍历 `host.json`，把 `vhost/{nginx,apache,caddy,frankenphp,rewrite,logs}/${name}.*` 按 id 重命名（不存在则下次 reload 由 `initAllConf` 重建，故迁移失败也可自愈）。建议放在现有启动初始化流程。

### 方案 B：唯一性校验改为「name + 同协议监听端口」

`Edit.vue` L137-142 与 L247-252 两处：
```ts
const samePort = (a, b) =>
  a.port.nginx === b.port.nginx || a.port.apache === b.port.apache
// 仅当 name 相同 *且* 命中同一 http 监听端口 才算重复
if (h.name === name && h.id !== item.value.id && samePort(h, item.value)) {
  errs.value['name'] = true
}
```
- SSL 站点追加比对 `nginx_ssl/apache_ssl/caddy_ssl`。
- 后端 `Host/index.ts` 增加一道对称校验（防止绕过前端）：add/edit 时若存在 name+端口 完全相同的其他站点则 reject，复用 `host.licenseTips` 同款错误提示文案（新增 i18n key `host.samePortTips`）。

### 方案 C：localhost / 环回域名跳过 hosts 写入

`Host/index.ts._initHost()` L356-363 写入前过滤：
```ts
const isLoopbackName = (a: string) =>
  a === 'localhost' || a.endsWith('.localhost') ||
  a === '127.0.0.1' || a === '::1'
allHost.forEach((a) => {
  if (a && a.trim() && !isLoopbackName(a)) {
    host.push(`127.0.0.1     ${a}`)
    if (ipv6) host.push(`::1     ${a}`)
  }
})
```
→ 纯 localhost 站点集合为空时，`writeHosts` 不再触发 `writeFileByRoot`（无管理员弹窗），契合用户“localhost+端口就够用”的诉求。

### 端口输入 UX（关键设计决策）

**前提事实**：FlyEnv 一个站点持有三个独立监听端口 `port.nginx` / `port.caddy` / `port.apache`（开 SSL 再加三个 `_ssl`），不是“一个端口”。原因是 **nginx / apache / caddy 可同时运行**——同机两个进程不能绑同一 TCP 端口，若多个 web server 都为某站点监听 `:80` 必然冲突起不来。因此“三端口”是支撑“多 web 服务器并存”的必要设计，**不能合并成全局单端口**。

**结论：端口在“端口设置栏”输入，不塞进域名框。** 因为底层是三个端口，域名框里写 `localhost:8080` 落到哪个 server 有歧义；且当前保存逻辑 `data.name = new URL(...).hostname` 会直接丢弃端口。

**但要做 UI 收敛**，降低“三个端口框”的认知负担（绝大多数用户一个站点只用一个 web server）：

1. **数据层保留三端口**（架构需要，不改 `AppHost.port` 结构）。
2. **UI 默认只显示“主用 web 服务器”的一个端口框**：取当前正在运行 / 用户选定的 web server（nginx 优先），其余两个端口折叠进“高级设置”。
3. **联动跟随**：用户改这个主端口时，未被手动单独改过的另外两个端口自动跟随同值（如都设为 8080）。仅当用户在“高级设置”里手动改过某个端口，该端口才脱离跟随、独立保留。
4. **进阶场景**：真要“多 web 服务器并存且各用不同端口”，展开高级设置分别设定。
5. 对普通用户，视觉上即“localhost + 一个端口”，与“统一一个端口”的体验基本一致，同时不牺牲并存能力。

> 落地提示：可在 `item.port` 上配一个“主端口”计算属性 + 是否“已手动改过”的标记位（如 `portTouched: {nginx,caddy,apache}`），驱动跟随逻辑；该标记仅前端使用，不必持久化进 host.json。

### 前端配套（UI / 展示）

1. **列表展示端口（已基本实现，补两处边角）**：`ListTable.vue` 的 `siteName()`（L387-415）已按“当前运行中的 web server（nginx→apache→caddy 优先）”取对应端口并拼到域名后，非默认端口会显示，故两个 localhost 通常自然显示为 `http://localhost:8080` / `http://localhost:8081`，可区分。需补两个边角：
   - **无 web server 运行时端口取不到**：`siteName()` 依赖 `nginxRunning/apacheRunning/caddyRunning`，三者都没启动时所有分支不命中、`port` 停在默认 80 → 退化成裸 `localhost`，多个 localhost 看起来相同。**修法**：无运行中 server 时回退用“主端口”（按 nginx→apache→caddy 取第一个非空值），保证未启动状态也带端口。
   - **端口正好是 80/443**：`port===80/443` 会被省略成裸 `localhost`。配合方案 B 的 name+端口 唯一性，最多一个 localhost 能占 80，不会两个都显示 `localhost`，可接受。
2. **备注列做二级区分**：列表已存在 comment（`mark`）列（`ListTable.vue` L91-116，支持双击行内编辑）。用户可给同名站点写备注名（如“前端”/“API”），与“localhost:端口”形成双保险。可在文档/占位提示里引导。
3. **访问链接**：`Link.vue` 已正确按端口拼接（L62-74，`port===80→省略`），无需改；但 80/443 省略逻辑对“多 localhost”要保证至少有一个非 80 端口，否则两站点链接相同——可在校验阶段提示。
4. **默认端口建议**：新建 localhost 站点时，若 80 端口已被占用，自动建议下一个可用端口（可选增强）。

## 五、与 #727 的关系

#727 要的是“单个项目服务监听多个端口”（如 `pnpm dev:local` 同时起前/后/API 三端口），属 **Project 服务端口检测**，与本方案的“多站点同名分端口”是不同层面：
- 本方案解决 **多个 vhost 站点** 用 localhost+端口共存。
- #727 解决 **一个项目** 的端口存活检测支持端口数组（`projectPort: number` → `number[]`）。
- 建议 #727 单独处理，但本方案的“端口作为一等公民”改造为其打好基础。

## 五点五、SSL / autoSSL 检查（结合多 localhost / park 批量场景）

**已对齐、无需改的部分（好消息）**：
- 证书目录与文件名已用 `host.id` 命名（`CA-${host.id}`、`CA/${host.id}/`），多个 localhost 站点各自独立证书，**不互相覆盖**；删除站点时 `_delVhost` 按 `CA/${host.id}` 清理，一致（`Host/index.ts` L257-261）。
- `updateAutoSSL`（`Host/Host.ts` L98-99）只在 `autoSSL` 切换或 **alias 变化**时重签；**端口变化不触发重签**——正确，证书只绑域名不绑端口。故“同名 localhost 改端口加第二个”不引发证书问题。

**真问题 1：Root CA 首次生成竞态**（`SSL.ts` L50 / L118）
`doPark` 用 `Promise.all` 并发跑 `_addVhost → updateAutoSSL → makeAutoSSL`。开 SSL 的站点批量 park 且根 CA 尚未生成时，多个 `makeAutoSSL` 同时判定 `!existsSync(CARoot)` 成立 → 并发生成根 CA，互相覆盖/损坏根证书与 key。
**修法**：根 CA 生成加进程内互斥锁（一次性 `Promise` 单例 `ensureRootCA()`，并发调用共享同一次生成）。

**真问题 2：序列号文件 `.srl` 竞态**（`SSL.ts` L104 / L160）
`-CAcreateserial -CAserial "${rootCA}.srl"` 并发签发同时读写同一 `.srl`，可能产生重复序列号或写坏文件（同序列号证书被浏览器拒绝）。
**修法**：站点证书签发串行化（队列），或每次签发用独立 srl / 随机 `-set_serial`，避免共享 srl 并发写。

**真问题 3：Windows `process.chdir` 全局副作用**（`SSL.ts` L94 / L101）
Windows 分支用 `process.chdir(dirname(openssl))` 改**整个 fork 进程**的工作目录且**不还原**；并发时互相踩 cwd，并影响进程内后续依赖 cwd 的相对路径操作。
**修法**：照搬非 Windows 分支做法——openssl 用全路径调用 + 传 `{ cwd: hostCADir }` 选项，移除 `process.chdir`。

**次要优化（非必须）**：同名 localhost 多站点会各签一份 `SAN: DNS.1=localhost, IP.1=127.0.0.1` 的近重复证书。功能正确（浏览器只校验域名），仅冗余；可按 alias 集合复用证书。

> 说明：这些竞态在“单个站点逐个添加”时基本不触发，是 #700 放开多 localhost + park 批量建站后被放大。建议随方案 A/B 一并修，至少修问题 1、2（数据正确性）与问题 3（Windows 稳定性）。

## 六、改动文件清单

| 文件 | 改动 |
|------|------|
| `src/fork/module/Host/vhostName.ts` | 新增，统一 vhost 文件名（id 化） |
| `src/fork/module/Nginx/Host.ts` | make/update/del 文件名改 id；移除改名搬运逻辑 |
| `src/fork/module/Apache/Host.ts` | 同上 |
| `src/fork/module/Caddy/Host.ts` | 同上 |
| `src/fork/module/FrankenPHP/Host.ts` | 同上 |
| `src/fork/module/Host/index.ts` | edit 分支按 id 判存在；`_initHost` 跳过 loopback；新增 name+端口 后端校验；新增存量迁移 |
| `src/render/components/Host/Edit.vue` | 唯一性校验改 name+端口（两处）；端口栏 UI 收敛为“主端口 + 高级展开”、主端口联动跟随 |
| `src/render/components/Host/ListTable.vue` | `siteName()` 无运行中 server 时回退主端口，保证未启动也带端口区分 |
| `src/lang/**` | 新增 `host.samePortTips` 多语言文案 |
| `src/fork/module/Host/SSL.ts` | 根 CA 生成互斥锁；证书签发串行化/独立序列号；Windows 移除 `process.chdir` 改用 `cwd` 选项 |

## 七、风险与兼容

- **存量站点迁移**：文件名 id 化需一次性重命名；即便迁移失败，`initAllConf` 会在 reload 时按缺失重建 vhost，可自愈，风险可控。
- **server_name 不变**：对外响应域名仍是 `host.name`，不影响已配置的非 localhost 站点访问。
- **三端一致**：改动均为路径/字符串层面，nginx/apache/caddy 模板本身已支持端口区分，无平台差异。
- **SSL**：证书已按 `host.id` 独立、端口变化不重签；需修复 park 批量建站下的根 CA / 序列号并发竞态与 Windows `process.chdir` 副作用（详见五点五）。

## 八、落地建议（分步，便于评审与回归）

1. **Step 1（独立可验证）**：方案 C —— localhost 跳过 hosts。立竿见影解决“管理员权限”痛点，改动最小。
2. **Step 2**：方案 A —— vhost 文件名 id 化 + 迁移。解决覆盖根因。
3. **Step 3**：方案 B + 前端展示 —— 放开 name+端口 唯一性，列表显示端口。
4. **Step 4（SSL 健壮性）**：修复 `SSL.ts` 根 CA / 序列号并发竞态 + Windows `process.chdir`。放开多 localhost 后 park 批量建 SSL 站点才安全。
5. **Step 5（可选体验优化）**：端口栏 UI 收敛 —— 主端口 + 高级展开 + 联动跟随。降低三端口认知负担，不阻塞前四步。
6. 每步独立可回归；建议在 macOS/Windows 各建 2 个 `localhost:8080`、`localhost:8081` 站点验证：互不覆盖、无 hosts 写入、两站点分别可访问；再开 SSL 各建 2 个并 park 验证证书并发无损坏。
