import {
  performanceDiagnosticNow,
  performanceDiagnosticElapsed,
  writePerformanceLog,
  measurePerformanceStep
} from '@shared/PerformanceDiagnostics'
import { mkdirp, readFile, readFileByRoot, spawnPromiseWithEnv, writeFile } from '../../Fn'
import Helper from '../../Helper'
import { ForkPromise } from '@shared/ForkPromise'
import { encodePowerShellCommand } from '@shared/PowerShellCommand'
import EnvSync from '@shared/EnvSync'
import { dirname, join } from 'path'
import { appDebugLog } from '@shared/utils'
import { resolveWindowsPowerShellPath, windowsPowerShellEnv } from '@shared/WindowsSystemPaths'

type ProfileEdition = 'windows-powershell' | 'pwsh'

type PowerShellProfile = {
  edition: ProfileEdition
  path?: string
  state: 'updated' | 'unchanged' | 'skipped' | 'failed'
  reason?: string
}

type GitBashIntegrationState = 'updated' | 'unchanged' | 'failed'

export type FlyEnvShellInitResult = {
  status: 'ready' | 'degraded'
  scriptPath: string
  scriptState: 'updated' | 'unchanged'
  gitBashState: GitBashIntegrationState
  profiles: PowerShellProfile[]
  warnings: string[]
}

type ProfileCandidate = {
  edition: ProfileEdition
  path: string
}

let initFlyEnvSHInFlight: ForkPromise<FlyEnvShellInitResult> | undefined
let executionPolicyRepairInFlight: Promise<void> | undefined

const logShellInitTiming = (details: Record<string, unknown>) => {
  void writePerformanceLog(appDebugLog, '[Tool.win][initFlyEnvSH][timing]', details)
}

const measureShellInitStep = async <T>(
  timings: Record<string, number>,
  step: string,
  operation: () => Promise<T>
): Promise<T> =>
  measurePerformanceStep(step, operation, (event) => {
    const durationMs = event.durationMs ?? 0
    timings[step] = durationMs
    logShellInitTiming({ event: 'step', step, durationMs })
  })

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : `${error}`)

const repairPowerShellExecutionPolicy = async () => {
  const script = `$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq 'Restricted') {
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}`
  await spawnPromiseWithEnv(
    // shell 初始化的配套操作也固定系统 PowerShell；不能只在 UAC 主入口固定路径。
    resolveWindowsPowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(script)],
    { windowsHide: true, env: windowsPowerShellEnv() }
  )
}

const ensurePowerShellExecutionPolicyRepaired = () => {
  if (executionPolicyRepairInFlight) return executionPolicyRepairInFlight
  const operation = repairPowerShellExecutionPolicy().catch((error) => {
    if (executionPolicyRepairInFlight === operation) {
      executionPolicyRepairInFlight = undefined
    }
    throw error
  })
  executionPolicyRepairInFlight = operation
  return operation
}

