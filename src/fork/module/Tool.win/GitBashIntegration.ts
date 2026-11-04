import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const markerBegin = '# >>> FlyEnv Git Bash integration >>>'
const markerEnd = '# <<< FlyEnv Git Bash integration <<<'

/** PowerShell is required; the companion Bash list reports only its own failure. */
export async function syncShellDirectories(directory: string, directories: string[]) {
  const warnings: string[] = []
  const allowed = directories.filter((path) => {
    if (!/[\x00-\x1f\x7f]/u.test(path)) return true
    warnings.push('Skipped a project directory containing control characters')
    return false
  })
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, '.flyenv.dir'), JSON.stringify(allowed))
  try {
    await writeFile(join(directory, '.flyenv-bash.dir'), `${allowed.join('\n')}\n`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    warnings.push(`Git Bash directory sync failed: ${reason}`)
  }
  return { status: warnings.length ? ('degraded' as const) : ('ready' as const), warnings }
}

const readProfile = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const managedProfile = (original: string, block: string): string => {
  const start = original.indexOf(markerBegin)
  const finish = original.indexOf(markerEnd)
  if (
    start < 0 !== finish < 0 ||
    (start >= 0 &&
      (finish < start ||
        original.indexOf(markerBegin, start + markerBegin.length) >= 0 ||
        original.indexOf(markerEnd, finish + markerEnd.length) >= 0))
  ) {
    throw new Error('Git Bash profile contains an invalid FlyEnv integration block')
  }
  if (start >= 0) {
    return original.slice(0, start) + block + original.slice(finish + markerEnd.length)
  }
  return original + (original ? (original.endsWith('\n') ? '\n' : '\n\n') : '') + block + '\n'
}

/** User profiles are ordinary user files. Missing files never require Helper or UAC. */
export async function installGitBashIntegration(
  userHome: string,
  scriptPath: string,
  scriptContent: string
): Promise<'updated' | 'unchanged'> {
  const bashrc = join(userHome, '.bashrc')
  const profiles = [{ path: bashrc, original: await readProfile(bashrc) }]
  // Login Bash reads only the first existing file in this list. Source the
  // runtime directly so an existing profile need not source all of .bashrc.
  for (const name of ['.bash_profile', '.bash_login', '.profile']) {
    const path = join(userHome, name)
    const original = await readProfile(path)
    if (original !== undefined) {
      profiles.push({ path, original })
      break
    }
  }
  if (profiles.length === 1) {
    profiles.push({ path: join(userHome, '.bash_profile'), original: undefined })
  }
  const quotedScriptPath = scriptPath.replace(/'/g, "'\\''")
  const block = `${markerBegin}
if [ -n "\${BASH_VERSION:-}" ] && command -v cygpath >/dev/null 2>&1; then
  . "$(cygpath -u '${quotedScriptPath}')"
fi
${markerEnd}`
  // Validate both profiles before writing either one; malformed markers must
  // not discard unrelated shell configuration or leave a duplicate hook.
  const updates = profiles.map((profile) => ({
    ...profile,
    content: managedProfile(profile.original ?? '', block)
  }))
  await mkdir(dirname(scriptPath), { recursive: true })
  let changed = false
  if ((await readProfile(scriptPath)) !== scriptContent) {
    await writeFile(scriptPath, scriptContent)
    changed = true
  }
  for (const profile of updates) {
    if (profile.content === profile.original) continue
    await writeFile(profile.path, profile.content)
    changed = true
  }
  return changed ? 'updated' : 'unchanged'
}
