# AI Memory · developer preview

Local JSON metadata and immutable Markdown bodies for AI agents, with a project-isolated data directory managed by FlyEnv. No memory files are added to your source repository. This preview supports macOS and Windows on x64 only; ARM64 is not declared.

## Connect

1. Install and enable the plugin in a FlyEnv build supporting plugin API 2. It is a non-service plugin; there is no software version to start.
2. In **MCP settings**, start the server, enable `flyenv_memory_search`, `flyenv_memory_get`, `flyenv_memory_store`, `flyenv_memory_update`, `flyenv_memory_forget`, and select approval policies. New tools are disabled by default; mutations default to confirmation.
3. From AI Memory → **Connection & maintenance**, configure Codex or Kimi, or use the existing MCP settings page for other clients. Configuration writes only register the connection. Reconnect the client to refresh its tool list.
4. Copy or download [Memory Rules](assets/memory-rules.md) ([中文](assets/memory-rules.zh.md)) into the instruction file/system prompt supported by your client. This is a manual step: copying is not installation or proof of a working call.
5. Ask the client to save a harmless sample. Verify its actual ID/revision with `flyenv_memory_get`. Automatic saving is an agent behavior, not a guarantee. Only Codex and Kimi are acceptance targets for this work.

The host owns a dedicated worker and an exclusive OS lock on the stable data root. UI and MCP use the same worker/engine. FlyEnv must remain running. Disabling/uninstalling drains work and waits for actual worker exit; uninstall preserves data. Clients may need to reconnect after tool changes.

## Usage and limits

Use an absolute project root. Canonical aliases resolve to one identity; unrelated same-name paths and worktrees remain independent. Unregistered searches create no project. Ancestor candidates are hints: choose a confirmed root or explicitly set `create_project=true` when storing an independent child. Moving a project creates a new scope in this preview. The management page retains the old project ID and can edit/delete its records even if the old path is missing.

Search returns current summaries; oversized result metadata is explicitly marked with `metadata_omitted` so one record cannot block pagination, and get retains every complete field; global hits require global get. Get returns a complete selected revision, including source and change reason. Update/forget require `expected_revision`. Every mutation has a UUID `request_id`: after a timeout/unknown result, confirm using the exact original request instead of creating a new ID. A conflict requires reading/reconciling the current version. Deletion `partial` means logical deletion is committed but cleanup needs retry. Permanent content-free receipts prevent replayed writes from reviving deleted records. Deletion cannot erase earlier responses, AI context or external backups, and is not secure SSD erasure.

Measured preview limits: 16 KiB UTF-8 body; 256 KiB record JSON including history; 8 MiB total JSON per searched scope; 4 MiB serialized current-metadata cache; four concurrent reads; eight results by default, at most 20; full search response budget 8 KiB (hard cap 32 KiB). History is never silently trimmed. Oversized/corrupt individual records produce warnings; aggregate overflow returns `capacity_exceeded`. Direct-ID get/forget and streaming pending cleanup do not depend on search capacity. Search cursors expire after relevant mutations/reloads; restart search on `cursor_invalid`.

Markdown viewing disables raw HTML, active links and image loading. Source labels are self-reported. The Call Records tab keeps up to 200 detailed in-memory entries, including search queries, filters and hit summaries, but recursively excludes full memory bodies; records clear on FlyEnv exit. Simplified plugin calls also use FlyEnv's shared MCP audit log without queries, summaries or bodies.

## Backup, restore and project relocation

Use **Maintenance → Back up now** to save a complete, checksummed backup folder. Copy that entire folder to another computer running a compatible plugin, then choose **Restore from backup**. Restore first preserves a full copy of current data; it replaces all memory scopes without restarting MCP. Project source files and client configurations are not included.

Backups retain original project paths. After restoration, Maintenance lists missing/inaccessible project directories. Choose the new folder and confirm it is the same project. Reassociation preserves project ID, name, memories, revision history and deletion receipts; it changes only the stored root path. Available projects can also be moved using **Show all projects → Change folder**. If the selected folder already belongs to another project, choose whether they represent the same project. Combining keeps both physical memory collections, IDs, histories and deletion receipts, and exposes them together under the retained project; it does not overwrite or deduplicate content. Choosing different projects returns to folder selection without changing either collection. Merges require a plugin that supports project-mapping schema v2; older versions must not open these mappings. Unlinked new paths remain separate scopes.

For manual recovery from a damaged mapping, disable the plugin and wait for its worker to exit before editing files. Preserve the complete current data directory, inspect the primary/previous mappings, and explicitly restore a validated mapping or a complete consistent backup. Preserve unmatched project directories; never guess their identity or remove their data. Global memory remains independent of project mappings.

Unvisited scopes are not scanned at startup; pending deletions resume on first access. An oversized or corrupt record does not stop recovery of valid siblings. OS/process crash probes do not prove arbitrary power-loss durability on every storage device.

## 中文说明

记忆集中保存在 FlyEnv 插件数据目录中，按项目隔离，不向代码仓库写文件。先启动 MCP 并启用五个工具，再配置 Codex/Kimi、重连发现工具，手动安装复制或下载的规则。配置成功、规则复制成功和实际调用成功是三个独立结果。

写入后核实真实 ID/revision；unknown/超时保留原请求参数和 request_id 确认，版本冲突先读最新版本。删除 partial 表示逻辑删除已完成但文件清理未结束。项目搬家或换电脑后，可在维护页为原项目重新关联新目录，保留原项目 ID、全部记忆和历史；尚未重新关联的新路径按独立项目处理。FlyEnv 退出后工具不可用，删除不会覆盖外部备份。

维护页支持一键备份和恢复：完整备份文件夹可以拷到另一台安装兼容插件的电脑，恢复前自动保留当前数据。恢复后为失效项目选择新目录；仍可用的旧目录可通过“查看全部项目 → 更换目录”调整。不会移动项目文件。目标目录已有项目记忆时，由用户选择“同一项目，合并两份记忆”或“不同项目，重新选择目录”；不自动判断、不覆盖、不自动去重。合并保留两边的原始记录、历史和删除回执，仅建立同一项目下的关联。备份不包含项目源码或客户端配置。

仅手动修复损坏映射时，需要先停用插件并等待 worker 退出，再保留完整副本、检查 previous 并显式恢复。未匹配的项目数据目录必须保留，不猜测绑定或删除。
