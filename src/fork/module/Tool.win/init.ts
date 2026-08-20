import { mkdirp, readFile, spawnPromiseWithEnv, writeFile } from '../../Fn'
import Helper from '../../Helper'
import { ForkPromise } from '@shared/ForkPromise'
import { encodePowerShellCommand } from '@shared/PowerShellCommand'
import EnvSync from '@shared/EnvSync'
import { dirname, join } from 'path'
import { appDebugLog } from '@shared/utils'

type ProfileEdition = 'windows-powershell' | 'pwsh'

type PowerShellProfile = {
  edition: ProfileEdition
  path?: string
  state: 'updated' | 'unchanged' | 'skipped' | 'failed'
  reason?: string
}

export type FlyEnvShellInitResult = {
  status: 'ready' | 'degraded'
  scriptPath: string
  scriptState: 'updated' | 'unchanged'
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
  void appDebugLog('[Tool.win][initFlyEnvSH][timing]', JSON.stringify(details))
}

const measureShellInitStep = async <T>(
  timings: Record<string, number>,
  step: string,
  operation: () => Promise<T>
): Promise<T> => {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    const durationMs = Date.now() - startedAt
    timings[step] = durationMs
    logShellInitTiming({ event: 'step', step, durationMs })
  }
}

const asErrorMessage = (error: unknown) => (error instanceof Error ? error.message : `${error}`)

const repairPowerShellExecutionPolicy = async () => {
  const script = `$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq 'Restricted') {
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}`
  await spawnPromiseWithEnv(
    EnvSync.PowerShellPath || 'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(script)],
    { windowsHide: true }
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

const profileCandidates = () => buildPowerShellProfileTargets(global.Server.UserDocuments ?? '')

export function initAllowDir(json: string) {
  return new ForkPromise(async (resolve) => {
    const jsonFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv.dir')
    await mkdirp(dirname(jsonFile))
    await writeFile(jsonFile, json)
    resolve(true)
  })
}

export function initFlyEnvSH(): ForkPromise<FlyEnvShellInitResult> {
  if (initFlyEnvSHInFlight) return initFlyEnvSHInFlight

  const operation = new ForkPromise<FlyEnvShellInitResult>(async (resolve, reject, on) => {
    const timings: Record<string, number> = {}
    const startedAt = Date.now()
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
        profiles,
        warnings
      }
      logShellInitTiming({
        event: 'completed',
        totalMs: Date.now() - startedAt,
        status: result.status,
        timings
      })
      resolve(result)
    } catch (error) {
      logShellInitTiming({
        event: 'failed',
        step: currentStep,
        totalMs: Date.now() - startedAt,
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
