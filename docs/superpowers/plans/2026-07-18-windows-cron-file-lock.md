# Windows Cron File Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows Cron jobs recover automatically after interrupted wrapper processes while preserving direct PowerShell scheduling and the current Windows OEM output decoding policy.

**Architecture:** The generated PowerShell wrapper will hold an exclusive `FileStream` for its full lifecycle instead of creating a removable lock directory. A version marker and startup repair pass will rewrite missing or legacy wrappers in place so already-registered Task Scheduler actions receive the fix without being recreated.

**Tech Stack:** TypeScript 5.8, PowerShell 5.1, Windows Task Scheduler, Node `assert`, TSX script tests

---

## File Structure

- `src/fork/module/Cron/WindowsSystemScheduler.ts` — wrapper generation, exclusive file-lock script, version detection, and per-job wrapper repair.
- `src/fork/module/Cron/SystemScheduler.ts` — platform-neutral repair entry point.
- `src/fork/module/Cron/index.ts` — invokes wrapper repair during Cron initialization.
- `scripts/phase4-install-terminal-cron-test.ts` — platform-independent generated-script contract.
- `scripts/windows-cron-wrapper-migration-test.ts` — platform-independent file migration behavior.
- `scripts/windows-cron-wrapper-runtime-test.ts` — Windows-only wrapper execution, concurrency, and crash-recovery behavior.
- `package.json` — focused Windows Cron test command.

### Task 1: Replace the Persistent Directory Lock

**Files:**

- Modify: `scripts/phase4-install-terminal-cron-test.ts`
- Modify: `src/fork/module/Cron/WindowsSystemScheduler.ts:22-106`

- [ ] **Step 1: Write the failing generated-wrapper contract**

Update the Cron assertions in `scripts/phase4-install-terminal-cron-test.ts` to require the corrected command arguments, wrapper version marker, exclusive file stream, and guaranteed disposal:

```ts
assert.ok(cronWrapper.includes('$FlyEnvCronWrapperVersion = 2'))
assert.ok(cronWrapper.includes('$LockFile = Join-Path $RunDir "$JobId.running.lock"'))
assert.ok(cronWrapper.includes('[IO.FileMode]::OpenOrCreate'))
assert.ok(cronWrapper.includes('[IO.FileAccess]::ReadWrite'))
assert.ok(cronWrapper.includes('[IO.FileShare]::None'))
assert.ok(cronWrapper.includes('$LockHandle.Dispose()'))
assert.match(cronWrapper, /finally\s*\{[\s\S]*\$LockHandle\.Dispose\(\)/)
assert.ok(cronWrapper.includes('$psi.FileName = $CmdExe'))
assert.ok(cronWrapper.includes("$psi.Arguments = '/d /c ' + $Command"))
assert.ok(!cronWrapper.includes('$LockDir'))
assert.ok(!cronWrapper.includes('$LockMaxAgeSeconds'))
assert.ok(!cronWrapper.includes('[Text.UTF8Encoding]::new'))
assert.ok(!cronWrapper.includes('$CmdFile'))
assert.ok(!cronWrapper.includes('WriteAllText($CmdFile'))
assert.ok(!cronWrapper.includes('.cmd'))
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
npx tsx scripts/phase4-install-terminal-cron-test.ts
```

Expected: FAIL because the current wrapper has no `$FlyEnvCronWrapperVersion = 2` marker and still uses `$LockDir`.

- [ ] **Step 3: Implement the exclusive file lock**

Add the exported wrapper version constants near the top of `WindowsSystemScheduler.ts`:

```ts
export const WINDOWS_CRON_WRAPPER_VERSION = 2
export const WINDOWS_CRON_WRAPPER_VERSION_MARKER =
  `$FlyEnvCronWrapperVersion = ${WINDOWS_CRON_WRAPPER_VERSION}`

export function isCurrentWindowsCronWrapper(content: string | Buffer | undefined): boolean {
  return `${content || ''}`.includes(WINDOWS_CRON_WRAPPER_VERSION_MARKER)
}
```

Start every generated wrapper with the marker:

