# Windows Helper Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows helper detection distinguish missing binaries from ordinary helper failures, skip install when the helper binary is gone, and automatically fall back to one-time UAC PowerShell execution for the approved privileged helper calls.

**Architecture:** First lock the routing rules in pure TypeScript helpers so the fallback allowlist, error codes, and UI policy are testable without Electron. Then add the PowerShell fallback executor, wire `AppHelperCheck` / `AppHelper` / `Helper.send` to the new policy, and finally update IPC and renderer behavior so Windows users stop seeing broken install prompts when the helper binary has been removed by antivirus.

**Tech Stack:** TypeScript, Electron main/fork/renderer processes, Vue 3, PowerShell `-EncodedCommand`, `@shared/Sudo`, Node `assert`, `tsx`

---

## File Structure

| File | Responsibility |
|------|------|
| `src/shared/WindowsHelperState.ts` | Shared Windows helper error codes, allowlist, routing, and response helpers |
| `src/shared/WindowsHelperFallback.ts` | PowerShell fallback argument validation, inline-vs-temp planning, and privileged executor for allowlisted helper methods |
| `src/shared/PowerShellCommand.ts` | Shared helper to build inline PowerShell `-EncodedCommand` command strings |
| `src/shared/AppHelperCheck.ts` | Windows helper path resolution, structured helper check errors, injectable checker factory |
| `src/main/core/AppHelper.ts` | Skip install when helper binary is missing and emit structured helper status messages |
| `src/main/Application.ts` | Forward helper notice `reason` values to the renderer |
| `src/main/core/IPCHandler.ts` | Return structured helper check / helper command results instead of bare booleans |
| `src/fork/Helper.ts` | Route Windows helper failures to fallback or install prompt based on tested shared policy |
| `src/render/util/GlobalIPCOn.ts` | Use helper `reason` fields to suppress broken install dialogs |
| `src/render/store/helper.ts` | Windows install/fix dialogs that do not open a missing helper binary path |
| `src/render/components/Setup/FlyEnvHelper/setup.ts` | Setup-page helper fix flow that distinguishes binary-missing from repairable helper failures |
| `src/render/components/FlyEnvHelper/index.vue` | Install dialog command fetch that exits cleanly when no helper command can be generated |
| `scripts/windows-helper-state-test.ts` | Fast regression for allowlist, routing, and helper check response shape |
| `scripts/windows-helper-fallback-plan-test.ts` | Fast regression for inline-vs-temp-file fallback planning |
| `scripts/windows-helper-check-test.ts` | Fast regression for Windows helper binary existence and version-check behavior |

### Task 1: Lock Shared Windows Helper Policy

**Files:**
- Create: `src/shared/WindowsHelperState.ts`
- Create: `scripts/windows-helper-state-test.ts`

- [ ] **Step 1: Write the failing shared-policy regression**

Create `scripts/windows-helper-state-test.ts` with the exact cases the rest of the branch will rely on:

```ts
import assert from 'node:assert/strict'
import {
  AppHelperError,
  buildHelperCheckResponse,
  isWindowsHelperFallbackAllowed,
  resolveWindowsHelperTransport,
  shouldOpenHelperInstaller
} from '../src/shared/WindowsHelperState'

function main() {
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'writeFileByRoot'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'writeBufferBase64ByRoot'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'rm'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'setSystemPath'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'setSystemEnv'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'setAutoStartWin'), true)
  assert.equal(isWindowsHelperFallbackAllowed('host', 'sslAddTrustedCert'), true)
  assert.equal(isWindowsHelperFallbackAllowed('tools', 'readFileByRoot'), false)

  assert.equal(
    resolveWindowsHelperTransport(
      new AppHelperError('helper_binary_missing', 'missing'),
      'tools',
      'writeFileByRoot'
    ),
    'fallback'
  )
  assert.equal(
    resolveWindowsHelperTransport(
      new AppHelperError('helper_binary_missing', 'missing'),
      'tools',
      'readFileByRoot'
    ),
    'reject'
  )
  assert.equal(
    resolveWindowsHelperTransport(
      new AppHelperError('helper_unreachable', 'down'),
      'tools',
      'setSystemEnv'
    ),
    'fallback'
  )
  assert.equal(
    resolveWindowsHelperTransport(
      new AppHelperError('helper_unreachable', 'down'),
      'tools',
      'readFileByRoot'
    ),
    'prompt'
  )
  assert.equal(
    resolveWindowsHelperTransport(
      new AppHelperError('helper_version_mismatch', 'old'),
      'host',
      'sslAddTrustedCert'
    ),
    'fallback'
  )

  assert.deepEqual(buildHelperCheckResponse(null), { code: 0, data: true })
  assert.deepEqual(
    buildHelperCheckResponse(new AppHelperError('helper_binary_missing', 'missing')),
    {
      code: 1,
      data: false,
      reason: 'helper_binary_missing'
    }
  )
  assert.deepEqual(
    buildHelperCheckResponse(new AppHelperError('helper_unreachable', 'down')),
    {
      code: 1,
      data: false,
      reason: 'helper_unreachable'
    }
  )

  assert.equal(shouldOpenHelperInstaller('helper_binary_missing'), false)
  assert.equal(shouldOpenHelperInstaller('helper_unreachable'), true)
  assert.equal(shouldOpenHelperInstaller('helper_version_mismatch'), true)

  console.log('windows helper state test passed')
}

main()
```

- [ ] **Step 2: Run the regression to prove the policy module does not exist yet**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
```

Expected:

- The script fails with a module/export error for `../src/shared/WindowsHelperState`.

- [ ] **Step 3: Implement the shared helper policy module**

Create `src/shared/WindowsHelperState.ts` with the complete policy surface the rest of the implementation will call:

```ts
export type AppHelperErrorCode =
  | 'helper_binary_missing'
  | 'helper_unreachable'
  | 'helper_version_mismatch'
  | 'helper_execution_failed'
  | 'windows_fallback_not_supported'

