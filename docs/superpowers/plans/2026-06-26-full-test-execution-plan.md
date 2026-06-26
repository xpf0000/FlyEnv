# Full Test Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute FlyEnv's full available automated test surface, then run the runtime-dependent smoke checks and packaging builds that are feasible on each platform, while separating known baseline failures from new regressions.

**Architecture:** Run in collection mode instead of fail-fast so one broken suite does not hide later failures. Split the run into four layers: environment/baseline capture, static analysis, headless script suites, and runtime/package integration, because this repository mixes pure TypeScript checks, Go helper checks, Electron/MCP smoke tests, and platform-specific packaging.

**Tech Stack:** Yarn, TypeScript (`tsc`, `vue-tsc`, `tsx`), ESLint, Go, Electron, esbuild, Vite, PowerShell, GitHub Actions parity workflows

---

### Task 1: Establish Execution Baseline

**Files:**
- Reference: `package.json`
- Reference: `tsconfig.json`
- Reference: `.github/workflows/macos-version-build.yml`
- Reference: `.github/workflows/windows-version-build.yml`
- Reference: `.github/workflows/linux-version-build.yml`

- [ ] **Step 1: Capture repo and toolchain state**

Run:

```bash
git status --short
node -v
yarn -v
go version
uname -a
```

Expected: all tool versions print successfully, and the working tree state is recorded before test execution.

- [ ] **Step 2: Confirm dependencies are installed**

Run:

```bash
yarn install
```

Expected: `yarn install` completes without dependency-resolution errors.

- [ ] **Step 3: Use collection mode for the first full run**

Run each suite independently rather than chaining with `&&`.

Expected: a failure in one suite does not block later suites, so the final report can distinguish isolated regressions from broad breakage.

### Task 2: Run Static Quality Gates

**Files:**
- Reference: `eslint.config.mjs`
- Reference: `tsconfig.json`
- Reference: `configs/vite.config.ts`

- [ ] **Step 1: Run ESLint across the repo**

Run:

```bash
npx eslint . --ext .ts,.tsx,.vue,.js,.mjs
```

Expected: zero ESLint errors. Warnings are recorded separately if present.

- [ ] **Step 2: Run TypeScript compiler check**

Run:

```bash
npx tsc --noEmit
```

Expected: currently this is known to fail on the existing baseline in:

```text
scripts/phase3-command-inline-test.ts
src/main/ui/SiteSucker/LinkTask.ts
src/render/util/markdown/plugins/containers.ts
```

Any new failing file outside this set is treated as a new regression.

- [ ] **Step 3: Run Vue-aware type check**

Run:

```bash
npx vue-tsc --noEmit -p tsconfig.json
```

Expected: catches SFC/type issues that plain `tsc` may miss. Any failure is recorded as part of the static-check report.

- [ ] **Step 4: Verify dev-runner build path**

Run:

```bash
yarn build-dev-runner
```

Expected: `electron/dev-runner.mjs` is rebuilt successfully.

### Task 3: Run Headless Automated Script Suites

**Files:**
- Reference: `scripts/helper-contract-check.ts`
- Reference: `scripts/helper-go-test.ts`
- Reference: `scripts/phase3-command-inline-test.ts`
- Reference: `scripts/phase4-install-terminal-cron-test.ts`
- Reference: `scripts/powershell-command-test.ts`
- Reference: `scripts/brew-info-json-fallback-test.ts`
- Reference: `scripts/mailpit-version-detect-test.ts`
- Reference: `scripts/mcp-list-services-cache-test.ts`
- Reference: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Run helper contract validation**

Run:

```bash
yarn test:helper:contract
```

Expected: helper contract and dispatch definitions stay in sync.

- [ ] **Step 2: Run Go helper tests and vet**

Run:

```bash
yarn test:helper
```

Expected: on macOS/Linux this runs full `go test ./...` and `go vet ./...`; on Windows non-admin it intentionally skips the helper-go main package and still validates module/utils packages.

- [ ] **Step 3: Run command/script generation regression checks**

Run:

```bash
npx tsx scripts/phase3-command-inline-test.ts
npx tsx scripts/phase4-install-terminal-cron-test.ts
npx tsx scripts/powershell-command-test.ts
```

Expected: all three pass; on non-Windows hosts the PowerShell script only validates generation/encoding behavior and skips live `powershell.exe` execution.

- [ ] **Step 4: Run utility regression checks**

Run:

```bash
npx tsx scripts/brew-info-json-fallback-test.ts
npx tsx scripts/mailpit-version-detect-test.ts
```

Expected: both pass without needing external services.

- [ ] **Step 5: Run MCP regression checks**

Run:

