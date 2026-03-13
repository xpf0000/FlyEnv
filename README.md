# FlyEnv

<div align="center">
  <img src="https://raw.githubusercontent.com/xpf0000/FlyEnv/master/build/256x256.png" width="180" alt="FlyEnv Logo" />

  <h1>Develop Faster. Run Native. Forget Containers.</h1>

  <p>
    The <strong>lightweight</strong>, <strong>modular</strong> full-stack development environment manager for Windows, macOS, and Linux.<br>
    One-click install for Apache, PHP, Node.js, Python, databases, and more—running natively at full speed—<strong>no Docker required</strong>.<br>
    Switch versions instantly, manage databases, and deploy local SSL—<strong>zero Docker overhead</strong>.
  </p>

*⚡️ Get your development environment ready in under 60 seconds*

  <p>
    <a href="https://github.com/xpf0000/FlyEnv/releases"><img src="https://img.shields.io/github/release/xpf0000/FlyEnv.svg" alt="GitHub release"></a>
    <a href="https://github.com/xpf0000/FlyEnv/releases"><img src="https://img.shields.io/github/downloads/xpf0000/FlyEnv/total.svg" alt="Total Downloads"></a>
    <a href="https://ko-fi.com/R5R2OJXTM"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="ko-fi"></a>
  </p>
</div>

---

## 🚀 Why FlyEnv?

Most dev tools are either too heavy (Docker Desktop) or too limited (NVM/Homebrew). FlyEnv hits the sweet spot:

| Feature | FlyEnv | Docker Desktop | XAMPP/MAMP |
| :--- | :--- | :--- | :--- |
| **Performance** | **🚀 Native (Binaries)** | 🐢 Slow (Virtualization) | 🚀 Native |
| **Resource Usage** | **🍃 Low RAM** | 🐘 Heavy (2GB+ Idle) | 🍃 Low |
| **Isolation** | **✅ Project-Based** | ✅ Container-Based | ❌ Global Only |
| **Setup Time** | **⚡️ < 1 Minute** | ⏳ Slow Builds | ⏳ Manual Config |

### Core Benefits

* **💎 Not Bloated:** FlyEnv is **modular**. It only installs the runtimes you explicitly need. Don't use Java? It won't touch your disk.
* **⚡ Native Speed:** Runs Nginx, PHP, and MySQL as static binaries. No containers means faster I/O and instant startup.
* **🛡️ Project Isolation:** Automatically switches Node/PHP versions when you `cd` into a project directory.
* **🔧 Full Stack Ready:** Need a Redis queue, MongoDB, or Minio? Enable them with one click.

---

## 🎯 Tailored for Your Workflow

<details open>
<summary><strong>🐘 For PHP & Laravel Developers</strong></summary>

> The best **Windows alternative to Laravel Herd**.

