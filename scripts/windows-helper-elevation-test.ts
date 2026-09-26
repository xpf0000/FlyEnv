import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as installer from '../src/shared/WindowsHelperInstaller'
import {
  buildWindowsHelperInstallScript,
  windowsHelperInstancePaths
} from '../src/shared/WindowsHelperIdentity'

const exec = promisify(execFile)
async function main() {
  assert.equal(typeof installer.runWindowsHelperInstaller, 'function')
  if (process.platform !== 'win32') return
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "FlyEnv 中文 O'Brien ! %PATH% "))
  const file = path.join(directory, "result '$ ! %.txt")
  const literal = `'${file.replace(/'/g, "''")}'`
  const identity = {
    ...windowsHelperInstancePaths('S-1-5-21-100-200-300-400'),
    sid: 'S-1-5-21-100-200-300-400',
    account: "PC\\中文 O'Brien ! %PATH%",
    localAppData: directory
  }
  const completeScript = buildWindowsHelperInstallScript(
    await fs.readFile('static/sh/Windows/flyenv-auto-start-now.ps1', 'utf8'),
    {
      identity,
      executable: identity.executable,
      sourceExecutable: path.join(directory, 'helper.exe'),
      backupExecutable: path.join(directory, 'backup.exe'),
      dataPath: directory,
      helperVersion: 27
    }
  )
  const fullPlan = installer.buildWindowsHelperElevationPlan(completeScript, 'fixture', 'nonce')
  assert.ok(
    fullPlan.launcher.length < 30000,
    'Complete installer must fit the Windows command line'
  )
  const launch: NonNullable<
    Parameters<typeof installer.runWindowsHelperInstaller>[1]
  >['launch'] = async (plan) =>
    exec(plan.powershell, ['-NoProfile', '-NonInteractive', '-Command', plan.childCommand], {
      windowsHide: true,
      timeout: 20000
    })
  try {
    const result = await installer.runWindowsHelperInstaller(
      `[IO.File]::WriteAllText(${literal}, '中文 ! %PATH%'); Write-Host 'installed'; $global:LASTEXITCODE = 0; exit 0`,
      { launch }
    )
    assert.equal(await fs.readFile(file, 'utf8'), '中文 ! %PATH%')
    assert.match(result.stdout, /installed/)
    const oversized = await installer.runWindowsHelperInstaller(
      `Write-Output ('中文' * 20000); $global:LASTEXITCODE = 0; exit 0`,
      { launch }
    )
    assert.ok(oversized.stdout.length <= 8000, 'A single output line must also be bounded')
    await assert.rejects(
      installer.runWindowsHelperInstaller(
        `[Console]::Error.WriteLine('FLYENV_HELPER_INSTALL_ERROR:helper_acl_invalid:stage=fixture'); $global:LASTEXITCODE = 1; exit 1`,
        { launch }
      ),
      (error: any) => error.code === 'helper_acl_invalid' && /stage=fixture/.test(error.stderr)
    )
    await assert.rejects(
      installer.runWindowsHelperInstaller('exit 0', {
        launch: async () => {
          throw Object.assign(new Error('cancelled'), { stdout: '{"nativeErrorCode":1223}' })
        }
      }),
      (error: any) => error.code === 'elevation_uac_cancelled'
    )
    await assert.rejects(
      installer.runWindowsHelperInstaller('exit 0', {
        launch: async () => {
          throw Object.assign(new Error('timeout'), { killed: true })
        }
      }),
      (error: any) =>
        error.code === 'elevation_status_timeout' && /may still be finishing/.test(error.message)
    )
    await assert.rejects(
      installer.runWindowsHelperInstaller('exit 0', {
        launch: async () => {
          throw Object.assign(new Error('pipe blocked'), {
            code: 73,
            stdout:
              '{"nativeErrorCode":73,"message":"The elevated installer could not connect to the FlyEnv result pipe. An antivirus or pipe policy may have blocked it."}'
          })
        }
      }),
      (error: any) =>
        error.code === 'elevation_pipe_connect_failed' && /result pipe/.test(error.message)
    )
    const pipePlan = installer.buildWindowsHelperElevationPlan(
      '$global:LASTEXITCODE = 0; exit 0',
      'flyenv-test-missing-pipe',
      'nonce'
    )
    let launcherError: any
    try {
      await exec(
        pipePlan.powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          pipePlan.launcher.replace('-Verb RunAs ', '')
        ],
        { windowsHide: true, timeout: 30000 }
      )
    } catch (error) {
      launcherError = error
    }
    assert.ok(launcherError, 'a missing result pipe must fail the launcher')
    const launcherDetails = JSON.parse((launcherError.stdout ?? '').trim())
    assert.equal(
      launcherDetails.nativeErrorCode,
      73,
      'the launcher must convert a pipe connect failure into diagnostics'
    )
    let lateChild: Promise<{ stdout: string; stderr: string }> | undefined
    await assert.rejects(
      installer.runWindowsHelperInstaller(
        `Start-Sleep -Milliseconds 1800; $global:LASTEXITCODE = 0; exit 0`,
        {
          launch: async (plan) => {
            lateChild = launch!(plan)
            // Observe rejection immediately, then assert its result below.
            void lateChild.catch(() => {})
            throw Object.assign(new Error('launcher timed out while child continues'), {
              killed: true
            })
          }
        }
      ),
      (error: any) => error.code === 'elevation_status_timeout'
    )
    assert.ok(lateChild)
    await assert.doesNotReject(lateChild!, 'A late child must still be able to publish its result')
    console.log('windows-helper-elevation-test: ok (no elevation requested)')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