```bash
npx tsx scripts/mcp-list-services-cache-test.ts
npx tsx scripts/mcp-regression-test.ts
```

Expected: both pass. The `stopAllService ... stop failed ...` line in `mcp-regression-test.ts` is expected from its intentional partial-failure path.

### Task 4: Run Runtime-Dependent Smoke Tests

**Files:**
- Reference: `scripts/mcp-smoke-test.ts`
- Reference: `scripts/mcp-diagnose-flags.ts`
- Reference: `scripts/service-spawn-smoke.ts`
- Reference: `src/render/components/MCP/setup.ts`
- Reference: `src/render/util/MCP.ts`

- [ ] **Step 1: Start FlyEnv in dev mode**

Run:

```bash
yarn dev
```

Expected: Electron app launches and the renderer/main/fork processes come up normally.

- [ ] **Step 2: Start MCP manually inside FlyEnv**

Use the MCP panel to start the server, because runtime startup is intentionally user-driven and not auto-persisted.

Expected: MCP panel reports running status and exposes host/port/token.

- [ ] **Step 3: Run HTTP MCP smoke test against the live app**

Run:

```bash
npx tsx scripts/mcp-smoke-test.ts http://127.0.0.1:7682 <token>
```

Expected: invalid-token rejection, tool listing, `list_services`, `service_status`, `list_config_files`, `list_log_files`, `list_online_versions`, and resource listing all succeed.

- [ ] **Step 4: Use the MCP diagnostics script only on failure**

Run:

```bash
npx tsx scripts/mcp-diagnose-flags.ts http://127.0.0.1:7682 <token>
```

Expected: only needed if the smoke test fails and we need a narrower diagnosis of enabled tools/flags behavior.

- [ ] **Step 5: Run real-binary service spawn smoke only for locally installed modules**

Run:

```bash
MODULE=nginx npx tsx scripts/service-spawn-smoke.ts
MODULE=mailpit npx tsx scripts/service-spawn-smoke.ts
```

Expected: only run for modules that actually exist on the current machine under the local FlyEnv runtime paths; each selected module should start, stay alive, avoid landing `start-*.sh`, and stop cleanly.

### Task 5: Run Platform Package Builds

**Files:**
- Reference: `scripts/app-builder.ts`
- Reference: `src/helper-go/build.sh`
- Reference: `src/helper-go/build-os.sh`
- Reference: `src/helper-go/build-win.ps1`
- Reference: `.github/workflows/macos-version-build.yml`
- Reference: `.github/workflows/windows-version-build.yml`
- Reference: `.github/workflows/linux-version-build.yml`

- [ ] **Step 1: Run the macOS-local build path on the current machine**

Run:

```bash
cd src/helper-go && bash ./build.sh
cd /Users/x/Desktop/WorkSpace/GitHub/FlyEnv
yarn build
```

Expected: Go helper builds for the current macOS environment and the Electron production package build completes.

- [ ] **Step 2: Schedule Linux parity build on a Linux runner**

Run on Ubuntu (matching CI prerequisites):

```bash
yarn install
cd src/helper-go && bash ./build-os.sh
cd /workspace/FlyEnv
yarn build
```

Expected: Linux `.deb`/`.rpm` build path matches `.github/workflows/linux-version-build.yml`.

- [ ] **Step 3: Schedule Windows parity build on a Windows runner**

Run on Windows 2022 with PowerShell:

```powershell
yarn install
cd src/helper-go
.\build-win.ps1
cd $env:GITHUB_WORKSPACE
yarn build
```

Expected: Windows packaging path matches `.github/workflows/windows-version-build.yml`.

- [ ] **Step 4: Run admin-only Windows helper validation on a Windows admin shell**

Run:

```powershell
yarn run test:helper:go:admin
yarn run test:helper:go:vet:admin
```

Expected: privileged Windows helper code paths are covered on the correct host type.

### Task 6: Produce Final Test Report

**Files:**
- Reference: `docs/superpowers/plans/2026-06-26-full-test-execution-plan.md`

- [ ] **Step 1: Summarize pass/fail by layer**

Report four groups separately:

```text
1. Static checks
2. Headless automated scripts
3. Runtime smoke tests
4. Platform/package builds
```

Expected: the report makes it obvious whether failures are compile-time, script-level, runtime-only, or packaging-only.

- [ ] **Step 2: Call out baseline failures explicitly**

Expected: existing known failures are listed as baseline, not mixed into new regressions.

- [ ] **Step 3: Separate blocked-by-environment results**

Expected: anything that needs Windows admin, Linux packaging deps, or locally installed service binaries is marked `not run` or `environment-gated` rather than `failed`.