> * Switch between PHP 5.6, 7.4, 8.x instantly.
> * Run Nginx/Apache, MySQL, Redis, and Mailpit out of the box.
> * Native `composer` performance (no file-sharing lag).
> * **[Download for Windows](#windows-recommended)**

</details>

<details>
<summary><strong>🟢 For Node.js & Frontend Developers</strong></summary>

> Stop fighting with NVM.

> * Define Node versions per project (automatically detects `package.json`).
> * Instant access to Elasticsearch, PostgreSQL, or RabbitMQ without `docker-compose`.
> * Supports Bun, Deno, and PM2 management.

</details>

<details>
<summary><strong>☕ For Java, Python & Go Developers</strong></summary>

> * Manage multiple JDKs (Maven/Gradle included) and Python environments effortlessly.
> * Keep your global system PATH clean and organized.

</details>

---

## 📦 Supported Modules (On-Demand)

FlyEnv allows you to install **only what you need** from a vast library of supported software:

* **AI Integration**: OpenClaw, Ollama, DeepSeek, Chatbox
* **Containers**: Podman.
* **Network Tunnel**: Cloudflared, Cloudflare Tunnel.
* **Web Servers**: Apache, Nginx, Caddy, Tomcat, Consul.
* **Databases**: MySQL, MariaDB, PostgreSQL, MongoDB, Qdrant.
* **Email Server**: Mailpit.
* **Programming Languages**: PHP (Composer), Java (Maven, Gradle), Node.js, Python, Go, Erlang, Ruby, Rust (Rustup), Bun, Deno, Zig.
* **Data Queue & Cache**: Redis, Memcached, RabbitMQ, etcd.
* **Search Engine**: Elasticsearch, Meilisearch, Typesense
* **Object Storage**: Minio.
* **Utilities**: DNS Server, FTP Server, Static HTTP Server.
* **Custom modules**: Users can add modules on their own, whether as services or commonly used commands. FlyEnv's custom module system ensures that user modules function just like system modules, delivering a seamless user experience.

> *All modules support multi-version co-existence.*

---

## 🛠 Developer-Friendly Tools

* **Local Domains & SSL:** Create local sites (`myapp.test`) with custom domains and **one-click HTTPS**.
* **Config & Logs:** Edit `php.ini` or `my.cnf` directly in FlyEnv. View real-time error logs with highlighting.
* **Port Management:** Visualize which apps are using which ports and kill processes instantly.

[Watch Video Demo](https://flyenv.com/#tools-modules)

![screen3.jpeg](./screen3.jpeg)

---

## 📥 Installation

### Windows (Recommended)

Finally, a fast, native environment for Windows developers.

* **Installer:** [FlyEnv-Setup-4.13.4.exe](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-Setup-4.13.4.exe)
* **Portable:** [FlyEnv-Portable-4.13.4.exe](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-Portable-4.13.4.exe)

### macOS

* **Homebrew:** `brew install flyenv`
* **DMG (Intel):** [FlyEnv-4.13.4.dmg](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4.dmg)
* **DMG (Apple Silicon):** [FlyEnv-4.13.4-arm64.dmg](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4-arm64.dmg)

### Linux

Supports Debian/Ubuntu (.deb) and RedHat/CentOS (.rpm).

#### Debian / Ubuntu

- **x86_64**: [FlyEnv-4.13.4-x64.deb](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4-x64.deb)
- **ARM64**: [FlyEnv-4.13.4-arm64.deb](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4-arm64.deb)

#### Red Hat / Fedora / SUSE / CentOS

- **x86_64**: [FlyEnv-4.13.4-x64.rpm](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4-x64.rpm)
- **ARM64**: [FlyEnv-4.13.4-arm64.rpm](https://github.com/xpf0000/FlyEnv/releases/download/v4.13.4/FlyEnv-4.13.4-arm64.rpm)

---

**📦 Build & Transparency**

All FlyEnv installation packages are now built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

* **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)
* **Windows Build:** [[Run #21811918057](https://github.com/xpf0000/FlyEnv/actions/runs/21811918057)](https://github.com/xpf0000/FlyEnv/actions/runs/21811918057)
* **macOS Build:** [[Run #21799936855](https://github.com/xpf0000/FlyEnv/actions/runs/21799936855)](https://github.com/xpf0000/FlyEnv/actions/runs/21799936855)
* **Linux Build:** [[Run #21799936847](https://github.com/xpf0000/FlyEnv/actions/runs/21799936847)](https://github.com/xpf0000/FlyEnv/actions/runs/21799936847)

---

## 📸 Interface Preview

<table>
<thead>
<tr>
<th width="50%" align="center">Service Management</th>
<th width="50%" align="center">Version Switching</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><a target="_blank" rel="noopener noreferrer" href="./screen1.jpeg"><img src="./screen1.jpeg" alt="Manage Services" width="100%" style="max-width: 100%;"></a></td>
<td align="center"><a target="_blank" rel="noopener noreferrer" href="./screen2.jpeg"><img src="./screen2.jpeg" alt="Version Switching" width="100%" style="max-width: 100%;"></a></td>
</tr>
<tr>
<td align="center"><strong>Manage Nginx/MySQL/Redis in one place</strong></td>
<td align="center"><strong>Switch PHP/Node versions per project</strong></td>
</tr>
</tbody>
</table>

---

## Development & Contribution

We welcome contributions! FlyEnv is built with Node.js & web technologies (Electron/Vue).

```bash
git clone git@github.com:xpf0000/FlyEnv.git
cd FlyEnv
yarn install
yarn run dev
```

Check out our [Development Guide](./DEV.md) to get started.

## Community & Support

* **Technical Deep Dive:** [Architecture Analysis](https://deepwiki.com/xpf0000/FlyEnv)
* **Facebook Group:**[Facebook Group](https://www.facebook.com/groups/908637655411162)
* **Discord:** [Join Community](https://discord.gg/u5SuMGxjPE)
* **Discussions:** [GitHub Discussions](https://github.com/xpf0000/FlyEnv/discussions)
* **Website:** [flyenv.com](https://www.flyenv.com)

**License:** Open-source under the [BSD 3-Clause License](https://github.com/xpf0000/FlyEnv/blob/master/LICENSE).
