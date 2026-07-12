# FlyEnv新版本4.16.2更新日志

本次更新内容：
1. 新增启动组模块 https://github.com/xpf0000/FlyEnv/discussions/706 https://github.com/xpf0000/FlyEnv/issues/742 https://github.com/xpf0000/FlyEnv/issues/757
2. 修复.NET 版本检查问题 https://github.com/xpf0000/FlyEnv/pull/770
3. 优化启动速度和资源占用


参照：
```
# **FlyEnv v4.16.0 Update Release Notes**

## **🚀 New Features**

### **1. Added FlyEnv MCP Server**

FlyEnv now includes a built-in **MCP Server** that lets AI clients connect directly to your local FlyEnv environment. You can start the server from FlyEnv, generate ready-to-use client configuration snippets, and register the server into supported AI coding CLIs without editing everything by hand.

This integration provides:
- **MCP Service Control**: Start and stop the FlyEnv MCP server from the UI, configure host, port, access token, and local/remote access behavior
- **Client Quick Config**: Generate HTTP and stdio-compatible configuration snippets and copy them directly from FlyEnv
- **One-Click Client Registration**: Register the FlyEnv MCP server into Claude Code, Codex, OpenCode, Kimi, Antigravity CLI, and GitHub Copilot CLI
- **Tool Policy Management**: Enable or disable individual MCP tools and require confirmation for risky operations such as service control, installation, or site changes
- **Audit Logging**: Review MCP tool activity through the built-in audit log

---

### **2. Added AI Coding CLI Modules**

FlyEnv now includes dedicated modules for **Claude Code**, **Codex**, **OpenCode**, **Kimi**, **Antigravity CLI**, and **GitHub Copilot CLI**. These integrations bring AI coding CLIs into the same desktop workflow as your local runtimes and services, making them easier to install, inspect, and manage from one place.

This integration provides:
- **CLI Installation & Detection**: Install supported AI coding CLIs and check their installed version from FlyEnv
- **Config File Access**: View important config file paths and manage client configuration from the UI
- **Session Management**: Browse saved sessions, reopen them in a terminal, and clean up old sessions when supported
- **MCP Management**: List configured MCP servers and add or remove FlyEnv MCP connections directly from each client module
- **Client-Specific Extras**: Manage plugins for Claude Code and Codex, skills for Antigravity CLI and GitHub Copilot CLI, provider/stats views for OpenCode, and logs/session export workflows for Kimi

[Issue #712](https://github.com/xpf0000/FlyEnv/issues/712)

---

## **🛠️ Improvements & Bug Fixes**

### **3. Updated MinIO Download Source**

FlyEnv now uses the maintained **pgsty/minio** fork as the updated MinIO download source, improving install availability after upstream distribution changes and making MinIO version downloads more reliable.

[Issue #626](https://github.com/xpf0000/FlyEnv/issues/626)

---

### **4. Fixed Windows Python Environment Variable Setup**

Resolved a Windows issue where FlyEnv could register an incorrect Python environment path during setup. Python environment registration now points to the correct FlyEnv-managed runtime layout, so newly installed Python versions are exposed more reliably.

[Issue #633](https://github.com/xpf0000/FlyEnv/issues/633)

---

### **5. Fixed Rust Toolchain Detection for Custom `CARGO_HOME` / `RUSTUP_HOME`**

Resolved an issue where FlyEnv could miss Rust toolchains installed through `rustup` when `CARGO_HOME` or `RUSTUP_HOME` had been customized. FlyEnv now respects those environment variables when locating `rustup`, toolchains, and related runtime data.

[Issue #691](https://github.com/xpf0000/FlyEnv/issues/691)

---

### **6. Improved Local Site Support for `localhost` + Port Workflows**

FlyEnv site management now supports using **`localhost` with explicit ports** such as `localhost:8080` when adding or editing sites. This makes local multi-port workflows easier to model without creating extra fake domains just to separate ports.

This improvement includes:
- **Port-Aware Duplicate Checks**: Sites with the same hostname are allowed as long as their listening ports do not conflict
- **Port Extraction from Host Input**: Entering `localhost:port` now applies that port to the site configuration instead of dropping it on save
- **Cleaner Hosts File Behavior**: Pure loopback sites no longer require redundant hosts-file writes, which reduces unnecessary admin prompts
- **Stable Vhost File Naming**: Generated vhost, rewrite, and log files now avoid same-name collisions across multi-port localhost sites

[Issue #700](https://github.com/xpf0000/FlyEnv/issues/700)

---

### **7. Fixed FlyEnv Environment Variable Ordering**

Resolved an issue where FlyEnv-managed environment variables could appear in the wrong order, allowing system or Homebrew Python binaries to take precedence over the version selected in FlyEnv. FlyEnv now rebuilds Python PATH entries with dedicated shims so `python` and `python3` resolve consistently to the active FlyEnv version.

[Issue #713](https://github.com/xpf0000/FlyEnv/issues/713)

---

### **8. Fixed Windows Cron Jobs for Paths Containing Spaces**

Resolved a Windows scheduled-task issue where cron jobs could fail when the generated task wrapper or working directory path contained spaces. FlyEnv now launches the PowerShell wrapper through a safer quoted command path, improving reliability for projects stored under directories such as `C:\\Program Files\\...` or other spaced workspace paths.

[Issue #728](https://github.com/xpf0000/FlyEnv/issues/728) [Issue #729](https://github.com/xpf0000/FlyEnv/issues/729)

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**
```

出一个FlyEnv最新版本的更新日志。 添加到 RELEASE_NOTES.md 里
如果需要了解各个模块的功能，可以从代码里查看。
@xxx需要你打开具体的url去获取。
