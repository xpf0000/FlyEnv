import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { execPromiseWithEnv } from '@shared/child-process'
import { mergeGvmVersionData, quotePosixShell, type GvmVersionItem } from '@shared/Gvm'

type GvmCommandResult = { stdout: string }
type GvmCommandRunner = (command: string) => Promise<GvmCommandResult>

export function resolveGvmRoot(environmentRoot: string | undefined, userHome: string): string {
  const configured = `${environmentRoot ?? ''}`.trim()
  return configured || join(userHome, '.gvm')
}

export function gvmInitScript(gvmRoot: string): string {
  return join(gvmRoot, 'scripts', 'gvm')
}

export function hasGvm(gvmRoot: string): boolean {
  return existsSync(gvmInitScript(gvmRoot))
}

export function buildGoVersionCommand(bin: string, gvmRoot: string): string {
  const resolvedBin = resolve(bin)
  const gosRoot = resolve(gvmRoot, 'gos')
  const relativeBin = relative(gosRoot, resolvedBin)
  const isManaged =
    relativeBin !== '..' && !relativeBin.startsWith(`..${sep}`) && !isAbsolute(relativeBin)
  const command = `${quotePosixShell(resolvedBin)} version`
  if (!isManaged) {
    return command
  }
  const goRoot = dirname(dirname(resolvedBin))
  return `GOROOT=${quotePosixShell(goRoot)} ${command}`
}

export async function findGvmGoDirectories(gvmRoot: string): Promise<string[]> {
  const gosDirectory = join(gvmRoot, 'gos')
  try {
    const entries = await readdir(gosDirectory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(gosDirectory, entry.name))
      .sort()
  } catch {
    return []
  }
}

const runGvmCommand: GvmCommandRunner = (command) =>
  execPromiseWithEnv(command, { shell: '/bin/bash' })

export async function fetchGvmVersionData(
  initScript: string,
  run: GvmCommandRunner = runGvmCommand
): Promise<GvmVersionItem[]> {
  const init = `source ${quotePosixShell(initScript)}`
  const [available, installed] = await Promise.all([
    run(`${init} && gvm listall`),
    run(`${init} && gvm list`)
  ])
  return mergeGvmVersionData(available.stdout, installed.stdout)
}
