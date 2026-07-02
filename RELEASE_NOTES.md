# FlyEnv Release Notes

All notable changes to FlyEnv will be documented in this file.

## [4.16.0] - 2026-07-02

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

## [4.15.4] - 2026-06-15

# **FlyEnv v4.15.4 Update Release Notes**

## **🛠️ Improvements & Bug Fixes**

### **1. Improved Service Startup on Windows**

Reworked how FlyEnv launches its services on Windows to reduce the chance of false positives from antivirus software. Services now start through a cleaner launch path, so security tools are less likely to flag normal FlyEnv operations.

---

### **2. Improved Service Startup on macOS**

Reworked how FlyEnv launches its services on macOS to resolve conflicts with certain terminal applications that modify the system default ZSH configuration. Those conflicts previously prevented FlyEnv-managed services from starting; services now launch reliably regardless of the host shell setup.

---

### **3. Fixed Startup-on-Boot for Paths Containing Spaces**

Fixed the auto-start-on-boot logic on Windows and Linux so it works correctly when FlyEnv is installed in a folder whose path contains spaces. Boot startup is now registered correctly in these cases instead of failing silently.

---

### **4. Fixed Mailpit Version Detection**

Fixed an issue where FlyEnv could not correctly read the version number for newer Mailpit releases. Mailpit version detection now works as expected.

---

### **5. Fixed RabbitMQ Management Plugin**

Fixed an issue where the RabbitMQ management plugin could not be enabled, which left the RabbitMQ web management panel unusable. The management plugin now enables correctly and the web panel works as intended.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**

## [4.15.3] - 2026-06-03

# **FlyEnv v4.15.3 Update Release Notes**

## **🚀 New Features**

### **1. Added RoadRunner Module**

FlyEnv now includes a dedicated **RoadRunner** module for PHP application server workflows. You can install, detect, configure, and run RoadRunner directly from FlyEnv, then bind RoadRunner-backed projects into the standard project service experience.

This integration provides:
- **RoadRunner Version Management**: Discover, install, and manage RoadRunner releases from the Version Manager
- **Standalone Service Mode**: Start RoadRunner with a generated `.rr.yaml` fileserver configuration for quick local testing
- **PHP Project Services**: Manage RoadRunner projects from the project service view with start/stop, port, environment, log, and config workflows
- **Project Presets**: Quickly configure PHP Worker, Existing Config, Laravel Octane, Fileserver, or Custom command projects
- **PHP Runtime Binding**: Select a FlyEnv-managed PHP runtime for RoadRunner PHP Worker and Laravel Octane projects
- **Config File Sync**: Generate `.rr.yaml` files, detect existing RoadRunner configs, and keep project ports synchronized

---

### **2. Added Swoole CLI Module**

FlyEnv now supports **Swoole CLI** as a first-class PHP runtime and project service module. You can install Swoole CLI versions, initialize the runtime files FlyEnv needs, and run Swoole-based PHP projects with purpose-built presets.

This integration provides:
- **Swoole CLI Version Management**: Discover, install, and manage Swoole CLI binaries across supported platforms
- **Runtime Bootstrap**: Prepare `php.ini`, `php-fpm.conf`, Composer, and CA certificate files for FlyEnv-managed Swoole CLI runtimes
- **Project Presets**: Run Native Swoole, Hyperf, EasySwoole, Laravel Octane, PHP Script, or Custom command projects
- **Config Detection**: Automatically detect common framework config files such as Hyperf server/routes, EasySwoole configs, Laravel Octane config, and `server.php`
- **Project Service Workflow**: Configure ports, startup commands, environment variables, config files, logs, and service lifecycle from the same project UI

---

### **3. Split PHP into PHP-FPM and PHP Project Services**

The PHP experience has been reorganized into clearer responsibilities. **PHP-FPM** is now available as its own module for PHP runtime and FPM service management, while the **PHP** module now leads with PHP project service management.

This update makes PHP deployment workflows easier to understand:
- **PHP-FPM Module**: Manage PHP-FPM services and PHP runtime versions separately
- **PHP Project Services**: Start and stop PHP projects through the common project service workflow
- **Cleaner Navigation**: Keep PHP runtime/service management separate from PHP project deployment
- **Complete PHP Deployment Coverage**: FlyEnv now covers PHP, PHP-FPM, FrankenPHP, RoadRunner, and Swoole CLI deployment shapes in one desktop app

