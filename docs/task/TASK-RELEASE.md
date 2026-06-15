# FlyEnv新版本4.15.4更新日志

本次更新内容：
1. 优化Windows版本各个服务的启动方式. 减少杀毒软件误报的几率.
2. 优化macOS版本各个服务的启动方式. 修复和某些终端软件(会修改系统默认ZSH)有冲突,导致FlyEnv内服务无法启动的问题.
3. 优化Windows和Linux开机启动代码. 修复在文件夹路径里有空格时, 会导致无法正确设置开机启动的问题.
4. 修复Mailpit新版本无法正确获取版本号的问题.
5. 修复RabbitMQ无法启用管理插件导致web面板无法正确使用的问题.

参照：
```
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
```

出一个FlyEnv最新版本的更新日志。 添加到 RELEASE_NOTES.md 里
如果需要了解各个模块的功能，可以从代码里查看。
@xxx需要你打开具体的url去获取。
