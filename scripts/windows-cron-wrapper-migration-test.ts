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
  EnvSync.PowerShellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
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
  assert.ok(
    (await readFile(taskScriptPath(root, legacy.id, 'ps1'), 'utf8')).includes(
      WINDOWS_CRON_WRAPPER_VERSION_MARKER
    )
  )
  assert.ok(
    (await readFile(taskScriptPath(root, missing.id, 'ps1'), 'utf8')).includes(
      WINDOWS_CRON_WRAPPER_VERSION_MARKER
    )
  )
  assert.equal(
    await readFile(taskScriptPath(root, disabled.id, 'ps1'), 'utf8'),
    '$LockDir = "disabled"'
  )
  assert.ok(
    (await readFile(taskScriptPath(root, repairedAfterError.id, 'ps1'), 'utf8')).includes(
      WINDOWS_CRON_WRAPPER_VERSION_MARKER
    )
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
