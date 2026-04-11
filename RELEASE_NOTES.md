# FlyEnv Release Notes

All notable changes to FlyEnv will be documented in this file.

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


