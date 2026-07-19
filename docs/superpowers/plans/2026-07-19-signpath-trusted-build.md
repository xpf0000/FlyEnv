# SignPath Trusted Build Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every Windows release signing request through SignPath's trusted GitHub Artifact connector so `release-signing` no longer returns HTTP 403.

**Architecture:** Build the Windows application payload first, extract only unsigned PE files into a path-preserving GitHub artifact, sign and overlay them, then package the signed directory with Electron Builder's `prepackaged` option. Sign the outer setup and portable executables through a second trusted GitHub Artifact request.

**Tech Stack:** TypeScript, Electron Builder, PowerShell, GitHub Actions, SignPath GitHub Action v2

---

### Task 1: Add a signing workflow regression test

**Files:**

- Create: `scripts/windows-signpath-workflow-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing source-contract test**

The test reads the workflow, builder, Windows configuration, and PowerShell bundle script. It asserts that no `Submit-SigningRequest` call remains, the workflow contains an app signing request and an installer signing request using `signpath/github-action-submit-signing-request@v2`, the app request uses `windows-app`, and the builder exposes `app` and `installers` stages.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx tsx scripts/windows-signpath-workflow-test.ts`

Expected: FAIL because the direct PowerShell submission still exists and the two-stage workflow is absent.

- [ ] **Step 3: Add `test:windows-signing` to package scripts**

```json
"test:windows-signing": "tsx scripts/windows-signpath-workflow-test.ts"
```

### Task 2: Add two-stage Windows packaging

**Files:**

- Modify: `scripts/app-builder.ts`

- [ ] **Step 1: Replace the detached promise chain with an awaited `main()`**

Make build errors set a non-zero exit code. Preserve the normal macOS/Linux/default Windows behavior.

- [ ] **Step 2: Add the `app` stage**

When `FLYENV_WINDOWS_BUILD_STAGE=app`, compile production assets and build the Windows portable target. This creates `release/win-unpacked` and adds `resources/elevate.exe`; the disposable portable executable is overwritten by the final stage.

- [ ] **Step 3: Add the `installers` stage**

When `FLYENV_WINDOWS_BUILD_STAGE=installers`, require `FLYENV_PREPACKAGED_APP_DIR`, skip compilation, set Electron Builder's `prepackaged` option, and build `nsis` and `portable`. Set `nsis.packElevateHelper=false` and `portable.useZip=true` so neither target replaces the signed elevate helper; `packElevateHelper` is not a valid portable option.

### Task 3: Stage and apply unsigned PE files

**Files:**

- Create: `scripts/windows-signpath-bundle.ps1`

- [ ] **Step 1: Implement `Pack` mode**

Recursively select `.exe`, `.dll`, and `.node`, reject non-PE files by checking the `MZ` header, skip files with a valid existing Authenticode signature, and copy the remaining files to the bundle directory while preserving relative paths. Fail if no files are staged.

- [ ] **Step 2: Implement `Apply` mode**

Require every returned file to be PE and have a valid Authenticode signature. Reject paths outside the app directory and missing destination files, then copy each signed file over its unsigned counterpart. Fail if no files are applied.

### Task 4: Replace direct signing with trusted GitHub actions

**Files:**

- Modify: `.github/workflows/windows-version-build.yml`
- Modify: `configs/electron-builder.win.ts`
- Delete: `build/afterPackSign.ts`

- [ ] **Step 1: Remove the SignPath PowerShell module and direct-hook environment**

The app build step runs `yarn build` with `FLYENV_WINDOWS_BUILD_STAGE=app` and no SignPath API token.

- [ ] **Step 2: Add the app payload signing sequence**

Run the bundle script in `Pack` mode, upload the staging directory, call `signpath/github-action-submit-signing-request@v2` with `windows-app`, download to a signed staging directory, and run `Apply` mode.

- [ ] **Step 3: Package the signed payload**

Run `node electron/app-builder.mjs` with `FLYENV_WINDOWS_BUILD_STAGE=installers` and `FLYENV_PREPACKAGED_APP_DIR=release/win-unpacked`.

- [ ] **Step 4: Upgrade outer signing to Action v2**

Keep `windows-installer`, its GitHub artifact ID, and the signed output upload. Set both signing waits to 1800 seconds.

- [ ] **Step 5: Remove obsolete Electron Builder signing hooks**

Keep `AfterSign` for helper relocation. Remove `AfterPackSign`, `customSign`, and `signtoolOptions.sign`; delete the direct signing implementation.

### Task 5: Verify without a full Electron build

**Files:**

- Test: `scripts/windows-signpath-workflow-test.ts`

- [ ] **Step 1: Run the focused regression test**

Run: `yarn test:windows-signing`

Expected: PASS.

- [ ] **Step 2: Run formatting and lint checks on changed files**

Run Prettier in check mode and ESLint for the changed TypeScript files. Parse the workflow with the installed YAML library and parse the PowerShell script when `pwsh` is available.

- [ ] **Step 3: Run repository integrity checks**

Run: `git diff --check`

Expected: exit code 0.
