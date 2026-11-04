# AI Memory · developer preview

Local JSON metadata and immutable Markdown bodies for AI agents, with a project-isolated data directory managed by FlyEnv. No memory files are added to your source repository. This preview currently declares macOS ARM64 support only; other native filesystems and process lifecycles have not passed acceptance.

## Connect

1. Install and enable the plugin in a FlyEnv build supporting plugin API 2. It is a non-service plugin; there is no software version to start.
2. In **MCP settings**, start the server, enable `memory_search`, `memory_get`, `memory_store`, `memory_update`, `memory_forget`, and select approval policies. New tools are disabled by default; mutations default to confirmation.
3. From AI Memory → **Connection & maintenance**, configure Codex or Kimi, or use the existing MCP settings page for other clients. Configuration writes only register the connection. Reconnect the client to refresh its tool list.
4. Copy or download [Memory Rules](assets/memory-rules.md) ([中文](assets/memory-rules.zh.md)) into the instruction file/system prompt supported by your client. This is a manual step: copying is not installation or proof of a working call.
5. Ask the client to save a harmless sample. Verify its actual ID/revision with `memory_get`. Automatic saving is an agent behavior, not a guarantee. Only Codex and Kimi are acceptance targets for this work.

The host owns a dedicated worker and an exclusive OS lock on the stable data root. UI and MCP use the same worker/engine. FlyEnv must remain running. Disabling/uninstalling drains work and waits for actual worker exit; uninstall preserves data. Clients may need to reconnect after tool changes.

## Usage and limits

Use an absolute project root. Canonical aliases resolve to one identity; unrelated same-name paths and worktrees remain independent. Unregistered searches create no project. Ancestor candidates are hints: choose a confirmed root or explicitly set `create_project=true` when storing an independent child. Moving a project creates a new scope in this preview. The management page retains the old project ID and can edit/delete its records even if the old path is missing.

Search returns current summaries; global hits require global get. Get returns a complete selected revision, including source and change reason. Update/forget require `expected_revision`. Every mutation has a UUID `request_id`: after a timeout/unknown result, confirm using the exact original request instead of creating a new ID. A conflict requires reading/reconciling the current version. Deletion `partial` means logical deletion is committed but cleanup needs retry. Permanent content-free receipts prevent replayed writes from reviving deleted records. Deletion cannot erase earlier responses, AI context or external backups, and is not secure SSD erasure.

Measured preview limits: 16 KiB UTF-8 body; 256 KiB record JSON including history; 8 MiB total JSON per searched scope; 4 MiB serialized current-metadata cache; four concurrent reads; eight results by default, at most 20; full search response budget 8 KiB (hard cap 32 KiB). History is never silently trimmed. Oversized/corrupt individual records produce warnings; aggregate overflow returns `capacity_exceeded`. Direct-ID get/forget and streaming pending cleanup do not depend on search capacity. Search cursors expire after relevant mutations/reloads; restart search on `cursor_invalid`.

Markdown viewing disables raw HTML, active links and image loading. Source labels are self-reported. Recent diagnostics keep only bounded metadata in memory (up to 200 entries), never queries, summaries or bodies; they clear on FlyEnv exit.

## Offline backup and explicit recovery

1. Open the data directory from the plugin and note its location. **Disable the plugin in Plugin Manager and wait for completion**, which waits for real worker exit. Do not merely close the page. If disabling fails, do not copy/replace a live database; complete shutdown first.
2. Copy the **whole** data root: `projects.json`, `projects.previous.json`, `global/`, `projects/`, and remaining entries. Keep files from the same stopped snapshot together. A directory-lock file may remain on disk; it is an OS-held lease, not proof of a live owner. Do not delete it as an online “unlock.”
3. Before any restore, preserve the current stopped directory in a separate backup. Restore a consistent full backup while the plugin remains disabled. Do not merge individual records or histories from different snapshots.
4. For a mapping-only repair, use the recovery inspection to check the primary and previous mapping schemas/revisions/IDs. While stopped, explicitly copy the validated `projects.previous.json` over `projects.json`; never silently fall back or initialize an empty mapping over old data. Keep the damaged primary in your backup.
5. Re-enable and inspect again. Project directories created after the previous mapping can be **unmapped**. Preserve and list these IDs; do not guess their paths, delete them, or treat them as empty projects. V1 has no online rebinding or merge wizard. Global memory can work independently of a damaged project mapping.

Unvisited scopes are not scanned at startup; pending deletions resume on first access. An oversized or corrupt record does not stop recovery of valid siblings. OS/process crash probes do not prove arbitrary power-loss durability on every storage device.

## 中文说明

记忆集中保存在 FlyEnv 插件数据目录中，按项目隔离，不向代码仓库写文件。先启动 MCP 并启用五个工具，再配置 Codex/Kimi、重连发现工具，手动安装复制或下载的规则。配置成功、规则复制成功和实际调用成功是三个独立结果。

写入后核实真实 ID/revision；unknown/超时保留原请求参数和 request_id 确认，版本冲突先读最新版本。删除 partial 表示逻辑删除已完成但文件清理未结束。项目搬家按新项目处理，旧路径失效仍可在管理页按项目 ID 编辑/删除。FlyEnv 退出后工具不可用，删除不会覆盖外部备份。

备份/恢复必须先停用插件并等待实际 worker 退出，再复制整个数据根（主映射、previous 映射、global、projects 等）。恢复前保留当前目录，使用同一停止时刻的完整备份。仅修复映射时，先检查 previous 的有效性，再在停用状态明确复制为主映射；重新启用后检查缺失映射的项目 ID，保留目录，不猜测绑定、不删除未知数据。恢复检查本身不会修改数据。
