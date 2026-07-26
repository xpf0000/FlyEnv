# FlyEnv v4.17.1 Release Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an English, user-facing v4.17.1 entry that accurately describes the five requested FlyEnv changes.

**Architecture:** Prepend one self-contained release entry to the existing chronological `RELEASE_NOTES.md` document. The entry follows the established release-note template, separates features from fixes, links the relevant GitHub Issues, and preserves the existing transparency and feedback footer.

**Tech Stack:** Markdown, Git, Prettier

---

### Task 1: Add the v4.17.1 release entry

**Files:**
- Modify: `RELEASE_NOTES.md:5` (insert immediately before the v4.17.0 heading)

- [ ] **Step 1: Verify the source facts before writing**

  Review the supplied GitHub Issues and the corresponding modules before drafting:

  ```bash
  curl --location --silent https://api.github.com/repos/xpf0000/FlyEnv/issues/774
  curl --location --silent https://api.github.com/repos/xpf0000/FlyEnv/issues/730
  curl --location --silent https://api.github.com/repos/xpf0000/FlyEnv/issues/782
  curl --location --silent https://api.github.com/repos/xpf0000/FlyEnv/issues/756
  curl --location --silent https://api.github.com/repos/xpf0000/FlyEnv/issues/797
  rg -n 'typeFlag: .(clickhouse|temporal|temporal-cli).|startupGroupDo|WindowsElevationMethod|fallbackToUac' src
  ```

  Expected: ClickHouse, Temporal, Temporal CLI, tray startup-group actions, the Windows elevation setting, and the Helper-to-UAC fallback are all present in the sources.

- [ ] **Step 2: Insert the release entry**

  Add the following Markdown directly above `## [4.17.0] - 2026-07-19`:

  ```markdown
  ## [4.17.1] - 2026-07-26

  # **FlyEnv v4.17.1 Update Release Notes**

  ## **🚀 New Features**

  ### **1. Added ClickHouse Support**

  FlyEnv now includes a dedicated **ClickHouse** module for installing, managing, configuring, and monitoring local ClickHouse database servers on macOS and Linux.

  This integration provides:
  - **Version Management**: Download and manage ClickHouse releases directly from FlyEnv
  - **Service Controls**: Start and stop installed ClickHouse versions alongside your other local services
  - **Configuration and Logs**: Edit the `config.xml` and `users.xml` files and review server, startup, and error logs from the module
  - **Built-In Browser UI**: Open a managed CH-UI browser interface for a running ClickHouse server

  [Issue #774](https://github.com/xpf0000/FlyEnv/issues/774)

  ---

  ### **2. Added Temporal Server Support**

  FlyEnv now includes a dedicated **Temporal** module for running a local Temporal Server. You can download and manage server versions, edit the generated server configuration, inspect logs, and open the Temporal Web UI when you need to explore workflows and namespaces in a browser.

  [Issue #730](https://github.com/xpf0000/FlyEnv/issues/730)

  ---

  ### **3. Added Temporal CLI Support**

  A separate **Temporal CLI** module is now available for local development workflows. It manages the official Temporal CLI and its `temporal server start-dev` development server, with configurable ports, local database settings, logs, and direct access to the built-in Web UI.

  [Issue #730](https://github.com/xpf0000/FlyEnv/issues/730)

  ---

  ### **4. Control Startup Groups from the Tray Menu**

  Startup Groups are now displayed in the FlyEnv tray menu, ahead of individual services. You can start or stop a saved group directly from either tray style, making it easier to switch an entire project environment without opening the main window.

  [Issue #782](https://github.com/xpf0000/FlyEnv/issues/782)

  ---

  ## **🛠️ Improvements & Bug Fixes**

  ### **5. Improved Windows Privileged Operations and Helper Recovery**

  Windows users can now choose the elevation method used for operations that require administrator permission: the persistent FlyEnv Helper or standard **UAC** prompts. FlyEnv continues to use the Helper by default, while UAC offers a practical alternative for supported operations on systems where the Helper cannot be installed or used.

  If Helper installation fails, FlyEnv now automatically switches to UAC so supported privileged actions remain available instead of being blocked by the failed Helper setup.

  [Issue #756](https://github.com/xpf0000/FlyEnv/issues/756) [Issue #797](https://github.com/xpf0000/FlyEnv/issues/797)

  ---

  ## **📦 Build & Transparency**

  All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

  - **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

  ---

  We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

  **Enjoy the update!**
  ```

- [ ] **Step 3: Review the changed document**

  Run:

  ```bash
  sed -n '1,180p' RELEASE_NOTES.md
  git diff --check -- RELEASE_NOTES.md
  rg -n '^## \[4\.17\.1\]|Issue #(774|730|782|756|797)|ClickHouse|Temporal CLI|Startup Groups|UAC' RELEASE_NOTES.md
  ```

  Expected: v4.17.1 is the first release entry; every requested change and all five Issue references are present; no whitespace errors are reported.

- [ ] **Step 4: Check Markdown formatting**

  Run:

  ```bash
  yarn prettier --check RELEASE_NOTES.md
  ```

  Expected: exit code 0 and Prettier reports that the file uses its expected formatting.

- [ ] **Step 5: Commit the release-note update separately**

  Run:

  ```bash
  git add RELEASE_NOTES.md
  git commit -m "docs: add v4.17.1 release notes"
  ```

  Expected: one commit containing only `RELEASE_NOTES.md`; do not stage the pre-existing `docs/task/TASK-RELEASE.md` modification.