export type WindowsHelperTransport = 'socket' | 'fallback' | 'prompt' | 'reject'

const WINDOWS_HELPER_FALLBACK_ALLOWLIST = new Set([
  'tools/writeFileByRoot',
  'tools/writeBufferBase64ByRoot',
  'tools/rm',
  'tools/setSystemPath',
  'tools/setSystemEnv',
  'tools/setAutoStartWin',
  'host/sslAddTrustedCert'
])

export class AppHelperError extends Error {
  code: AppHelperErrorCode

  constructor(code: AppHelperErrorCode, message: string) {
    super(message)
    this.name = 'AppHelperError'
    this.code = code
  }
}

export function isAppHelperError(
  error: unknown,
  code?: AppHelperErrorCode
): error is AppHelperError {
  const match = error instanceof AppHelperError
  if (!match) {
    return false
  }
  return code ? error.code === code : true
}

export function isWindowsHelperFallbackAllowed(module: string, fn: string): boolean {
  return WINDOWS_HELPER_FALLBACK_ALLOWLIST.has(`${module}/${fn}`)
}

export function resolveWindowsHelperTransport(
  error: unknown,
  module: string,
  fn: string
): WindowsHelperTransport {
  if (!isAppHelperError(error)) {
    return 'prompt'
  }
  if (isWindowsHelperFallbackAllowed(module, fn)) {
    if (
      error.code === 'helper_binary_missing' ||
      error.code === 'helper_unreachable' ||
      error.code === 'helper_version_mismatch' ||
      error.code === 'helper_execution_failed'
    ) {
      return 'fallback'
    }
  }
  if (error.code === 'helper_binary_missing') {
    return 'reject'
  }
  return 'prompt'
}

export function buildHelperCheckResponse(error: unknown) {
  if (!error) {
    return { code: 0, data: true }
  }
  if (isAppHelperError(error)) {
    return { code: 1, data: false, reason: error.code }
  }
  return { code: 1, data: false, reason: 'helper_execution_failed' as const }
}

export function shouldOpenHelperInstaller(reason?: string): boolean {
  return reason !== 'helper_binary_missing'
}
```

- [ ] **Step 4: Re-run the shared-policy regression**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
```

Expected:

- Output includes `windows helper state test passed`.

- [ ] **Step 5: Commit the shared policy layer**

Run:

```bash
git add src/shared/WindowsHelperState.ts scripts/windows-helper-state-test.ts
git commit -m "feat: add windows helper state policy"
```

### Task 2: Lock Validated Inline-vs-Temp Fallback Planning

**Files:**
- Create: `src/shared/WindowsHelperFallback.ts`
- Create: `scripts/windows-helper-fallback-plan-test.ts`
- Modify: `src/shared/PowerShellCommand.ts`

- [ ] **Step 1: Write the failing fallback-plan regression**

Create `scripts/windows-helper-fallback-plan-test.ts`. This regression spot-checks both command planning and the new fallback-only validation layer:

```ts
import assert from 'node:assert/strict'
import { buildWindowsHelperFallbackPlan } from '../src/shared/WindowsHelperFallback'

function main() {
  const inlinePlan = buildWindowsHelperFallbackPlan(
    'tools',
    'writeFileByRoot',
    ['C:/Temp/flyenv-inline.txt', 'ok'],
    2000
  )
  assert.equal(inlinePlan.mode, 'inline')
  assert.match(inlinePlan.command, /-EncodedCommand/)
  assert.equal(inlinePlan.tempFileContent, undefined)

  const largeContent = 'x'.repeat(8000)
  const tempFilePlan = buildWindowsHelperFallbackPlan(
    'tools',
    'writeFileByRoot',
    ['C:/Temp/flyenv-large.txt', largeContent],
    2000
  )
  assert.equal(tempFilePlan.mode, 'data-file')
  assert.equal(tempFilePlan.tempFileKind, 'text')
  assert.equal(tempFilePlan.tempFileContent, largeContent)
  assert.match(tempFilePlan.script, /Get-Content -LiteralPath/)

  const envPlan = buildWindowsHelperFallbackPlan(
    'tools',
    'setSystemEnv',
    ['FLYENV_ALIAS', 'C:/FlyEnv/alias'],
    2000
  )
  assert.equal(envPlan.mode, 'inline')
  assert.match(envPlan.script, /Set-ItemProperty/)

  assert.throws(
    () => buildWindowsHelperFallbackPlan('tools', 'setSystemEnv', ['FLYENV-ALIAS', 'bad'], 2000),
    (error: any) => error?.code === 'helper_execution_failed'
  )
  assert.throws(
    () =>
      buildWindowsHelperFallbackPlan(
        'tools',
        'writeBufferBase64ByRoot',
        ['C:/Temp/flyenv.bin', 'not-base64%%%'],
        2000
      ),
    (error: any) => error?.code === 'helper_execution_failed'
  )
  assert.throws(
    () =>
      buildWindowsHelperFallbackPlan(
        'tools',
        'setAutoStartWin',
        ['yes', 'FlyEnvHelperTask', 'C:/FlyEnv/FlyEnv.exe'],
        2000
      ),
    (error: any) => error?.code === 'helper_execution_failed'
  )

  console.log('windows helper fallback plan test passed')
}

main()
```

- [ ] **Step 2: Run the regression to prove the fallback planner is missing**

Run:

```bash
npx tsx scripts/windows-helper-fallback-plan-test.ts
```

Expected:

- The script fails because `WindowsHelperFallback` and/or the encoded-command string helper do not exist yet.

- [ ] **Step 3: Add a reusable encoded PowerShell command builder**

Update `src/shared/PowerShellCommand.ts` to keep the current array helpers and add a string builder for `@shared/Sudo`:

