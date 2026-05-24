# FlyEnv新版本4.15.2更新日志

本次更新内容：
1. 添加 .NET 模块.
   https://github.com/xpf0000/FlyEnv/issues/662
   感谢 @xxx 提出的此Issues.
2. 添加 Cron Jobs 模块.
   https://github.com/xpf0000/FlyEnv/pull/674
   感谢 @xxx 提出的此PR.
3. add Korean translation
   https://github.com/xpf0000/FlyEnv/pull/676
      感谢 @xxx 提出的此PR.
4. 修复mongodb MacOS下启动问题
   https://github.com/xpf0000/FlyEnv/issues/679
      感谢 @xxx 提出的此Issues.
5. 修复Flutter 安装失败
   https://github.com/xpf0000/FlyEnv/issues/682
   感谢 @xxx 提出的此Issues.

参照：
```
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
```

出一个FlyEnv最新版本的更新日志。 添加到 RELEASE_NOTES.md 里
如果需要了解各个模块的功能，可以从代码里查看。
@xxx需要你打开具体的url去获取。