```ts
return `${WINDOWS_CRON_WRAPPER_VERSION_MARKER}
$ErrorActionPreference = 'Continue'
```

Replace the code after the directory creation with the following complete lock, command, record, cleanup, and disposal block. This keeps the OEM decoder unchanged and leaves the reusable lock file in place:

```powershell
$LockFile = Join-Path $RunDir "$JobId.running.lock"
$LockHandle = $null
try {
  $LockHandle = [IO.File]::Open(
    $LockFile,
    [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::None
  )
} catch [IO.IOException] {
  exit 0
} catch {
  exit 1
}

$ExitCode = 1
try {
  $RunId = "$(Get-Date -Format yyyyMMddHHmmss)-$PID"
  $OutFile = Join-Path $RunDir "$JobId-$RunId.out"
  $ErrFile = Join-Path $RunDir "$JobId-$RunId.err"
  $StartedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $ExitCode = 0
  $CmdEncoding = [Text.Encoding]::Default
  try {
    $CmdEncoding = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
  } catch {}

  try {
    if (-not (Test-Path -LiteralPath $WorkDir -PathType Container)) {
      [IO.File]::WriteAllText($ErrFile, "Work directory not found: $WorkDir", [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
      $ExitCode = 1
    } else {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $CmdExe
      $psi.Arguments = '/d /c ' + $Command
      $psi.WorkingDirectory = $WorkDir
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      try {
        $psi.StandardOutputEncoding = $CmdEncoding
        $psi.StandardErrorEncoding = $CmdEncoding
      } catch {}

      $process = New-Object System.Diagnostics.Process
      $process.StartInfo = $psi
      [void]$process.Start()
      $stdoutTask = $process.StandardOutput.ReadToEndAsync()
      $stderrTask = $process.StandardError.ReadToEndAsync()
      $process.WaitForExit()
      [IO.File]::WriteAllText($OutFile, $stdoutTask.Result, [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText($ErrFile, $stderrTask.Result, [Text.Encoding]::UTF8)
      $ExitCode = $process.ExitCode
    }
  } catch {
    [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
    [IO.File]::WriteAllText($ErrFile, $_.Exception.Message, [Text.Encoding]::UTF8)
    $ExitCode = 1
  }

  $FinishedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $record = [ordered]@{
    id = $RunId
    jobId = $JobId
    hostId = if ($HostId) { [long]$HostId } else { $null }
    scope = $Scope
    startedAt = $StartedAt
    finishedAt = $FinishedAt
    duration = $FinishedAt - $StartedAt
    exitCode = $ExitCode
    output = if (Test-Path -LiteralPath $OutFile) { [IO.File]::ReadAllText($OutFile) } else { '' }
    error = if (Test-Path -LiteralPath $ErrFile) { [IO.File]::ReadAllText($ErrFile) } else { '' }
  }
  ($record | ConvertTo-Json -Compress -Depth 4) | Add-Content -Encoding UTF8 -LiteralPath $LogFile
  Remove-Item -Force -LiteralPath $OutFile, $ErrFile -ErrorAction SilentlyContinue
} finally {
  if ($null -ne $LockHandle) {
    $LockHandle.Dispose()
  }
}
exit $ExitCode
```

- [ ] **Step 4: Run the contract and verify GREEN**

Run:

```bash
npx tsx scripts/phase4-install-terminal-cron-test.ts
```

Expected: PASS with `phase4 install terminal cron tests passed`.

- [ ] **Step 5: Commit the lock change**

```bash
git add scripts/phase4-install-terminal-cron-test.ts src/fork/module/Cron/WindowsSystemScheduler.ts
git commit -m "fix: use crash-safe windows cron lock"
```

### Task 2: Repair Existing Generated Wrappers on Startup

**Files:**

- Create: `scripts/windows-cron-wrapper-migration-test.ts`
- Modify: `src/fork/module/Cron/WindowsSystemScheduler.ts`
- Modify: `src/fork/module/Cron/SystemScheduler.ts`
- Modify: `src/fork/module/Cron/index.ts:52-57`

- [ ] **Step 1: Write the failing migration test**

Create `scripts/windows-cron-wrapper-migration-test.ts` with real temporary files. The test sets a deterministic Windows environment, creates current/legacy/disabled/broken wrapper cases, calls `repair`, and verifies that migration is selective and failure-isolated:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CronJob } from '@shared/app'
import EnvSync from '@shared/EnvSync'
import {
  WINDOWS_CRON_WRAPPER_VERSION_MARKER,
  WindowsSystemScheduler
} from '../src/fork/module/Cron/WindowsSystemScheduler'
import { taskScriptPath } from '../src/fork/module/Cron/utils'

const root = await mkdtemp(join(tmpdir(), 'flyenv-windows-cron-'))
const original = {
  AppEnv: EnvSync.AppEnv,
  CMDPath: EnvSync.CMDPath,
  PowerShellPath: EnvSync.PowerShellPath,
  SystemPath: EnvSync.SystemPath
}

const job = (id: string, enabled = true): CronJob => ({
  id,
  name: id,
  command: `echo ${id}`,
  schedule: '* * * * *',
  enabled,
  scope: 'global',
  createdAt: 1,
  updatedAt: 1
})

try {
  EnvSync.AppEnv = { Path: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows' }
  EnvSync.CMDPath = 'C:\\Windows\\System32\\cmd.exe'
  EnvSync.PowerShellPath =
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  EnvSync.SystemPath = 'C:\\Windows\\System32'

  const current = job('current')
  const legacy = job('legacy')
  const missing = job('missing')
  const disabled = job('disabled', false)
  const broken = job('broken')
  const repairedAfterError = job('repaired-after-error')

  await mkdir(join(root, 'tasks'), { recursive: true })
  await writeFile(
    taskScriptPath(root, current.id, 'ps1'),
    `${WINDOWS_CRON_WRAPPER_VERSION_MARKER}\ncurrent sentinel`
  )
  await writeFile(taskScriptPath(root, legacy.id, 'ps1'), '$LockDir = "legacy"')
  await writeFile(taskScriptPath(root, disabled.id, 'ps1'), '$LockDir = "disabled"')
  await mkdir(taskScriptPath(root, broken.id, 'ps1'))

  const errors: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => errors.push(args)
  try {
    await new WindowsSystemScheduler(root).repair([
      current,
      legacy,
      missing,
      disabled,
      broken,
      repairedAfterError
    ])
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(
    await readFile(taskScriptPath(root, current.id, 'ps1'), 'utf8'),
    `${WINDOWS_CRON_WRAPPER_VERSION_MARKER}\ncurrent sentinel`
  )
  assert.match(
    await readFile(taskScriptPath(root, legacy.id, 'ps1'), 'utf8'),
    new RegExp(WINDOWS_CRON_WRAPPER_VERSION_MARKER.replace('$', '\\$'))
  )
  assert.match(
    await readFile(taskScriptPath(root, missing.id, 'ps1'), 'utf8'),
    new RegExp(WINDOWS_CRON_WRAPPER_VERSION_MARKER.replace('$', '\\$'))
  )
  assert.equal(
    await readFile(taskScriptPath(root, disabled.id, 'ps1'), 'utf8'),
    '$LockDir = "disabled"'
  )
  assert.match(
    await readFile(taskScriptPath(root, repairedAfterError.id, 'ps1'), 'utf8'),
    new RegExp(WINDOWS_CRON_WRAPPER_VERSION_MARKER.replace('$', '\\$'))
  )
  assert.equal(errors.length, 1)
} finally {
  EnvSync.AppEnv = original.AppEnv
  EnvSync.CMDPath = original.CMDPath
  EnvSync.PowerShellPath = original.PowerShellPath
  EnvSync.SystemPath = original.SystemPath
  await rm(root, { recursive: true, force: true })
}

console.log('windows cron wrapper migration tests passed')
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
npx tsx scripts/windows-cron-wrapper-migration-test.ts
```

Expected: TypeScript compilation fails because `WindowsSystemScheduler.repair` does not exist.

- [ ] **Step 3: Implement selective per-job repair**

Import `readFile` in `WindowsSystemScheduler.ts`, then add a public repair method:

```ts
import { mkdirp, readFile, remove, spawnPromiseWithEnv, writeFile } from '../../Fn'

async repair(jobs: CronJob[]): Promise<void> {
  for (const job of jobs) {
    if (!job.enabled) {
      continue
    }

    try {
      const psFile = this.taskScriptPath(job.id, 'ps1')
      const content = await readFile(psFile, 'utf8').catch(() => undefined)
      if (isCurrentWindowsCronWrapper(content)) {
        continue
      }
      await this.writeWrapper(job)
    } catch (error) {
      console.error(`[Cron][Windows] wrapper repair failed for ${job.id}:`, error)
    }
  }
}
```

Extend the scheduler interface and facade in `SystemScheduler.ts`:

```ts
interface PlatformSystemScheduler {
  install(job: CronJob): Promise<void>
  remove(jobId: string): Promise<void>
  repair?(jobs: CronJob[]): Promise<void>
  listSystemTasks(): Promise<SystemScheduledTask[]>
  deleteSystemTask(id: string): Promise<void>
}

async repair(jobs: CronJob[]): Promise<void> {
  await this.platformScheduler()?.repair?.(jobs)
}
```

Call repair after loading normalized Cron data in `Cron.syncCronMetadata`:

```ts
private async syncCronMetadata(): Promise<void> {
  const data = await this.storage.load()
  await this.systemScheduler.repair(flattenJobs(data))
  if (ensureNextRunTimes(data) || (await this.runRecords.syncLatest(data))) {
    await this.storage.save(data)
  }
}
```

- [ ] **Step 4: Run migration and wrapper contracts and verify GREEN**

Run:

```bash
npx tsx scripts/windows-cron-wrapper-migration-test.ts
npx tsx scripts/phase4-install-terminal-cron-test.ts
```

Expected: both commands exit 0 and print their success messages.

- [ ] **Step 5: Commit startup migration**

```bash
git add scripts/windows-cron-wrapper-migration-test.ts src/fork/module/Cron/WindowsSystemScheduler.ts src/fork/module/Cron/SystemScheduler.ts src/fork/module/Cron/index.ts
git commit -m "fix: migrate existing windows cron wrappers"
```

### Task 3: Add a Windows Runtime Regression Test and Final Verification

**Files:**

- Create: `scripts/windows-cron-wrapper-runtime-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the Windows-only runtime test**

Create `scripts/windows-cron-wrapper-runtime-test.ts`. It must exit successfully with an explicit skip on non-Windows hosts. On Windows it creates a generated wrapper, starts two concurrent PowerShell processes for the same job, and verifies only one command writes the counter. It then terminates a running wrapper tree with `taskkill /T /F`, reruns the wrapper, and verifies the OS-released lock permits another execution:

```ts
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { buildWindowsCronWrapperScript } from '../src/fork/module/Cron/WindowsSystemScheduler'

if (process.platform !== 'win32') {
  console.log('windows cron wrapper runtime tests skipped: Windows required')
  process.exit(0)
}

const waitForExit = (child: ReturnType<typeof spawn>) => {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  if (child.signalCode !== null) return Promise.resolve(1)
  return new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

const waitForFile = async (file: string) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const content = await readFile(file, 'utf8').catch(() => '')
    if (content.trim()) return content
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${file}`)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-windows-cron-runtime-'))
try {
  const counter = join(root, 'counter.txt')
  const logFile = join(root, 'runs', 'runtime.jsonl')
  const wrapper = join(root, 'runtime.ps1')
  const command = `echo run>>"${counter}" & ping 127.0.0.1 -n 3 >nul`
  await writeFile(
    wrapper,
    buildWindowsCronWrapperScript({
      jobId: 'runtime',
      scope: 'global',
      command,
      workDir: root,
      runDir: join(root, 'tmp'),
      logFile,
      cmdExe: process.env.ComSpec || 'cmd.exe',
      envPath: process.env.Path || ''
    })
  )

  const run = () =>
    spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper],
      { windowsHide: true }
    )

  const first = run()
  await waitForFile(counter)
  const second = run()
  assert.equal(await waitForExit(second), 0)
  assert.equal(await waitForExit(first), 0)
  assert.equal((await readFile(counter, 'utf8')).trim().split(/\r?\n/).length, 1)

  await writeFile(counter, '')
  const interrupted = run()
  await waitForFile(counter)
  const killer = spawn('taskkill.exe', ['/PID', `${interrupted.pid}`, '/T', '/F'], {
    windowsHide: true
  })
  assert.equal(await waitForExit(killer), 0)
  await waitForExit(interrupted)
  assert.equal(await waitForExit(run()), 0)
  assert.equal((await readFile(counter, 'utf8')).trim().split(/\r?\n/).length, 2)

  const records = (await readFile(logFile, 'utf8')).trim().split(/\r?\n/)
  assert.ok(records.length >= 2)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('windows cron wrapper runtime tests passed')
```

- [ ] **Step 2: Add the focused package script**

Add to `package.json`:

```json
"test:windows-cron": "tsx scripts/phase4-install-terminal-cron-test.ts && tsx scripts/windows-cron-wrapper-migration-test.ts && tsx scripts/windows-cron-wrapper-runtime-test.ts"
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
yarn test:windows-cron
```

Expected on macOS/Linux: generator and migration tests pass; runtime test prints its explicit Windows-required skip. Expected on Windows: all three tests pass.

- [ ] **Step 4: Run lint and static verification**

Run:

```bash
npx eslint src/fork/module/Cron/WindowsSystemScheduler.ts src/fork/module/Cron/SystemScheduler.ts src/fork/module/Cron/index.ts scripts/phase4-install-terminal-cron-test.ts scripts/windows-cron-wrapper-migration-test.ts scripts/windows-cron-wrapper-runtime-test.ts
git diff --check
```

Expected: both commands exit 0 with no errors.

- [ ] **Step 5: Review the final diff against the approved design**

Run:

```bash
git diff HEAD~2 -- src/fork/module/Cron/WindowsSystemScheduler.ts src/fork/module/Cron/SystemScheduler.ts src/fork/module/Cron/index.ts scripts/phase4-install-terminal-cron-test.ts scripts/windows-cron-wrapper-migration-test.ts scripts/windows-cron-wrapper-runtime-test.ts package.json
```

Verify that the diff contains no VBS/WSH launcher, no 300-second stale timeout, no unconditional UTF-8 command decoder, and no Monaco changes.

- [ ] **Step 6: Commit the runtime test and test command**

```bash
git add scripts/windows-cron-wrapper-runtime-test.ts package.json
git commit -m "test: cover windows cron wrapper runtime"
```