```ts
export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function powerShellInlineArgs(script: string): string[] {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-NonInteractive',
    '-EncodedCommand',
    encodePowerShellCommand(script)
  ]
}

function quoteCmdArg(value: string): string {
  if (!/[ \t"]/u.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}

export function buildPowerShellEncodedCommand(
  script: string,
  powershellPath = 'powershell.exe'
): string {
  return [powershellPath, ...powerShellInlineArgs(script)].map(quoteCmdArg).join(' ')
}
```

- [ ] **Step 4: Implement the fallback planner and executor**

Create `src/shared/WindowsHelperFallback.ts` with the full planner now, plus the runtime executor the later tasks will wire into `Helper.send`:

```ts
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink } from '@shared/fs-extra'
import { writeFile as writeFileFs } from 'node:fs/promises'
import { exec as Sudo } from '@shared/Sudo'
import EnvSync from '@shared/EnvSync'
import {
  AppHelperError,
  isWindowsHelperFallbackAllowed
} from './WindowsHelperState'
import { buildPowerShellEncodedCommand } from './PowerShellCommand'

type FallbackPlan = {
  mode: 'inline' | 'data-file'
  command: string
  script: string
  tempFilePath?: string
  tempFileKind?: 'text' | 'base64'
  tempFileContent?: string
}

const INLINE_LIMIT = 6000

const quotePowerShellSingle = (value: string) => `'${value.replace(/'/g, "''")}'`

function failValidation(message: string): never {
  throw new AppHelperError('helper_execution_failed', message)
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    failValidation(`${label} must be a non-empty string`)
  }
  if (/[\r\n]/.test(value)) {
    failValidation(`${label} must not contain newlines`)
  }
  return value
}

function assertSafePath(value: unknown, label: string): string {
  const path = assertNonEmptyString(value, label)
  const normalized = path.replace(/\\/g, '/')
  if (normalized.split('/').some((part) => part === '..')) {
    failValidation(`${label} must not contain path traversal segments`)
  }
  return path
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    failValidation(`${label} must be a boolean`)
  }
  return value
}

function assertEnvKey(value: unknown, label: string): string {
  const key = assertNonEmptyString(value, label)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    failValidation(`${label} must be a valid Windows environment variable name`)
  }
  return key
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    failValidation(`${label} must be a string array`)
  }
  return value.map((item, index) => assertSafePath(item, `${label}[${index}]`))
}

function assertStringRecord(value: unknown, label: string): Record<string, string> {
  if (value == null) {
    return {}
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    failValidation(`${label} must be an object`)
  }
  const record: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    const validKey = assertEnvKey(key, `${label}.${key}`)
    record[validKey] = assertNonEmptyString(raw, `${label}.${key}`)
  }
  return record
}

function assertBase64(value: unknown, label: string): string {
  const content = assertNonEmptyString(value, label)
  if (!/^[A-Za-z0-9+/=]+$/.test(content)) {
    failValidation(`${label} must be valid base64`)
  }
  try {
    Buffer.from(content, 'base64')
  } catch {
    failValidation(`${label} must be valid base64`)
  }
  return content
}

function assertTaskName(value: unknown, label: string): string {
  const taskName = assertNonEmptyString(value, label)
  if (!/^[A-Za-z0-9 _.-]+$/.test(taskName)) {
    failValidation(`${label} contains unsupported characters`)
  }
  return taskName
}

function assertCertFileName(value: unknown, label: string): string {
  const fileName = assertNonEmptyString(value, label)
  if (!/^[A-Za-z0-9_.-]+$/.test(fileName)) {
    failValidation(`${label} contains unsupported characters`)
  }
  return fileName
}

function validateWindowsHelperFallbackArgs(module: string, fn: string, args: any[]) {
  if (module === 'tools' && fn === 'writeFileByRoot') {
    if (args.length !== 2) failValidation('writeFileByRoot expects 2 arguments')
    return [assertSafePath(args[0], 'targetPath'), assertNonEmptyString(args[1], 'content')] as const
  }
  if (module === 'tools' && fn === 'writeBufferBase64ByRoot') {
    if (args.length !== 2) failValidation('writeBufferBase64ByRoot expects 2 arguments')
    return [assertSafePath(args[0], 'targetPath'), assertBase64(args[1], 'base64Content')] as const
  }
  if (module === 'tools' && fn === 'rm') {
    if (args.length !== 1) failValidation('rm expects 1 argument')
    return [assertSafePath(args[0], 'targetPath')] as const
  }
  if (module === 'tools' && fn === 'setSystemPath') {
    if (args.length !== 2) failValidation('setSystemPath expects 2 arguments')
    return [assertStringArray(args[0], 'paths'), assertStringRecord(args[1], 'otherVars')] as const
  }
  if (module === 'tools' && fn === 'setSystemEnv') {
    if (args.length !== 2) failValidation('setSystemEnv expects 2 arguments')
    return [assertEnvKey(args[0], 'key'), assertNonEmptyString(args[1], 'value')] as const
  }
  if (module === 'tools' && fn === 'setAutoStartWin') {
    if (args.length !== 3) failValidation('setAutoStartWin expects 3 arguments')
    return [
      assertBoolean(args[0], 'enabled'),
      assertTaskName(args[1], 'taskName'),
      assertSafePath(args[2], 'exePath')
    ] as const
  }
  if (module === 'host' && fn === 'sslAddTrustedCert') {
    if (args.length !== 2) failValidation('sslAddTrustedCert expects 2 arguments')
    return [assertSafePath(args[0], 'cwd'), assertCertFileName(args[1], 'caName')] as const
  }
  throw new AppHelperError(
    'windows_fallback_not_supported',
    `Windows fallback does not support ${module}/${fn}`
  )
}