export const buildPowerShellProfileTargets = (documentsPath: string): ProfileCandidate[] => {
  const documents = documentsPath.trim()
  if (!documents) return []
  const targets: ProfileCandidate[] = [
    {
      edition: 'windows-powershell',
      path: join(documents, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
    }
  ]
  targets.push({
    edition: 'pwsh',
    path: join(documents, 'PowerShell', 'Profile.ps1')
  })
  return targets
}

// SetupGlobalPaths obtains UserDocuments from Electron app.getPath('documents').
// Treat that known-folder result as authoritative, including redirected paths;
// helper implementations must not add an ancestor-owner requirement.
const profileCandidates = () => buildPowerShellProfileTargets(global.Server.UserDocuments ?? '')

export function initAllowDir(json: string) {
  return new ForkPromise(async (resolve) => {
    const jsonFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv.dir')
    const bashFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv-bash.dir')
    const allowedDirectories = JSON.parse(json)
    if (
      !Array.isArray(allowedDirectories) ||
      allowedDirectories.some((item) => typeof item !== 'string')
    ) {
      throw new Error('FlyEnv shell directory list must be an array of paths')
    }
    await mkdirp(dirname(jsonFile))
    await writeFile(jsonFile, json)
    await writeFile(bashFile, `${allowedDirectories.join('\n')}\n`)
    resolve(true)
  })
}

const installGitBashIntegration = async (scriptPath: string) => {
  const bashProfilePath = join(global.Server.UserHome!, '.bashrc')
  const markerBegin = '# >>> FlyEnv Git Bash integration >>>'
  const markerEnd = '# <<< FlyEnv Git Bash integration <<<'
  const quotedScriptPath = scriptPath.replace(/'/g, "'\\''")
  const block = `${markerBegin}\nif command -v cygpath >/dev/null 2>&1; then\n  source "$(cygpath -u '${quotedScriptPath}')"\nfi\n${markerEnd}`
  const original = await readFileByRoot(bashProfilePath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  })
  const markerStart = original.indexOf(markerBegin)
  const markerFinish = original.indexOf(markerEnd)
  if (markerStart < 0 !== markerFinish < 0) {
    throw new Error('Git Bash profile contains an incomplete FlyEnv integration block')
  }
  const updated =
    markerStart >= 0
      ? `${original.slice(0, markerStart)}${block}${original.slice(
          markerFinish + markerEnd.length
        )}`
      : `${original.trimEnd()}${original.trim() ? '\n\n' : ''}${block}\n`
  if (updated !== original) await writeFile(bashProfilePath, updated)
  return updated === original ? ('unchanged' as const) : ('updated' as const)
}

export function initFlyEnvSH(): ForkPromise<FlyEnvShellInitResult> {
  if (initFlyEnvSHInFlight) return initFlyEnvSHInFlight

  const operation = new ForkPromise<FlyEnvShellInitResult>(async (resolve, reject, on) => {
    const timings: Record<string, number> = {}
    const startedAt = performanceDiagnosticNow()
    let currentStep = 'preparing'
    try {
      on('Preparing FlyEnv PowerShell integration')
      const flyenvScriptPath = join(dirname(global.Server.AppDir!), 'bin/flyenv.ps1')
      const warnings: string[] = []
      currentStep = 'env-sync'
      await measureShellInitStep(timings, currentStep, async () => {
        await EnvSync.sync().catch(() => undefined)
      })
      currentStep = 'repair-execution-policy'
      await measureShellInitStep(timings, currentStep, async () => {
        try {
          await ensurePowerShellExecutionPolicyRepaired()
        } catch (error) {
          const reason = `PowerShell execution policy repair failed: ${asErrorMessage(error)}`
          warnings.push(reason)
          logShellInitTiming({ event: 'warning', step: currentStep, reason })
        }
      })
      currentStep = 'read-runtime-script'
      const scriptContent = await measureShellInitStep(timings, currentStep, () =>
        readFile(join(global.Server.Static!, 'sh/fly-env.ps1'))
      )
      const gitBashScriptPath = join(dirname(global.Server.AppDir!), 'bin/fly-env.sh')
      let gitBashState: GitBashIntegrationState = 'failed'
      try {
        const gitBashScriptContent = await measureShellInitStep(
          timings,
          'read-git-bash-script',
          () => readFile(join(global.Server.Static!, 'sh/fly-env.sh'))
        )
        await measureShellInitStep(timings, 'write-git-bash-script', () =>
          writeFile(gitBashScriptPath, gitBashScriptContent)
        )
        gitBashState = await measureShellInitStep(timings, 'install-git-bash-hook', () =>
          installGitBashIntegration(gitBashScriptPath)
        )
      } catch (error) {
        const reason = `Git Bash integration failed: ${asErrorMessage(error)}`
        warnings.push(reason)
        logShellInitTiming({ event: 'warning', step: 'install-git-bash-hook', reason })
      }
      const profiles: PowerShellProfile[] = []

      on('Preparing PowerShell profile targets')
      for (const candidate of profileCandidates()) {
        const profileStep = `prepare-profile:${candidate.edition}`
        currentStep = profileStep
        await measureShellInitStep(timings, profileStep, async () => undefined)
        profiles.push({
          edition: candidate.edition,
          path: candidate.path,
          state: 'unchanged'
        })
      }
      const writableProfiles = profiles.filter(
        (profile): profile is PowerShellProfile & { path: string } => !!profile.path
      )
      if (writableProfiles.length === 0) {
        throw new Error('No supported PowerShell profile could be discovered')
      }

      on('Installing FlyEnv shell hook with Helper or UAC fallback')
      currentStep = 'install-shell-hook'
      const integration: any = await measureShellInitStep(timings, currentStep, () =>
        Helper.send('tools', 'installFlyEnvPowerShellIntegration', {
          scriptPath: flyenvScriptPath,
          scriptBase64: Buffer.from(scriptContent).toString('base64'),
          profiles: writableProfiles.map((profile) => ({
            edition: profile.edition,
            path: profile.path
          }))
        })
      )
      const resultProfiles = Array.isArray(integration?.profiles) ? integration.profiles : []
      if (integration?.scriptState !== 'updated' && integration?.scriptState !== 'unchanged') {
        throw new Error('FlyEnv PowerShell integration did not return a script result')
      }
      for (const profile of profiles) {
        const installed = resultProfiles.find((item: any) => item?.edition === profile.edition)
        if (installed?.state === 'updated' || installed?.state === 'unchanged') {
          profile.state = installed.state
        } else if (profile.path) {
          throw new Error(
            `FlyEnv PowerShell integration did not return a result for ${profile.edition}`
          )
        }
      }

      warnings.push(
        ...profiles
          .filter((profile) => profile.state === 'skipped' || profile.state === 'failed')
          .map((profile) => `${profile.edition}: ${profile.reason ?? `profile ${profile.state}`}`)
      )

      const result: FlyEnvShellInitResult = {
        status: warnings.length > 0 ? 'degraded' : 'ready',
        scriptPath: flyenvScriptPath,
        scriptState: integration.scriptState,
        gitBashState,
        profiles,
        warnings
      }
      logShellInitTiming({
        event: 'completed',
        totalMs: performanceDiagnosticElapsed(startedAt),
        status: result.status,
        timings
      })
      resolve(result)
    } catch (error) {
      logShellInitTiming({
        event: 'failed',
        step: currentStep,
        totalMs: performanceDiagnosticElapsed(startedAt),
        timings,
        error: asErrorMessage(error)
      })
      reject(error)
    }
  })
  initFlyEnvSHInFlight = operation
  operation
    .then(() => {
      if (initFlyEnvSHInFlight === operation) initFlyEnvSHInFlight = undefined
    })
    .catch(() => {
      if (initFlyEnvSHInFlight === operation) initFlyEnvSHInFlight = undefined
    })
  return operation
}