Thanks to [@chunbo007](https://github.com/chunbo007) for the discussion! [Discussion #694](https://github.com/xpf0000/FlyEnv/discussions/694)

---

### **4. Added ZincSearch Module**

FlyEnv now includes a dedicated **ZincSearch** module for running the lightweight search engine locally. You can install ZincSearch, manage the service lifecycle, edit environment configuration, inspect logs, and open the ZincSearch UI directly from FlyEnv.

This integration provides:
- **Service Management**: Start and stop ZincSearch through the standard FlyEnv service workflow
- **Version Management**: Install and manage ZincSearch releases from GitHub
- **Environment Configuration**: Configure admin credentials, data path, bind address, port, and log level through `zincsearch.env`
- **Log Access**: View standard and error logs directly in the ZincSearch module
- **Quick UI Access**: Open the ZincSearch web UI using the configured host and port when the service is running

Thanks to [@zzdboy](https://github.com/zzdboy) for the feature request! [Issue #440](https://github.com/xpf0000/FlyEnv/issues/440)

---

## **🛠️ Improvements & Bug Fixes**

### **5. Added Remarks to Installed Version Lists**

Installed version lists now include a **Remark** column, making it easier to label local runtime versions and remember what each installed version is used for. Remarks can be edited directly from the installed list, are persisted locally, and are shown in service-related version management views.

This helps prevent accidental deletion or confusion when multiple versions of the same runtime are installed for different projects.

Thanks to [@Y0n3er](https://github.com/Y0n3er) for the feature request! [Issue #543](https://github.com/xpf0000/FlyEnv/issues/543)

---

### **6. Fixed MariaDB 11.4+ / 12+ Startup Issue on Windows**

Resolved a Windows startup failure affecting newer MariaDB builds that require PEM files for zero-configuration SSL and authentication key handling. FlyEnv now generates and supplies the required `ca.pem`, `server-cert.pem`, `server-key.pem`, `private_key.pem`, and `public_key.pem` files when needed, preventing MariaDB 12+ from failing to start because those files are missing.

---

### **7. Improved Cloudflare Tunnel Local Domain Binding**

Cloudflare Tunnel local service bindings now support choosing **HTTP** or **HTTPS** per local domain rule. This lets each tunnel rule forward to the correct local protocol and helps avoid WordPress redirect issues caused by forcing the wrong protocol during local-to-public forwarding.

---

### **8. Fixed macOS Service Startup State**

Resolved an issue on macOS where a service could remain stuck in the "starting" state after the startup command completed. Service state now settles correctly after startup succeeds or fails.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.15.2] - 2026-05-24

# **FlyEnv v4.15.2 Update Release Notes**

## **🚀 New Features**

### **1. Added .NET Module**

FlyEnv now includes a dedicated **.NET** module for managing .NET development environments directly from the app. You can now discover, install, and manage .NET SDK versions alongside your other language runtimes and services.

This integration provides:
- **Project Management**: Browse and manage .NET projects from the language project view
- **VS Code Integration**: Open .NET projects directly in VS Code from FlyEnv
- **Service Management**: Start and stop .NET services through the standard FlyEnv service workflow
- **Version Management**: Detect local .NET SDK installations and install platform-specific SDK packages from Microsoft release metadata
- **Cross-Platform Support**: Works across Windows, macOS, and Linux with architecture-aware downloads
- **Package Manager Support**: Includes Homebrew discovery support for macOS users

Thanks to [@sky22333](https://github.com/sky22333) for the feature request! [Issue #662](https://github.com/xpf0000/FlyEnv/issues/662)

---

### **2. Added Cron Jobs Module**

FlyEnv now provides a full **Cron Jobs** module for scheduling and monitoring recurring commands from the desktop UI. You can create global jobs or bind jobs to specific sites, then let FlyEnv register them with the native system scheduler.

This integration allows you to:
- **Global & Site-Scoped Jobs**: Create scheduled commands globally or for a specific project/site
- **Native Scheduler Integration**: Register jobs through crontab on macOS/Linux and Windows Task Scheduler on Windows
- **Cron Expression Helper**: Build and validate portable five-field cron expressions with presets and live previews
- **Command Testing**: Run commands manually before saving and inspect exit code, duration, stdout, and stderr
- **Run History**: Track last run time, next run time, output, errors, and execution status
- **System Task View**: Browse FlyEnv-created tasks and existing system scheduled tasks in one place
- **Command Templates**: Quickly insert common PHP, Node.js, Python, and shell command patterns

Thanks to [@ibraimfarag](https://github.com/ibraimfarag) for the PR! [PR #674](https://github.com/xpf0000/FlyEnv/pull/674)

---

### **3. Added Korean Translation**

FlyEnv now supports **Korean** as an application language. The translation covers the core app interface, setup pages, service modules, toolbox entries, Cron Jobs, Flutter, and other module-specific text.

Thanks to [@vendeeglobe](https://github.com/vendeeglobe) for the PR! [PR #676](https://github.com/xpf0000/FlyEnv/pull/676)

---

## **🛠️ Improvements & Bug Fixes**

### **4. Fixed MongoDB Startup Issue on macOS**

Resolved an issue where MongoDB could fail to start on macOS. The MongoDB startup flow now uses the platform-appropriate service launch path with generated configuration, log, PID, and data directory handling, improving startup reliability on macOS.

Thanks to [@leafspace](https://github.com/leafspace) for reporting this issue! [Issue #679](https://github.com/xpf0000/FlyEnv/issues/679)

---

### **5. Fixed Flutter Installation Failure**

Resolved an issue where Flutter SDK installation could fail after extraction. FlyEnv now normalizes the extracted SDK directory and initializes the installed Flutter SDK as a Git repository, preventing Flutter commands from failing with repository-related errors after installation.

Thanks to [@yljphp](https://github.com/yljphp) for reporting this issue! [Issue #682](https://github.com/xpf0000/FlyEnv/issues/682)

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.15.1] - 2026-05-15

# **FlyEnv v4.15.1 Update Release Notes**

## **🚀 New Features**

### **1. Added Flutter Module**

FlyEnv now integrates **Flutter** support directly into your development environment! You can now easily manage Flutter SDK installations and perform common Flutter operations right from the FlyEnv UI.

This integration allows you to:
- **SDK Management**: Install and manage Flutter SDK versions seamlessly
- **Flutter Doctor**: Run diagnostic checks with detailed, categorized results to quickly identify environment issues
- **Android Device Management**: Detect, inspect, and manage connected Android devices via ADB
- **Android Auto-Fix**: Automatically configure Android SDK environment variables and platform-tools PATH
- **Quick Actions**: Run Flutter projects, build APKs, and build AppBundles with one click
- **Advanced Commands**: Execute doctor, upgrade, channel switching, pub commands (get, upgrade, outdated, deps), clean, analyze, test, format, and platform-specific builds (web, Windows, APK release/debug)
- **SDK Info**: View detailed Flutter and Dart version information, engine revision, and build date

Thanks to [@ibraimfarag](https://github.com/ibraimfarag) for the PR! [PR #649](https://github.com/xpf0000/FlyEnv/pull/649)

---

### **2. Added Git Module**

FlyEnv now includes a dedicated **Git** module for managing your Git installation and environment. You can easily install, verify, and manage your Git setup directly from the FlyEnv interface.

This integration provides:
- **One-Click Installation**: Install Git automatically using platform-native package managers — winget on Windows, Homebrew/MacPorts/xcode-select on macOS, and apt/yum/dnf/pacman on Linux
- **Installation Check**: Verify if Git is installed and view the current version
- **Environment Diagnostics**: Check Git path, SSH availability, and Git LFS status
- **Cross-Platform Support**: Works on Windows, macOS, and Linux with platform-aware checks

Thanks to [@Heyiki](https://github.com/Heyiki) for the PR! [PR #664](https://github.com/xpf0000/FlyEnv/pull/664)

---

### **3. Added Diff Compare Tool to Toolbox**

The Toolbox now includes a powerful **text difference comparison tool**. You can easily compare two pieces of text and visualize additions, deletions, and changes with an inline diff view powered by Monaco Editor.

Features include:
- Side-by-side text comparison with synchronized scrolling
- Inline diff highlighting for precise change detection
- Navigation between differences with previous/next buttons
- Sample data loading for quick testing
- Swap and clear actions for efficient workflow

Thanks to [@Heyiki](https://github.com/Heyiki) and [@qaydt20250317](https://github.com/qaydt20250317) for the PRs! [PR #651](https://github.com/xpf0000/FlyEnv/pull/651) [PR #670](https://github.com/xpf0000/FlyEnv/pull/670)

---

### **4. Added WebSocket / SSE Tool to Toolbox**

The Toolbox now features a **WebSocket and Server-Sent Events (SSE) testing tool**. You can now easily test and debug real-time connections directly within FlyEnv.

This tool provides:
- **Protocol Support**: Switch between WebSocket and SSE protocols
- **Connection Management**: Connect and disconnect with real-time status indicators
- **Request Configuration**: Configure query parameters, custom headers, and protocols
- **Message Exchange**: Send messages and view received messages in a clean, organized interface
- **Auto-Reconnect**: Automatically reconnect WebSocket connections when disconnected

Thanks to [@Heyiki](https://github.com/Heyiki) for the PR! [PR #657](https://github.com/xpf0000/FlyEnv/pull/657)

---

## **🛠️ Improvements & Bug Fixes**

### **5. Improved Windows Service Startup Stability**

Optimized the Windows version to improve the stability and reliability of service startup across all modules. Services now start more consistently on Windows, reducing intermittent failures and improving the overall user experience.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.15.0] - 2026-05-04

# **FlyEnv v4.15.0 Update Release Notes**

## **🚀 New Features**

### **1. Added CliProxyAPI Module**

FlyEnv now integrates **[CliProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — a lightweight CLI proxy API solution — directly into your development environment. You can now install, configure, and manage CliProxyAPI with just a few clicks from the FlyEnv UI.

Thanks to [@diinggos](https://github.com/diinggos) for the feature request! [Issue #640](https://github.com/xpf0000/FlyEnv/issues/640)

---

### **2. Added Numa Module**

Introducing **[Numa](https://numa.rs/)** support to FlyEnv! Numa is a powerful framework that you can now easily install and manage directly from the FlyEnv interface.

Thanks to [@batcom](https://github.com/batcom) for the feature request! [Issue #616](https://github.com/xpf0000/FlyEnv/issues/616)

---

### **3. Added Rnacos Module**

FlyEnv now supports **[r-nacos](https://r-nacos.github.io/docs/intro/)** — a Rust implementation of the Nacos service discovery and configuration management platform. You can now install and manage Rnacos directly from the FlyEnv UI.

Thanks to [@achunchunya](https://github.com/achunchunya) for the feature request! [Issue #641](https://github.com/xpf0000/FlyEnv/issues/641)

---

### **4. Added FrankenPHP Module**

We are excited to bring **[FrankenPHP](https://frankenphp.dev/)** to FlyEnv! FrankenPHP is a modern PHP application server written in Go. You can now easily install, configure, and run FrankenPHP directly from the FlyEnv interface.

Thanks to [@eqwt](https://github.com/eqwt) for the feature request! [Issue #642](https://github.com/xpf0000/FlyEnv/issues/642)

---

### **5. Ollama Online Model Availability Detection**

Enhanced the Ollama module with hardware-based availability detection for online models. Models are now displayed with a color-coded indicator (red/yellow/green) based on your local hardware capabilities, helping you quickly identify which models are suitable for your machine.

Thanks to [@ibraimfarag](https://github.com/ibraimfarag) for the PR! [PR #635](https://github.com/xpf0000/FlyEnv/pull/635)

---

### **6. Added JWT Encoding & Decoding Tool to Toolbox**

The Toolbox now includes a convenient **JWT encoding and decoding tool**. You can easily encode and decode JSON Web Tokens directly within FlyEnv, making it simpler to debug and work with JWT-based authentication during development.

Thanks to [@Heyiki](https://github.com/Heyiki) for the PR! [PR #643](https://github.com/xpf0000/FlyEnv/pull/643)

---

### **7. Added Cron Expression Parsing & Runtime Calculation to Toolbox**

The Toolbox now also features a **Cron expression parser and runtime calculator**. Enter any cron expression to see a human-readable description and calculate the next scheduled run times, streamlining your workflow when working with scheduled tasks.

Thanks to [@Heyiki](https://github.com/Heyiki) for the PR! [PR #645](https://github.com/xpf0000/FlyEnv/pull/645)

---

## **🛠️ Improvements & Bug Fixes**

### **8. Fixed Auto HTTPS Certificate Generation Issue**

Resolved an issue where Auto HTTPS certificate generation would fail when the current username contained a dot (`.`) character. Certificates will now be generated correctly regardless of special characters in the system username.

Thanks to [@dkoychev](https://github.com/dkoychev) for reporting this issue! [Issue #639](https://github.com/xpf0000/FlyEnv/issues/639)

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.14.2] - 2026-04-23

# **FlyEnv v4.14.2 Update Release Notes**

## **🚀 New Features**

### **1. Added Hermes Agent Module**

FlyEnv now integrates **[Hermes Agent](https://hermes-agent.nousresearch.com/)** — a powerful AI agent framework from Nous Research — directly into your development environment! You can now install, configure, and manage Hermes Agent with just a few clicks from the FlyEnv UI.

This integration allows you to:
- **One-Click Installation**: Install Hermes Agent seamlessly using the built-in installer
- **Gateway Management**: Start and stop the Hermes gateway service directly from the interface
- **AI Provider Configuration**: Easily configure AI providers including Ollama, OpenRouter, and Anthropic
- **Configuration File Editor**: View and edit core configuration files (`config.yaml`, `.env`, `SOUL.md`) within the UI
- **Session Management**: Browse and manage your chat sessions effortlessly
- **Skills Management**: Discover, install, update, and uninstall skills from multiple sources including official, community, GitHub, ClawHub, and LobeHub
- **Rich Command Shortcuts**: Access a comprehensive set of quick commands for chat, gateway, configuration, model auth, plugins, memory, MCP, logs, backup, and more
- **Log Viewer**: Monitor gateway and agent logs in real-time

*Supported on macOS and Linux.*

---

## **🛠️ Improvements & Bug Fixes**

### **2. Fixed Windows Tray Exit Issue**

Resolved a critical issue where exiting the application from the system tray was not functioning properly on Windows. The tray menu's quit action now correctly terminates the application.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.14.1] - 2026-04-11

# **FlyEnv v4.14.1 Update Release Notes**

## **🚀 New Features**

### **1. Added MkCert Module**

You can now easily generate locally-trusted development certificates with MkCert directly from FlyEnv! MkCert is a simple tool for making locally-trusted development certificates. It automatically installs a local CA in the system root store, and generates locally-trusted certificates.

This integration allows you to:
- Generate trusted SSL/TLS certificates for local development with a single click
- Automatically install and configure the local Certificate Authority
- Manage certificates for your local domains effortlessly
- Enable HTTPS for your local development environment without browser warnings

<img width="2684" height="1830" alt="image" src="https://github.com/user-attachments/assets/87aad5b6-f178-49d3-a464-e8cd9494968f" />

<img width="2684" height="1830" alt="image" src="https://github.com/user-attachments/assets/78fb4053-f249-4234-a652-a6482b298a24" />

---

## **🛠️ Improvements & Bug Fixes**

### **2. Fixed PostgreSQL Shutdown Issue**

Resolved a critical issue where PostgreSQL could not be properly stopped after starting. The service will now shut down gracefully when you stop it from the FlyEnv interface.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.14.0] - 2026-04-02

# **FlyEnv v4.14.0 Update Release Notes**

## **🚀 New Features**

### **1. Added RustFS Module**

Introducing RustFS support to FlyEnv! RustFS is a high-performance, distributed object storage system written in Rust. You can now easily install, configure, and manage RustFS directly from the FlyEnv interface, making it simple to set up your own S3-compatible storage service for development and testing.

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/9944de88-446a-4667-a76e-7f1b1567e1a0" />

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/a8db4399-c5db-41cd-82dd-18332c3b4762" />

---

### **2. Added SDKMAN Support**

FlyEnv now integrates with SDKMAN!, the Software Development Kit Manager. This allows you to easily manage multiple SDK versions for Java, Kotlin, Scala, Groovy, and many other JVM-based languages. Switch between different SDK versions seamlessly within your development environment.

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/b7180a2b-2067-465b-8aa8-d6a52f57648f" />

---

### **3. Added Interface Font Settings**

You can now customize the application interface font according to your preferences. This new setting allows you to:

- Choose from system-installed fonts
- Adjust font size for better readability
- Personalize your FlyEnv workspace for optimal comfort during long development sessions

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/63512cb2-4c11-43b4-9847-abc97069df28" />

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/d19ec114-97e2-4741-9eb9-a45d4f863a3f" />

---

### **4. Enhanced Project Service Support for All Languages**

We've added comprehensive project service support that works with **all programming languages**! This powerful feature enables you to:

- **Define Custom Start/Stop Commands**: Specify custom commands to start and stop your projects for any language
- **Port Configuration**: Assign specific ports for each project service
- **Quick Access**: Start and stop projects directly from the sidebar and system tray with one click
- **Reverse Proxy Integration**: Automatically configure site reverse proxy for your projects
- **Auto HTTPS**: Enable automatic HTTPS for secure local development
- **Cloudflare Tunnel Integration**: Combine with the Cloudflare Tunnel module for instant external network access

This feature creates a complete workflow for rapid project deployment, HTTPS domain access, and external network connectivity regardless of your tech stack.

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/9cfa3c5a-0f34-44fb-982b-75229903e1ca" />

<img width="2534" height="1736" alt="image" src="https://github.com/user-attachments/assets/e5e54fb6-9325-4475-8703-52a7803cddde" />

---

## **🛠️ Improvements & Bug Fixes**

### **5. Fixed Linux Project Environment Loading Issue**

Resolved an issue on Linux where changing directory (CD) to a project directory would fail to load the specified project environment correctly. Your project-specific environment variables and configurations will now be properly loaded when navigating to project directories.

### **6. Fixed DNS Service Wildcard Domain Support**

Fixed critical DNS service issues with wildcard domain resolution. FlyEnv's DNS service can now correctly resolve wildcard domains (e.g., `*.example.test`), making it much easier to work with multi-tenant applications and dynamic subdomain routing during local development.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**


## [4.13.6] - 2026-03-20

# **FlyEnv v4.13.6 Update Release Notes**

## **🚀 New Features**

### **1. Added n8n Module**

You can now easily integrate n8n into your local development environment. This update allows you to install and manage
the n8n service with just a single click directly from the UI.

Thanks to [@ibraimfarag](https://github.com/ibraimfarag) for the contribution! [PR #584](https://github.com/xpf0000/Fl
yEnv/pull/584)

<img width="2586" height="1778" alt="flyenv-capturer-1774008386" src="https://github.com/user-attachments/assets/3fc39d4b-1182-4959-acc2-c0d5300687ff" />
<img width="2586" height="1778" alt="flyenv-capturer-1774008402" src="https://github.com/user-attachments/assets/70e8b94b-682d-41b8-8aad-e6ceb9c6ca0f" />
<img width="2586" height="1778" alt="flyenv-capturer-1774013135" src="https://github.com/user-attachments/assets/cbc39d7d-145f-45f7-8c18-2b03289f7745" />

  ---

### **2. Enhanced OpenClaw Module**

#### **2.1 Configuration File Editor**
Added a dedicated configuration file tab to the OpenClaw module. You can now view and edit configuration files directl
y within the UI, making it easier to customize your OpenClaw setup.

#### **2.2 Quick Command Shortcuts**
Added quick access shortcuts for all OpenClaw commands, streamlining your workflow and improving productivity.

<img width="2586" height="1778" alt="flyenv-capturer-1774013359" src="https://github.com/user-attachments/assets/e93fd474-612f-492f-87d5-0da3628a1051" />
<img width="2586" height="1778" alt="flyenv-capturer-1774013332" src="https://github.com/user-attachments/assets/a8f340a3-3772-438f-8292-fdd2bba8a682" />

  ---

## **🛠️ Improvements & Bug Fixes**

### **3. Fixed fnm & nvm Issues**

Resolved critical issues where fnm and nvm were not functioning properly. You can now use these Node version managers
seamlessly within FlyEnv.

### **4. General Bug Fixes & Stability**

* Addressed various minor bugs and issues reported by the community to improve the overall stability and performance o
  f the application.

  ---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You
can verify the build process and download the artifacts directly from the following links:

* **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

  ---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**

## [4.13.4] - 2026-03-03

# **FlyEnv v4.13.4 Update Release Notes**

## **🚀 New Features**

### **1. Added OpenClaw Module**

You can now easily integrate OpenClaw into your local development environment. This update allows you to install and manage the OpenClaw service with just a single click directly from the UI.

<img width="1403" height="938" alt="openclaw" src="https://github.com/user-attachments/assets/b4a97273-fb0f-4113-9d33-749fa5725237" />

---

## **🛠️ Improvements & Bug Fixes**

### **2. Fixed Linux Environment Isolation**

Resolved a critical issue in the Linux version where environment isolation was failing to take effect. Your development environments on Linux will now remain strictly isolated as intended.

### **3. General Bug Fixes & Stability**

* Addressed various minor bugs and issues reported by the community to improve the overall stability and performance of the application.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

* **Global Build History:** [[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [[[GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)](https://github.com/xpf0000/FlyEnv/issues)](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**