function buildSetSystemPathScript(paths: string[], otherVars: Record<string, string>) {
  const pathValue = `${paths.join(';')};`
  const lines = [
    `$registryPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'`,
    `Set-ItemProperty -Path $registryPath -Name 'Path' -Value ${quotePowerShellSingle(pathValue)}`
  ]
  for (const [key, value] of Object.entries(otherVars)) {
    lines.push(
      `Set-ItemProperty -Path $registryPath -Name ${quotePowerShellSingle(key)} -Value ${quotePowerShellSingle(
        value
      )}`
    )
  }
  lines.push(`Set-ItemProperty -Path $registryPath -Name 'FLYENV_ENV_FLUSH' -Value '0'`)
  lines.push(
    `$signature = '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, int Msg, IntPtr wParam, string lParam, int fuFlags, int uTimeout, out IntPtr lpdwResult);'`
  )
  lines.push(`$type = Add-Type -MemberDefinition $signature -Name 'Win32SendMessageTimeout' -Namespace 'FlyEnv' -PassThru`)
  lines.push(`$result = [IntPtr]::Zero`)
  lines.push(`[void]$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$result)`)
  return lines.join('\n')
}

function buildFallbackScript(
  module: string,
  fn: string,
  args: any[],
  tempFilePath?: string
): string {
  if (module === 'tools' && fn === 'writeFileByRoot') {
    const [targetPath, content] = args as [string, string]
    if (tempFilePath) {
      return [
        `$target = ${quotePowerShellSingle(targetPath)}`,
        `$parent = Split-Path -Parent $target`,
        `if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }`,
        `$content = Get-Content -LiteralPath ${quotePowerShellSingle(tempFilePath)} -Raw`,
        `[System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))`
      ].join('\n')
    }
    return [
      `$target = ${quotePowerShellSingle(targetPath)}`,
      `$parent = Split-Path -Parent $target`,
      `if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }`,
      `[System.IO.File]::WriteAllText($target, ${quotePowerShellSingle(content)}, [System.Text.UTF8Encoding]::new($false))`
    ].join('\n')
  }
  if (module === 'tools' && fn === 'writeBufferBase64ByRoot') {
    const [targetPath, base64Content] = args as [string, string]
    const sourceExpr = tempFilePath
      ? `Get-Content -LiteralPath ${quotePowerShellSingle(tempFilePath)} -Raw`
      : quotePowerShellSingle(base64Content)
    return [
      `$target = ${quotePowerShellSingle(targetPath)}`,
      `$parent = Split-Path -Parent $target`,
      `if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }`,
      `$raw = ${sourceExpr}`,
      `$bytes = [Convert]::FromBase64String($raw)`,
      `[System.IO.File]::WriteAllBytes($target, $bytes)`
    ].join('\n')
  }
  if (module === 'tools' && fn === 'rm') {
    const [targetPath] = args as [string]
    return `if (Test-Path -LiteralPath ${quotePowerShellSingle(targetPath)}) { Remove-Item -LiteralPath ${quotePowerShellSingle(targetPath)} -Recurse -Force }`
  }
  if (module === 'tools' && fn === 'setSystemPath') {
    const [paths, otherVars] = args as [string[], Record<string, string>]
    return buildSetSystemPathScript(paths, otherVars ?? {})
  }
  if (module === 'tools' && fn === 'setSystemEnv') {
    const [key, value] = args as [string, string]
    return buildSetSystemPathScript([], { [key]: value }).replace(
      `Set-ItemProperty -Path $registryPath -Name 'Path' -Value ''`,
      ''
    )
  }
  if (module === 'tools' && fn === 'setAutoStartWin') {
    const [enabled, taskName, exePath] = args as [boolean, string, string]
    if (enabled) {
      return `schtasks.exe /create /tn ${quotePowerShellSingle(taskName)} /tr ${quotePowerShellSingle(`"${exePath}"`)} /sc onlogon /rl highest /f`
    }
    return `schtasks.exe /delete /tn ${quotePowerShellSingle(taskName)} /f`
  }
  if (module === 'host' && fn === 'sslAddTrustedCert') {
    const [cwd, caName] = args as [string, string]
    return [
      `Set-Location -LiteralPath ${quotePowerShellSingle(cwd)}`,
      `certutil -addstore root ${quotePowerShellSingle(caName)} | Out-Null`
    ].join('\n')
  }
  throw new AppHelperError(
    'windows_fallback_not_supported',
    `Windows fallback does not support ${module}/${fn}`
  )
}

export function buildWindowsHelperFallbackPlan(
  module: string,
  fn: string,
  args: any[],
  inlineLimit = INLINE_LIMIT
): FallbackPlan {
  if (!isWindowsHelperFallbackAllowed(module, fn)) {
    throw new AppHelperError(
      'windows_fallback_not_supported',
      `Windows fallback does not support ${module}/${fn}`
    )
  }

  const validatedArgs = validateWindowsHelperFallbackArgs(module, fn, args)
  const inlineScript = buildFallbackScript(module, fn, [...validatedArgs])
  const inlineCommand = buildPowerShellEncodedCommand(inlineScript)
  if (inlineCommand.length <= inlineLimit) {
    return {
      mode: 'inline',
      command: inlineCommand,
      script: inlineScript
    }
  }

  if (module === 'tools' && (fn === 'writeFileByRoot' || fn === 'writeBufferBase64ByRoot')) {
    const tempFilePath = join(
      tmpdir(),
      `flyenv-helper-fallback-${Date.now()}-${process.pid}.${fn === 'writeFileByRoot' ? 'txt' : 'b64'}`
    )
    const tempFileContent = validatedArgs[1] as string
    const script = buildFallbackScript(module, fn, [...validatedArgs], tempFilePath)
    return {
      mode: 'data-file',
      command: buildPowerShellEncodedCommand(script),
      script,
      tempFilePath,
      tempFileKind: fn === 'writeFileByRoot' ? 'text' : 'base64',
      tempFileContent
    }
  }

  throw new AppHelperError(
    'helper_execution_failed',
    `Fallback command exceeded inline limit for ${module}/${fn}`
  )
}

