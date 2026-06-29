# AI CLI Windows Proxy Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Windows proxy environment injection for the Claude Code, Kimi, and OpenCode installers without changing OpenCode's current Windows installer command.

**Architecture:** Add one shared helper that turns a proxy env map into shell-specific command lines for FlyEnv's PTY shells, then reuse it in the three AI CLI installer flows. Cover the helper with a script-level regression test so Windows PowerShell and Unix shell output stays correct and escaped.

**Tech Stack:** TypeScript, Vue 3 renderer setup modules, `tsx` script-based regression tests, ESLint

---

## File Structure

- Create: `src/shared/installProxyEnv.ts`
  Purpose: generate PowerShell `$env:` assignments for Windows and `export` assignments for Unix shells from `window.Server.Proxy`.
- Create: `scripts/ai-cli-install-proxy-test.ts`
  Purpose: regression-test the helper for platform branching and escaping.
- Modify: `src/render/components/ClaudeCode/setup.ts`
  Purpose: use the shared helper before the official Claude Code installer command.
- Modify: `src/render/components/Kimi/setup.ts`
  Purpose: use the shared helper before the official Kimi installer command.
- Modify: `src/render/components/OpenCode/setup.ts`
  Purpose: use the shared helper before the existing OpenCode installer command.

### Task 1: Add the Failing Regression Test

**Files:**
- Create: `scripts/ai-cli-install-proxy-test.ts`
- Test: `scripts/ai-cli-install-proxy-test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import { buildInstallProxyEnvCommands } from '../src/shared/installProxyEnv'

assert.deepEqual(buildInstallProxyEnvCommands('windows', {}), [])
assert.deepEqual(buildInstallProxyEnvCommands('linux', {}), [])

assert.deepEqual(
  buildInstallProxyEnvCommands('windows', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    CODEX_TEST: 'value"$HOME`\\'
  }),
  [
    '$env:HTTPS_PROXY="http://127.0.0.1:7890"',
    '$env:CODEX_TEST="value`"``$HOME`\\\\"'
  ]
)

assert.deepEqual(
  buildInstallProxyEnvCommands('linux', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    CODEX_TEST: 'value"$HOME`\\'
  }),
  [
    'export HTTPS_PROXY="http://127.0.0.1:7890"',
    'export CODEX_TEST="value\\"\\$HOME\\`\\\\"'
  ]
)

console.log('ai-cli-install-proxy-test: ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/ai-cli-install-proxy-test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or an equivalent import error because `src/shared/installProxyEnv.ts` does not exist yet.

### Task 2: Implement the Shared Proxy Command Helper

**Files:**
- Create: `src/shared/installProxyEnv.ts`
- Test: `scripts/ai-cli-install-proxy-test.ts`

- [ ] **Step 1: Write minimal implementation**

```ts
export type InstallProxyPlatform = 'windows' | 'macos' | 'linux'

function escapePowerShellDoubleQuoted(value: string): string {
  return value.replace(/[`"$\\]/g, (char) => `\`${char}`)
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

export function buildInstallProxyEnvCommands(
  platform: InstallProxyPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  const commands: string[] = []

  Object.entries(proxyEnv).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      return
    }
    if (platform === 'windows') {
      commands.push(`$env:${key}="${escapePowerShellDoubleQuoted(value)}"`)
      return
    }
    commands.push(`export ${key}="${escapeShellDoubleQuoted(value)}"`)
  })

  return commands
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx tsx scripts/ai-cli-install-proxy-test.ts`

Expected: PASS with `ai-cli-install-proxy-test: ok`

### Task 3: Reuse the Helper in the Three Installer Flows

**Files:**
- Modify: `src/render/components/ClaudeCode/setup.ts`
- Modify: `src/render/components/Kimi/setup.ts`
- Modify: `src/render/components/OpenCode/setup.ts`
- Test: `scripts/ai-cli-install-proxy-test.ts`

- [ ] **Step 1: Update Claude Code installer**

Replace the inline proxy loop with helper usage:

```ts
import { buildInstallProxyEnvCommands, type InstallProxyPlatform } from '@shared/installProxyEnv'

const installPlatform: InstallProxyPlatform = window.Server.isWindows
  ? 'windows'
  : window.Server.isMacOS
    ? 'macos'
    : 'linux'

const command = buildInstallProxyEnvCommands(
  installPlatform,
  (window.Server.Proxy ?? {}) as Record<string, string>
)

if (window.Server.isWindows) {
  command.push('irm https://claude.ai/install.ps1 | iex')
} else {
  command.push('curl -fsSL https://claude.ai/install.sh | bash')
}
```

- [ ] **Step 2: Update Kimi installer**

Use the same helper pattern, keeping the current installer commands intact:

```ts
const command = buildInstallProxyEnvCommands(
  installPlatform,
  (window.Server.Proxy ?? {}) as Record<string, string>
)

if (window.Server.isWindows) {
  command.push('irm https://code.kimi.com/kimi-code/install.ps1 | iex')
} else {
  command.push('curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash')
}
```

- [ ] **Step 3: Update OpenCode installer**

Use the helper but leave the actual installer command unchanged:

```ts
const command = buildInstallProxyEnvCommands(
  installPlatform,
  (window.Server.Proxy ?? {}) as Record<string, string>
)

command.push('npm install -g opencode-ai')
```

- [ ] **Step 4: Run regression test again**

Run: `npx tsx scripts/ai-cli-install-proxy-test.ts`

Expected: PASS with `ai-cli-install-proxy-test: ok`

- [ ] **Step 5: Run targeted lint**

Run: `npx eslint src/shared/installProxyEnv.ts src/render/components/ClaudeCode/setup.ts src/render/components/Kimi/setup.ts src/render/components/OpenCode/setup.ts scripts/ai-cli-install-proxy-test.ts`

Expected: exit `0`

- [ ] **Step 6: Commit**

```bash
git add src/shared/installProxyEnv.ts \
  scripts/ai-cli-install-proxy-test.ts \
  src/render/components/ClaudeCode/setup.ts \
  src/render/components/Kimi/setup.ts \
  src/render/components/OpenCode/setup.ts \
  docs/superpowers/specs/2026-06-27-ai-cli-windows-proxy-install-design.md \
  docs/superpowers/plans/2026-06-27-ai-cli-windows-proxy-install-plan.md
git commit -m "fix: correct windows proxy injection for ai cli installers"
```
