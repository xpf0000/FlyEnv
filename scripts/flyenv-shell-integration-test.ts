import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseFlyEnvPowerShellIntegrationFallbackResult } from '../src/shared/WindowsHelperFallback'
import { buildPowerShellProfileTargets } from '../src/fork/module/Tool.win/init'

const root = path.join(import.meta.dirname, '..')
const fallback = fs.readFileSync(join(root, 'src/shared/WindowsHelperFallback.ts'), 'utf8')
const helper = fs.readFileSync(join(root, 'src/fork/Helper.ts'), 'utf8')
const init = fs.readFileSync(join(root, 'src/fork/module/Tool.win/init.ts'), 'utf8')
const controller = fs.readFileSync(
  join(root, 'src/render/components/Tools/ShellInitController.ts'),
  'utf8'
)
const project = fs.readFileSync(
  join(root, 'src/render/components/LanguageProjects/Project.ts'),
  'utf8'
)
const contract = JSON.parse(
  fs.readFileSync(join(root, 'src/helper-go/contract/helper-contract.json'), 'utf8')
) as { methods: Array<{ module: string; function: string }> }

function join(...parts: string[]) {
  return path.join(...parts)
}

assert.ok(
  contract.methods.some(
    (method) =>
      method.module === 'tools' && method.function === 'installFlyEnvPowerShellIntegration'
  )
)
assert.match(helper, /'installFlyEnvPowerShellIntegration'/)
assert.match(helper, /helperResponseErrorCode/)
assert.match(fallback, /validateFlyEnvPowerShellIntegrationArgs/)
assert.match(fallback, /buildInstallFlyEnvPowerShellIntegrationScript/)
assert.match(fallback, /await EnvSync\.sync\(\)\.catch\(\(\) => undefined\)/)
assert.match(fallback, /powershellPath: EnvSync\.PowerShellPath \|\| 'powershell\.exe'/)
assert.doesNotMatch(fallback, /powershellPath: 'powershell\.exe'/)
assert.match(fallback, /Assert-FlyEnvPowerShellIntegrationPayload/)
assert.match(fallback, /Assert-FlyEnvAllowedRootsSecurity/)
assert.match(fallback, /Get-Acl -LiteralPath/)
assert.match(fallback, /S-1-5-32-544/)
assert.match(fallback, /# >>> FlyEnv shell integration >>>/)
assert.match(init, /installFlyEnvPowerShellIntegration/)
assert.match(init, /initFlyEnvSHInFlight/)
assert.match(init, /\[Tool\.win\]\[initFlyEnvSH\]\[timing\]/)
assert.match(init, /import EnvSync from '@shared\/EnvSync'/)
assert.match(init, /EnvSync\.sync\(\)/)
assert.match(init, /EnvSync\.PowerShellPath \|\| 'powershell\.exe'/)
assert.match(init, /env-sync/)
assert.match(init, /install-shell-hook/)
assert.match(init, /repair-execution-policy/)
assert.match(init, /executionPolicyRepairInFlight/)
assert.match(init, /Set-ExecutionPolicy RemoteSigned/)
assert.doesNotMatch(init, /getWindowsPowerShellLauncher/)
assert.match(init, /spawnPromiseWithEnv/)
assert.match(init, /buildPowerShellProfileTargets/)
assert.doesNotMatch(init, /queryExecutionPolicy/)
assert.match(init, /Get-ExecutionPolicy -Scope CurrentUser/)
assert.match(init, /Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force/)
assert.doesNotMatch(init, /queryProfile/)
assert.doesNotMatch(init, /profile-env-sync/)
assert.match(controller, /private inFlight\?: Promise<FlyEnvShellInitResult \| undefined>/)
assert.match(controller, /response\?\.code === 200/)
assert.match(controller, /IPC\.off\(key\)/)
assert.match(
  controller,
  /import \{[\s\S]*appHelperErrorFromIPC,[\s\S]*isAppHelperUnavailableError[\s\S]*\} from '@shared\/WindowsHelperState'/
)
assert.match(
  controller,
  /appHelperErrorFromIPC\(response\) \?\?\s*new Error\(response\?\.msg/,
  'fork IPC must rehydrate Helper errors before the controller suppresses the global installer flow'
)
assert.match(
  controller,
  /if \(isAppHelperUnavailableError\(error\)\) \{\s*return undefined\s*\}/,
  'the Helper installer flow owns unavailable-helper notices; shell initialization must not leak a raw socket error'
)
assert.match(project, /import ShellInitController from '@\/components\/Tools\/ShellInitController'/)
assert.doesNotMatch(project, /from '@\/util\/IPC'/)
assert.match(project, /this\.initDirs\(\)/)
assert.match(project, /ShellInitController\.ensure\(\)/)
assert.match(project, /let shellInitialized = false/)
assert.match(project, /shellInitialized = !!\(await measureSetDirEnvStep/)
assert.match(project, /if \(!dirsInitialized \|\| !shellInitialized\)/)

assert.deepEqual(
  parseFlyEnvPowerShellIntegrationFallbackResult(
    JSON.stringify({
      scriptState: 'unchanged',
      profiles: [
        {
          edition: 'pwsh',
          path: 'C:\\Users\\FlyEnv\\Documents\\PowerShell\\Profile.ps1',
          state: 'unchanged'
        }
      ]
    })
  ),
  {
    scriptState: 'unchanged',
    profiles: [
      {
        edition: 'pwsh',
        path: 'C:\\Users\\FlyEnv\\Documents\\PowerShell\\Profile.ps1',
        state: 'unchanged'
      }
    ]
  }
)
assert.throws(() => parseFlyEnvPowerShellIntegrationFallbackResult('not JSON'), /invalid JSON/)

assert.deepEqual(buildPowerShellProfileTargets('C:\\Users\\FlyEnv\\OneDrive\\文档'), [
  {
    edition: 'windows-powershell',
    path: 'C:\\Users\\FlyEnv\\OneDrive\\文档\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1'
  },
  {
    edition: 'pwsh',
    path: 'C:\\Users\\FlyEnv\\OneDrive\\文档\\PowerShell\\Profile.ps1'
  }
])

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flyenv-shell-test-'))
try {
  const profile = join(
    isolatedRoot,
    'OneDrive',
    '文档',
    'WindowsPowerShell',
    'Microsoft.PowerShell_profile.ps1'
  )
  const script = join(isolatedRoot, 'FlyEnv-Data', 'bin', 'flyenv.ps1')
  assert.ok(
    profile.endsWith(
      path.join('OneDrive', '文档', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
    )
  )
  assert.ok(script.endsWith(path.join('FlyEnv-Data', 'bin', 'flyenv.ps1')))

  if (process.platform === 'win32') {
    const originalProgramData = process.env.ProgramData
    const originalUserProfile = process.env.USERPROFILE
    const programData = join(isolatedRoot, 'ProgramData')
    const dataRoot = join(isolatedRoot, 'FlyEnv-Data')
    process.env.ProgramData = programData
    process.env.USERPROFILE = isolatedRoot
    try {
      fs.mkdirSync(join(programData, 'FlyEnv'), { recursive: true })
      fs.writeFileSync(join(programData, 'FlyEnv', 'flyenv.allowed-roots'), dataRoot, 'utf8')
      fs.mkdirSync(path.dirname(profile), { recursive: true })
      fs.writeFileSync(profile, "function prompt { 'custom' }\r\n", 'utf8')
      const { buildFlyEnvPowerShellIntegrationUacPlan } =
        await import('../src/shared/WindowsHelperFallback')
      const request = {
        scriptPath: script,
        scriptBase64: Buffer.from("Write-Output 'FlyEnv shell test'", 'utf8').toString('base64'),
        profiles: [{ edition: 'windows-powershell', path: profile }]
      }
      assert.throws(
        () =>
          buildFlyEnvPowerShellIntegrationUacPlan([
            {
              ...request,
              profiles: [
                {
                  edition: 'windows-powershell',
                  path: join(isolatedRoot, 'OneDrive', '文档', 'Microsoft.PowerShell_profile.ps1')
                }
              ]
            }
          ]),
        /unexpected windows-powershell profile path/
      )
      assert.throws(
        () =>
          buildFlyEnvPowerShellIntegrationUacPlan([
            {
              ...request,
              profiles: [
                {
                  edition: 'windows-powershell',
                  path: join(
                    path.dirname(isolatedRoot),
                    'outside-home',
                    'WindowsPowerShell',
                    'Microsoft.PowerShell_profile.ps1'
                  )
                }
              ]
            }
          ]),
        /unexpected windows-powershell profile path/
      )
      const uacPlan = buildFlyEnvPowerShellIntegrationUacPlan([request], {
        callerHome: isolatedRoot,
        powershellPath: 'powershell.exe',
        resultPath: join(isolatedRoot, 'result.json'),
        nonce: 'flyenv-shell-test-nonce'
      })
      assert.deepEqual(uacPlan.args.slice(0, -1), [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-NonInteractive',
        '-Command'
      ])
      assert.match(uacPlan.args.at(-1) ?? '', /Start-Process -FilePath/)
      assert.doesNotMatch(uacPlan.childScript, /Get-Content -LiteralPath .*fallback-/)
      assert.match(uacPlan.childScript, /flyenv-shell-test-nonce/)
      assert.match(uacPlan.childScript, /current user home/)
      assert.match(uacPlan.childScript, /\$Result \| ConvertTo-Json -Compress -Depth 8/)
      assert.ok(uacPlan.childScript.includes("if ($Value -match '(^|[\\\\/])\\.\\.([\\\\/]|$)')"))
      assert.match(uacPlan.childScript, /Assert-FlyEnvAllowedRootsSecurity/)
      assert.match(uacPlan.args.at(-1) ?? '', /-WindowStyle\s+Hidden/)
      assert.match(
        uacPlan.childScript,
        /Set-Content -LiteralPath \$temporary -Value \$Bytes -Encoding Byte -Force/
      )
      assert.match(uacPlan.childScript, /\$profileLine = \[string\]::Concat\(/)
      assert.doesNotMatch(
        uacPlan.childScript,
        /'\$flyenvScript = ''' \+ \$scriptPath\.Replace\("'", "''"\) \+ ''''/
      )
      assert.ok(uacPlan.commandLength < 30_000)
      const childCommand = (uacPlan as { childCommand?: unknown }).childCommand
      assert.equal(typeof childCommand, 'string')
      if (typeof childCommand !== 'string') {
        throw new Error('FlyEnv UAC plan did not include the direct child command')
      }
      assert.doesNotThrow(() => {
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$tokens = $null
$errors = $null
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:FLYENV_SHELL_TEST_SOURCE))
[Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw $errors[0].Message }`
          ],
          {
            encoding: 'utf8',
            windowsHide: true,
            env: {
              ...process.env,
              FLYENV_SHELL_TEST_SOURCE: Buffer.from(uacPlan.childScript, 'utf8').toString('base64')
            },
            stdio: ['ignore', 'pipe', 'pipe']
          }
        )
      })
      let childFailure: unknown
      try {
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-Command', childCommand],
          {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
          }
        )
      } catch (error) {
        childFailure = error
      }
      assert.ok(childFailure instanceof Error)
      const rejectedUacResult = JSON.parse(fs.readFileSync(uacPlan.resultPath, 'utf8'))
      assert.equal(rejectedUacResult.nonce, 'flyenv-shell-test-nonce')
      assert.match(rejectedUacResult.error, /failed to inspect allowed roots ACL/)
      assert.equal(fs.existsSync(script), false)
      assert.doesNotMatch(fs.readFileSync(profile, 'utf8'), /# >>> FlyEnv shell integration >>>/)

      assert.throws(
        () =>
          buildFlyEnvPowerShellIntegrationUacPlan(
            [
              {
                ...request,
                scriptBase64: randomBytes(64 * 1024).toString('base64')
              }
            ],
            {
              callerHome: isolatedRoot,
              powershellPath: 'powershell.exe',
              resultPath: join(isolatedRoot, 'large-result.json'),
              nonce: 'flyenv-shell-large-payload'
            }
          ),
        /too large for direct UAC invocation/
      )
    } finally {
      if (originalProgramData === undefined) delete process.env.ProgramData
      else process.env.ProgramData = originalProgramData
      if (originalUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = originalUserProfile
    }
  }
} finally {
  fs.rmSync(isolatedRoot, { recursive: true, force: true })
}

console.log('FlyEnv shell integration tests passed')