export async function runWindowsHelperFallback(module: string, fn: string, args: any[]) {
  const plan = buildWindowsHelperFallbackPlan(module, fn, args)
  let tempFilePath = plan.tempFilePath

  try {
    if (plan.mode === 'data-file' && tempFilePath) {
      await writeFileFs(tempFilePath, plan.tempFileContent ?? '', 'utf8')
    }
    await EnvSync.sync()
    await Sudo(plan.command, { name: 'FlyEnv' })
    return true
  } finally {
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {})
    }
  }
}
```

- [ ] **Step 5: Re-run the fallback-plan regression**

Run:

```bash
npx tsx scripts/windows-helper-fallback-plan-test.ts
```

Expected:

- Output includes `windows helper fallback plan test passed`.

- [ ] **Step 6: Commit the fallback executor layer**

Run:

```bash
git add src/shared/PowerShellCommand.ts src/shared/WindowsHelperFallback.ts scripts/windows-helper-fallback-plan-test.ts
git commit -m "feat: add windows helper fallback executor"
```

### Task 3: Lock Windows Helper Check And Install Behavior

**Files:**
- Create: `scripts/windows-helper-check-test.ts`
- Modify: `src/shared/AppHelperCheck.ts`
- Modify: `src/main/core/AppHelper.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/IPCHandler.ts`

- [ ] **Step 1: Write the failing helper-check regression**

Create `scripts/windows-helper-check-test.ts` with an injectable checker so the branch can prove `helper_binary_missing` short-circuits before any socket work:

```ts
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createAppHelperChecker } from '../src/shared/AppHelperCheck'

class FakeSocket extends EventEmitter {
  destroy() {}
  end() {
    this.emit('end')
  }
  write(_payload: string, callback?: (error?: Error | null) => void) {
    callback?.(null)
  }
}

async function expectCode(checker: () => Promise<unknown>, code: string) {
  try {
    await checker()
    assert.fail(`expected ${code}`)
  } catch (error: any) {
    assert.equal(error?.code, code)
  }
}

