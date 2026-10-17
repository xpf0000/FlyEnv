import { access, chmod, copyFile, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCommand } from './runtime'

const udisks = '/usr/bin/udisksctl'
const findmnt = '/usr/bin/findmnt'
const processList = '/bin/ps'
type Outcome = { installed: boolean; warning?: string; handoffError?: string }
type Dependencies = {
  command: typeof runCommand
  exists: (file: string) => Promise<boolean>
  env: NodeJS.ProcessEnv
}

const exists = async (file: string) => {
  try {
    await access(file)
    return true
  } catch (error: any) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const unknown = (detail: string) => new Error(`DAMENG_OUTCOME_UNKNOWN: ${detail}`)

export function parseLinuxLoopDevice(output: string): string {
  const devices = [...new Set(output.match(/\/dev\/loop[0-9]+(?=[.\s]|$)/g) ?? [])]
  if (devices.length !== 1)
    throw unknown(
      'Loop setup did not return one identifiable loop device; inspect mounted media before retrying.'
    )
  return devices[0]
}

export function parseLinuxMountTarget(output: string): string {
  let result: { filesystems?: { target?: string }[] }
  try {
    result = JSON.parse(output)
  } catch {
    throw new Error('Unable to read the official DM media mount location.')
  }
  if (!Array.isArray(result.filesystems) || result.filesystems.length !== 1)
    throw new Error('Expected one official DM media mount location.')
  const target = result.filesystems[0]?.target
  if (
    typeof target !== 'string' ||
    !isAbsolute(target) ||
    target.includes('\0') ||
    target.includes('\n')
  )
    throw new Error('Invalid official DM media mount location.')
  return target
}

/** Fork owns execution; the caller owns cross-worker admission and final installation paths. */
export function createLinuxOperations(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { command: runCommand, exists, env: process.env, ...overrides }

  const assertNoRunningDm = async () => {
    if (!(await deps.exists(processList)))
      throw new Error('DM installation requires /bin/ps to check existing database processes.')
    const commands = await deps.command(processList, ['-eo', 'comm='], { timeoutMs: 15_000 })
    if (commands.split(/\r?\n/).some((line) => /^(dmserver(?:_s)?|dmap)$/.test(line.trim()))) {
      throw new Error(
        'An existing DM database or auxiliary process is running. It will not be stopped or taken over.'
      )
    }
  }

  const assertInstallPreconditions = async () => {
    for (const file of ['/etc/dm_svc.conf', '/etc/DAMENG']) {
      if (await deps.exists(file))
        throw new Error(
          `Existing shared DM configuration ${file} conflicts with this installation; external DM will not be changed.`
        )
    }
    if (deps.env.DM_HOME || deps.env.DM_SVC_PATH)
      throw new Error('Existing DM environment configuration conflicts with this installation.')
    for (const file of [udisks, findmnt]) {
      if (!(await deps.exists(file)))
        throw new Error(
          `Required dependency ${file} is unavailable. Install the system udisks2/util-linux tools before installing DM.`
        )
    }
    await assertNoRunningDm()
  }

  const completeEngine = async (directory: string) => {
    for (const name of ['dmserver', 'dminit', 'disql']) {
      if (
        !(await stat(join(directory, 'bin', name))
          .then((item) => item.isFile() && item.size > 0)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return false
            throw unknown(`Unable to verify installed engine ${name}: ${message(error)}`)
          }))
      )
        return false
    }
    return true
  }

  const install = async (
    isoFile: string,
    installDir: string,
    xml: string,
    onStage: (stage: string) => void
  ): Promise<Outcome> => {
    await assertInstallPreconditions()
    const warnings: string[] = []
    const stage = (value: string) => {
      try {
        onStage(value)
      } catch (error) {
        warnings.push(`Progress report: ${message(error)}`)
      }
    }
    let loop = '',
      mounted = false,
      scratch = '',
      failure: unknown,
      handoffError: string | undefined,
      installed = false
    try {
      stage('mount')
      let loopOutput: string
      try {
        loopOutput = await deps.command(udisks, ['loop-setup', '--file', isoFile, '--read-only'], {
          timeoutMs: 60_000
        })
      } catch (error) {
        throw unknown(`Loop setup did not confirm whether it created a device: ${message(error)}`)
      }
      loop = parseLinuxLoopDevice(loopOutput)
      // Even a failed mount command can have mounted the loop before losing its response.
      mounted = true
      await deps.command(udisks, ['mount', '--block-device', loop], { timeoutMs: 60_000 })
      const media = parseLinuxMountTarget(
        await deps.command(findmnt, ['--json', '--source', loop, '--output', 'TARGET'], {
          timeoutMs: 15_000
        })
      )
      const source = join(media, 'DMInstall.bin')
      if (!(await stat(source).then((item) => item.isFile())))
        throw new Error('Official DM media has no regular DMInstall.bin installer.')
      scratch = await mkdtemp(join(tmpdir(), 'flyenv-dm-install-'))
      const installer = join(scratch, 'DMInstall.bin'),
        config = join(scratch, 'install.xml')
      await copyFile(source, installer)
      await chmod(installer, 0o700)
      await writeFile(config, xml, { mode: 0o600, flag: 'wx' })
      stage('install')
      try {
        await deps.command(installer, ['-q', config], {
          cwd: scratch,
          env: { DM_INSTALL_TMPDIR: scratch },
          timeoutMs: 30 * 60_000
        })
        installed = await completeEngine(installDir)
        if (!installed)
          throw unknown(
            'The official installer exited without a complete engine. Keep partial installation files and inspect them before retrying.'
          )
      } catch (error) {
        if (/DAMENG_OUTCOME_UNKNOWN/.test(message(error))) throw error
        installed = await completeEngine(installDir)
        if (installed)
          handoffError = `Official installer reported an error after writing the complete engine: ${message(error)}`
        else {
          const files = await readdir(installDir).catch((readError: NodeJS.ErrnoException) => {
            if (readError.code === 'ENOENT') return []
            throw unknown(`Unable to inspect partial installation files: ${message(readError)}`)
          })
          if (files.length)
            throw unknown(`Official installation left incomplete files: ${message(error)}`)
          throw error
        }
      }
    } catch (error) {
      failure = error
    } finally {
      stage('releaseMedia')
      if (loop && mounted) {
        try {
          await deps.command(udisks, ['unmount', '--block-device', loop], { timeoutMs: 60_000 })
        } catch (error) {
          warnings.push(`Media unmount failed: ${message(error)}`)
        }
      }
      if (loop) {
        try {
          await deps.command(udisks, ['loop-delete', '--block-device', loop], { timeoutMs: 60_000 })
        } catch (error) {
          warnings.push(`Loop device release failed: ${message(error)}`)
        }
      }
      if (scratch) {
        // An unconfirmed live installer may still depend on its private temporary tree.
        if (failure && /DAMENG_OUTCOME_UNKNOWN/.test(message(failure)))
          warnings.push(`Private installer files retained for inspection: ${scratch}`)
        else {
          try {
            await rm(scratch, { recursive: true, force: true })
          } catch (error) {
            warnings.push(`Private installer cleanup failed: ${message(error)}`)
          }
        }
      }
    }
    if (failure) throw new Error([message(failure), ...warnings].join('\n'))
    return {
      installed,
      ...(handoffError ? { handoffError } : {}),
      ...(warnings.length ? { warning: warnings.join('\n') } : {})
    }
  }

  const uninstall = async (
    installDir: string
  ): Promise<{ uninstalled: boolean; warning?: string }> => {
    const uninstaller = join(installDir, 'uninstall.sh')
    try {
      await assertNoRunningDm()
      if (!(await deps.exists(uninstaller)))
        throw new Error(
          'The official DM uninstaller is missing. Program and data files were preserved.'
        )
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        noSideEffects: true
      })
    }
    let failure: unknown
    try {
      await deps.command(uninstaller, ['-i'], {
        cwd: installDir,
        input: 'y\n',
        timeoutMs: 30 * 60_000
      })
    } catch (error) {
      failure = error
    }
    if (failure && /DAMENG_OUTCOME_UNKNOWN/.test(message(failure))) throw failure
    let enginePresent: boolean
    try {
      enginePresent = await deps.exists(join(installDir, 'bin', 'dmserver'))
    } catch (error) {
      throw unknown(`Unable to verify official uninstallation: ${message(error)}`)
    }
    if (enginePresent)
      throw unknown(
        `Official uninstallation did not remove the engine; preserve all files and inspect before retrying.${failure ? ` ${message(failure)}` : ''}`
      )
    return {
      uninstalled: true,
      ...(failure
        ? {
            warning: `The engine was removed, but official uninstallation reported: ${message(failure)}`
          }
        : {})
    }
  }

  return { install, uninstall }
}

const operations = createLinuxOperations()
export const linuxInstall = operations.install
export const linuxUninstall = operations.uninstall
