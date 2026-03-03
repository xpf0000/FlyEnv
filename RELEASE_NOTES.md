# FlyEnv Release Notes

All notable changes to FlyEnv will be documented in this file.

## [4.13.3] - 2026-03-03

### 🚀 New Features

- **Cloudflare Tunnel Module** - Added support for managing Cloudflare Tunnels directly within FlyEnv
- **Cloudflared Module** - Introduced Cloudflared integration for secure tunneling capabilities
- **Enhanced Project Creation** - Python and Go modules now include new project creation features for improved developer workflow

### 🐛 Bug Fixes

- **DNS IP Address Binding** - Fixed DNS service startup issues on Windows
  - Added new `bind` configuration option to the DNS module settings
  - Allows specifying a custom IP address for DNS binding
  - Resolves conflicts where Windows system services occupy `0.0.0.0:53`, preventing DNS from starting

---

## [4.13.2] - 2026-02-xx