async function main() {
  await expectCode(
    createAppHelperChecker({
      isWindows: () => true,
      helperBinaryExists: () => false,
      createConnection: () => {
        throw new Error('socket should not be opened when the helper binary is missing')
      }
    }),
    'helper_binary_missing'
  )

  const mismatchSocket = new FakeSocket()
  const mismatchChecker = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: () => mismatchSocket as any,
    getHelperKey: async () => null
  })
  setImmediate(() => {
    mismatchSocket.emit('connect')
    mismatchSocket.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          key: 'flyenv-helper-version-check',
          code: 0,
          data: 999
        })
      )
    )
    mismatchSocket.emit('end')
  })
  await expectCode(mismatchChecker, 'helper_version_mismatch')

  const okSocket = new FakeSocket()
  const okChecker = createAppHelperChecker({
    isWindows: () => true,
    helperBinaryExists: () => true,
    createConnection: () => okSocket as any,
    getHelperKey: async () => null
  })
  setImmediate(() => {
    okSocket.emit('connect')
    okSocket.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          key: 'flyenv-helper-version-check',
          code: 0,
          data: 14
        })
      )
    )
    okSocket.emit('end')
  })
  assert.equal(await okChecker(), true)

  console.log('windows helper check test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Run the regression to prove the checker is not injectable yet**

Run:

```bash
npx tsx scripts/windows-helper-check-test.ts
```

Expected:

- The script fails because `createAppHelperChecker` does not exist yet, or because `AppHelperCheck` still reports only generic errors.

- [ ] **Step 3: Refactor `AppHelperCheck.ts` into a structured, injectable checker**

Replace the unstructured Windows check path with an injectable factory and structured errors:

```ts
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, basename, resolve as pathResolve } from 'node:path'
import is from 'electron-is'
import {
  AppHelperError,
  type AppHelperErrorCode
} from './WindowsHelperState'

export const getWindowsHelperBinaryPath = (): string => {
  const staticPath = global.Server.Static ?? ''
  if (!staticPath) {
    return ''
  }
  if (is.production()) {
    return join(pathResolve(staticPath, '../../../../'), 'helper/flyenv-helper.exe')
  }
  const buildDir = pathResolve(staticPath, '../../../build/')
  return pathResolve(buildDir, '../src/helper-go/dist/flyenv-helper-windows-amd64-v1.exe')
}

export const windowsHelperBinaryExists = (): boolean => {
  if (!isWindows()) {
    return true
  }
  const helperPath = getWindowsHelperBinaryPath()
  return !!helperPath && existsSync(helperPath)
}

type AppHelperCheckDeps = {
  isWindows: () => boolean
  helperBinaryExists: () => boolean
  createConnection: typeof createConnection
  getHelperKey: typeof getHelperKey
}

export const createAppHelperChecker = (deps: Partial<AppHelperCheckDeps> = {}) => {
  const runtime = {
    isWindows,
    helperBinaryExists: windowsHelperBinaryExists,
    createConnection,
    getHelperKey,
    ...deps
  }

  return () =>
    new Promise(async (resolve, reject) => {
      if (runtime.isWindows() && !runtime.helperBinaryExists()) {
        reject(new AppHelperError('helper_binary_missing', 'Windows helper binary missing'))
        return
      }

      let timer: NodeJS.Timeout | undefined
      let settled = false
      const key = 'flyenv-helper-version-check'
      const buffer: Buffer[] = []

      const resolveOnce = (value: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }

      const rejectOnce = (code: AppHelperErrorCode, message: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new AppHelperError(code, message))
      }

      let helperKey: Buffer | null = null
      try {
        helperKey = await runtime.getHelperKey()
      } catch {}

      const client = runtime.createConnection(AppHelperSocketPathGet())

      const closeClient = () => {
        try {
          client.destroy()
        } catch {}
      }

      client.on('connect', () => {
        const param: any = {
          key,
          module: 'helper',
          function: 'version',
          args: [],
          ...helperTaskAuthFields()
        }
        if (helperKey) {
          param.sig = signTaskItem(helperKey, param)
        }
        client.write(JSON.stringify(param), (error?: Error | null) => {
          if (error) {
            closeClient()
            rejectOnce('helper_unreachable', error.message)
          }
        })
        timer = setTimeout(() => {
          closeClient()
          rejectOnce('helper_unreachable', 'Connect helper failed')
        }, 2000)
      })

      client.on('data', (data: any) => {
        buffer.push(data)
        client.end()
      })

      client.on('end', () => {
        closeClient()
        if (!buffer.length) {
          rejectOnce('helper_unreachable', 'Connect helper failed')
          return
        }
        let res: any
        try {
          res = JSON5.parse(Buffer.concat(buffer).toString().trim())
        } catch {
          rejectOnce('helper_execution_failed', 'Invalid helper response payload')
          return
        }
        if (res?.key === key && res?.code === 0 && res?.data === HelperVersion) {
          resolveOnce(true)
          return
        }
        rejectOnce('helper_version_mismatch', 'Helper Need Install Or Update')
      })

      client.on('error', () => {
        closeClient()
        rejectOnce('helper_unreachable', 'Connect helper failed')
      })
    })
}

export const AppHelperCheck = createAppHelperChecker()
```

- [ ] **Step 4: Update `AppHelper.ts` to skip Windows install when the binary is gone**

Modify the helper status callback shape and skip install generation when the Windows helper binary is missing:

```ts
import { isAppHelperError } from '@shared/WindowsHelperState'
import {
  AppHelperCheck,
  getWindowsHelperBinaryPath,
  windowsHelperBinaryExists
} from '@shared/AppHelperCheck'

type AppHelperMessage = {
  state: 'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess'
  reason?: string
}

type AppHelperCallback = (message: AppHelperMessage) => void

private emitStatus(
  state: 'needInstall' | 'installing' | 'installed' | 'installFaild' | 'checkSuccess',
  reason?: string
) {
  this._onMessage?.({ state, reason })
}

async command() {
  if (isWindows() && !windowsHelperBinaryExists()) {
    throw new AppHelperError('helper_binary_missing', `Windows helper binary missing: ${getWindowsHelperBinaryPath()}`)
  }
  // keep the rest of the command builder unchanged
}

initHelper() {
  return new Promise(async (resolve, reject) => {
    try {
      await AppHelperCheck()
      this.state = 'normal'
      this.emitStatus('checkSuccess')
      resolve(true)
      return
    } catch (error) {
      if (isAppHelperError(error, 'helper_binary_missing')) {
        this.state = 'normal'
        this.emitStatus('installFaild', error.code)
        reject(error)
        return
      }
    }

    this.emitStatus('needInstall')
    // keep the existing install flow

    try {
      const { command, icns } = await this.command()
      this.emitStatus('installing')
      await Sudo(command, { name: 'FlyEnv', icns })
      this.state = 'installed'
      doChech()
    } catch (error) {
      this.state = 'normal'
      this.emitStatus('installFaild', isAppHelperError(error) ? error.code : undefined)
      reject(error)
    }
  })
}
```

- [ ] **Step 5: Forward helper `reason` through Application and IPC**

Update `src/main/Application.ts` and `src/main/core/IPCHandler.ts` so the renderer can tell `helper_binary_missing` from ordinary helper failures:

```ts
// src/main/Application.ts
private handleHelperStatusMessage(message: { state: string; reason?: string }) {
  const key = 'APP-FlyEnv-Helper-Notice'
  const messages: Record<string, { code: number; msg: string; status?: string }> = {
    needInstall: { code: 1, msg: I18nT('menu.needInstallHelper') },
    installed: { code: 2, msg: I18nT('menu.waitHelper') },
    installing: { code: 2, msg: I18nT('menu.helperInstalling') },
    installFaild: { code: 1, msg: I18nT('menu.helperInstallFailTips'), status: 'installFaild' },
    checkSuccess: { code: 0, msg: I18nT('menu.helperInstallSuccessTips') }
  }

  const base = messages[message.state]
  if (base) {
    this.windowManager.sendCommandTo(this.mainWindow!, key, key, {
      ...base,
      reason: message.reason
    })
  }
}

// src/main/core/IPCHandler.ts
import { buildHelperCheckResponse, isAppHelperError } from '@shared/WindowsHelperState'

private handleHelperCommand(command: string, key: string) {
  AppHelper.command()
    .then((res) => {
      this.sendToMainWindow(command, key, { code: 0, ...res })
    })
    .catch((error) => {
      this.sendToMainWindow(command, key, buildHelperCheckResponse(error))
    })
}

private handleHelperCheck(command: string, key: string) {
  AppHelperCheck()
    .then(() => {
      this.sendToMainWindow(command, key, { code: 0, data: true })
    })
    .catch((error) => {
      this.sendToMainWindow(command, key, buildHelperCheckResponse(error))
    })
}
```

- [ ] **Step 6: Re-run the helper-check regression**

Run:

```bash
npx tsx scripts/windows-helper-check-test.ts
```

Expected:

- Output includes `windows helper check test passed`.

- [ ] **Step 7: Commit the structured helper-check backend**

Run:

```bash
git add src/shared/AppHelperCheck.ts src/main/core/AppHelper.ts src/main/Application.ts src/main/core/IPCHandler.ts scripts/windows-helper-check-test.ts
git commit -m "feat: classify windows helper check failures"
```

### Task 4: Wire `Helper.send()` To The Tested Fallback Policy

**Files:**
- Modify: `src/fork/Helper.ts`
- Test: `scripts/windows-helper-state-test.ts`
- Test: `scripts/windows-helper-fallback-plan-test.ts`
- Test: `scripts/windows-helper-check-test.ts`

- [ ] **Step 1: Re-run the three fast regressions before integrating the routing**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
npx tsx scripts/windows-helper-fallback-plan-test.ts
npx tsx scripts/windows-helper-check-test.ts
```

Expected:

- All three scripts pass before the `Helper.send()` wiring starts.

- [ ] **Step 2: Update `Helper.send()` to choose socket, fallback, prompt, or reject**

Modify `src/fork/Helper.ts` so the tested shared policy decides what happens when Windows helper checks fail:

```ts
import { isWindows } from '@shared/utils'
import {
  AppHelperError,
  resolveWindowsHelperTransport,
} from '@shared/WindowsHelperState'
import { runWindowsHelperFallback } from '@shared/WindowsHelperFallback'

send<T>(module: Module, fn: FN, ...args: any): Promise<T> {
  return new Promise(async (resolve, reject) => {
    // keep the current path-traversal guard; method-level fallback validation now lives in WindowsHelperFallback

    let helperCheckError: unknown
    if (!this.enable) {
      try {
        await AppHelperCheck()
        this.enable = true
      } catch (error) {
        helperCheckError = error
        this.enable = false
      }

      if (!this.enable) {
        const transport = isWindows()
          ? resolveWindowsHelperTransport(helperCheckError, module, fn)
          : 'prompt'

        if (transport === 'fallback') {
          try {
            const result = (await runWindowsHelperFallback(module, fn, args)) as T
            resolve(result)
          } catch (fallbackError) {
            reject(fallbackError)
          }
          return
        }

        if (transport === 'prompt') {
          if (this.appHelper) {
            this.appHelper.needInstall()
          } else {
            process?.send?.({
              on: true,
              key: 'App-Need-Init-FlyEnv-Helper',
              info: {
                code: 200,
                msg: 'App-Need-Init-FlyEnv-Helper'
              }
            })
          }
          reject(helperCheckError instanceof Error ? helperCheckError : new Error(`${helperCheckError}`))
          return
        }

        reject(helperCheckError instanceof Error ? helperCheckError : new Error(`${helperCheckError}`))
        return
      }
    }

    await this.ensureKey()
    // keep socket setup

    client.on('error', async (error) => {
      if (isWindows()) {
        const transport = resolveWindowsHelperTransport(
          new AppHelperError('helper_execution_failed', error.message),
          module,
          fn
        )
        if (transport === 'fallback') {
          try {
            const result = (await runWindowsHelperFallback(module, fn, args)) as T
            resolveOnce(result)
            return
          } catch (fallbackError) {
            rejectOnce(fallbackError instanceof Error ? fallbackError : new Error(`${fallbackError}`))
            return
          }
        }
      }
      handleSocketError(error)
    })
  })
}
```

- [ ] **Step 3: Re-run the fast regressions after the integration**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
npx tsx scripts/windows-helper-fallback-plan-test.ts
npx tsx scripts/windows-helper-check-test.ts
```

Expected:

- All three scripts still pass, proving the integration did not change the tested routing rules.

- [ ] **Step 4: Commit the `Helper.send()` fallback wiring**

Run:

```bash
git add src/fork/Helper.ts
git commit -m "feat: route windows helper calls to powershell fallback"
```

### Task 5: Suppress Broken Install UI And Verify Windows Behavior

**Files:**
- Modify: `src/render/util/GlobalIPCOn.ts`
- Modify: `src/render/store/helper.ts`
- Modify: `src/render/components/Setup/FlyEnvHelper/setup.ts`
- Modify: `src/render/components/FlyEnvHelper/index.vue`
- Test: `scripts/windows-helper-state-test.ts`

- [ ] **Step 1: Re-run the shared-policy regression before touching renderer wiring**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
```

Expected:

- Output includes `windows helper state test passed`.

- [ ] **Step 2: Update the renderer notice flow to respect helper `reason`**

Modify `src/render/util/GlobalIPCOn.ts` and `src/render/store/helper.ts` so Windows does not open an installer or folder when the helper binary is missing:

```ts
// src/render/util/GlobalIPCOn.ts
IPC.on('APP-FlyEnv-Helper-Notice').then((key: string, res: any) => {
  if (res?.code === 0) {
    MessageSuccess(res?.msg)
  } else if (res?.code === 1) {
    MessageError(res?.msg)
    if (res?.status === 'installFaild' && this.inited && !FlyEnvHelperSetup.show) {
      HelperStore.showInstallFailDialog(res?.reason)
    } else if (!res?.status && HelperStore.shouldShowNeedInstallDialog(res?.reason)) {
      HelperStore.showNeedInstallDialog(res?.reason)
    }
  } else if (res?.code === 2) {
    MessageWarning(res?.msg)
  }
})

// src/render/store/helper.ts
import { shouldOpenHelperInstaller } from '@shared/WindowsHelperState'

class Helper {
  shouldShowNeedInstallDialog(reason?: string) {
    return shouldOpenHelperInstaller(reason)
  }

  showNeedInstallDialog(reason?: string) {
    if (!shouldOpenHelperInstaller(reason)) {
      return
    }
    // keep existing confirm flow
  }

  showInstallFailDialog(reason?: string) {
    if (window.Server.isWindows) {
      const message =
        reason === 'helper_binary_missing'
          ? I18nT('menu.helperInstallFailTips')
          : I18nT('setup.flyenvHelperInstallFailTips')

      dialog
        .showMessageBox({
          type: 'info',
          title: I18nT('host.warning'),
          message,
          buttons: [I18nT('base.confirm')]
        })
        .then(() => {
          if (reason === 'helper_binary_missing') {
            return
          }
          app.getPath('exe').then((path: string) => {
            const item = join(path, 'resources/helper/flyenv-helper.exe')
            shell.showItemInFolder(item).catch()
          })
        })
      return
    }

    import('@/components/FlyEnvHelper/index.vue').then((m) => {
      AsyncComponentShow(m.default).then()
    })
  }
}
```

- [ ] **Step 3: Make the setup page and install dialog exit cleanly when no helper command exists**

Modify `src/render/components/Setup/FlyEnvHelper/setup.ts` and `src/render/components/FlyEnvHelper/index.vue`:

```ts
// src/render/components/Setup/FlyEnvHelper/setup.ts
IPC.send('APP:FlyEnv-Helper-Check').then((key: string, res: any) => {
  IPC.off(key)
  if (res?.code === 0) {
    ElMessage.success(I18nT('setup.flyenvHelperFixSuccess'))
  } else if (res?.reason === 'helper_binary_missing') {
    ElMessage.error(I18nT('menu.helperInstallFailTips'))
  } else if (!FlyEnvHelperSetup.show) {
    import('@/components/FlyEnvHelper/index.vue').then((m) => {
      AsyncComponentShow(m.default).then()
    })
  }
  this.fixing = false
})

// src/render/components/FlyEnvHelper/index.vue
const fetchInstallCommand = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (FlyEnvHelperSetup.command) {
      resolve(FlyEnvHelperSetup.command)
      return
    }
    IPC.send('APP:FlyEnv-Helper-Command').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code !== 0 || !res?.command) {
        reject(new Error(res?.reason ?? 'helper_binary_missing'))
        return
      }
      FlyEnvHelperSetup.command = res.command
      resolve(FlyEnvHelperSetup.command)
    })
  })
}

const doInstall = async () => {
  if (loading.value) {
    return
  }
  loading.value = true
  try {
    const execXTerm = new XTerm()
    const command = await fetchInstallCommand()
    nextTick().then(() => {
      execXTerm.mount(xterm.value!).then(() => {
        execXTerm.send([command]).then(() => {
          loading.value = false
        })
      })
    })
    FlyEnvHelperSetup.execXTerm = markRaw(execXTerm)
  } catch {
    loading.value = false
    show.value = false
  }
}
```

- [ ] **Step 4: Run the fast regression and then do the Windows manual smoke**

Run the pure regression first:

```bash
npx tsx scripts/windows-helper-state-test.ts
```

Expected:

- Output includes `windows helper state test passed`.

Then on a Windows dev machine do this exact smoke sequence:

1. Rename `resources/helper/flyenv-helper.exe` (or the dev helper binary) out of the way.
2. Start FlyEnv.
3. Trigger a hosts-file write or `setSystemEnv` path that previously required helper.
4. Confirm you get a single UAC prompt and the operation succeeds.
5. Open Setup → FlyEnv Helper → Fix.
6. Confirm the page shows an error toast instead of opening the install terminal.
7. Trigger a non-allowlisted helper call such as a root-only file read path and confirm it fails without opening the install dialog.

- [ ] **Step 5: Commit the renderer and IPC behavior changes**

Run:

```bash
git add src/render/util/GlobalIPCOn.ts src/render/store/helper.ts src/render/components/Setup/FlyEnvHelper/setup.ts src/render/components/FlyEnvHelper/index.vue
git commit -m "feat: suppress broken windows helper install prompts"
```

### Task 6: Final Verification

**Files:**
- Reference: `scripts/windows-helper-state-test.ts`
- Reference: `scripts/windows-helper-fallback-plan-test.ts`
- Reference: `scripts/windows-helper-check-test.ts`

- [ ] **Step 1: Run all fast regressions together**

Run:

```bash
npx tsx scripts/windows-helper-state-test.ts
npx tsx scripts/windows-helper-fallback-plan-test.ts
npx tsx scripts/windows-helper-check-test.ts
```

Expected:

- All three scripts pass.

- [ ] **Step 2: Re-run the existing helper contract regression**

Run:

```bash
yarn run test:helper:contract
```

Expected:

- Output ends with `helper-contract: ... validated`.

- [ ] **Step 3: Verify the Windows feature matrix manually**

On Windows with the helper binary temporarily removed, verify each allowlisted action at least once:

1. `tools/writeFileByRoot`: save a protected file that now falls back through `Helper.send`.
2. `tools/writeBufferBase64ByRoot`: trigger renderer `fs_writeBufferBase64` to a protected destination.
3. `tools/rm`: remove a protected temp directory through an existing root-delete path.
4. `tools/setSystemPath`: add or reorder an environment path from the Tools UI.
5. `tools/setSystemEnv`: create/update `FLYENV_ALIAS`.
6. `tools/setAutoStartWin`: toggle “Auto Launch At Boot”.
7. `host/sslAddTrustedCert`: generate or trust the FlyEnv root CA.

Expected:

- Each operation prompts once with UAC and succeeds.
- No helper install dialog appears for those allowlisted operations.

- [ ] **Step 4: Final commit**

Run:

```bash
git status --short
git add src/shared/WindowsHelperState.ts src/shared/WindowsHelperFallback.ts src/shared/PowerShellCommand.ts src/shared/AppHelperCheck.ts src/main/core/AppHelper.ts src/main/Application.ts src/main/core/IPCHandler.ts src/fork/Helper.ts src/render/util/GlobalIPCOn.ts src/render/store/helper.ts src/render/components/Setup/FlyEnvHelper/setup.ts src/render/components/FlyEnvHelper/index.vue scripts/windows-helper-state-test.ts scripts/windows-helper-fallback-plan-test.ts scripts/windows-helper-check-test.ts
git commit -m "feat: add windows helper fallback when helper is missing"
```

Expected:

- `git status --short` is clean except for unrelated user changes that should not be staged.
