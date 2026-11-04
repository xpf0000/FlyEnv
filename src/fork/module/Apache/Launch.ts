import { execFile } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { access, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import EnvSync from '@shared/EnvSync'

const execFileAsync = promisify(execFile)

/** Keep the installed version/config identity, but give Linux Helper the actual server. */
export async function resolveLinuxApacheLaunch(
  selectedBin: string
): Promise<{ bin: string; execEnv?: Record<string, string> }> {
  const selected = await realpath(selectedBin)
  const selectedDir = dirname(selected)
  const direct = ['httpd', 'apache2'].includes(basename(selected))
  // Honour a wrapper's literal HTTPD path without evaluating the wrapper or starting a service.
  const declaration = direct
    ? undefined
    : (await readFile(selected, 'utf8')).match(
        /^\s*(?:export\s+)?HTTPD=(?:'([^']*)'|"([^"$`]*)"|([^\s'"$`]+))\s*(?:#.*)?$/m
      )
  const literalTarget = declaration?.slice(1).find((value) => value !== undefined)
  const debian =
    basename(selected).startsWith('apache2') || basename(literalTarget ?? '') === 'apache2'
  const serverNames = debian ? ['apache2', 'httpd'] : ['httpd', 'apache2']
  const peerDirs = [selectedDir, join(selectedDir, '../sbin'), join(selectedDir, '../bin')]

  // apachectl normally sources envvars before launching httpd (notably Debian and source builds).
  const env = await EnvSync.sync()
  const envFiles = debian
    ? [env.APACHE_ENVVARS || join(env.APACHE_CONFDIR || '/etc/apache2', 'envvars')]
    : [
        join(selectedDir, 'envvars'),
        ...(literalTarget && isAbsolute(literalTarget)
          ? [join(dirname(literalTarget), 'envvars')]
          : []),
        ...peerDirs.slice(1).map((dir) => join(dir, 'envvars'))
      ]
  const envFile = envFiles.find((file) => existsSync(file))
  let execEnv: Record<string, string> | undefined
  if (envFile) {
    // Source as the desktop user. Paths are positional arguments, never shell interpolation.
    const { stdout } = await execFileAsync(
      '/bin/sh',
      ['-c', 'set -a; . "$1" >&2 || exit $?; /usr/bin/env -0', 'flyenv-apache-env', envFile],
      { cwd: selectedDir, env, timeout: 5000, maxBuffer: 1024 * 1024, encoding: 'utf8' }
    )
    execEnv = {}
    for (const entry of stdout.split('\0')) {
      const index = entry.indexOf('=')
      if (index <= 0) continue
      const name = entry.slice(0, index)
      const value = entry.slice(index + 1)
      if (env[name] !== value && !['PWD', 'OLDPWD', 'SHLVL', '_'].includes(name))
        execEnv[name] = value
    }
  }

  const target = (!direct && debian && (execEnv?.APACHE_HTTPD ?? env.APACHE_HTTPD)) || literalTarget
  const candidates = direct
    ? [selected]
    : target
      ? [isAbsolute(target) ? target : join(selectedDir, target)]
      : peerDirs.flatMap((dir) => serverNames.map((name) => join(dir, name)))
  let bin = ''
  for (const candidate of new Set(candidates)) {
    try {
      const resolved = await realpath(candidate)
      if (!serverNames.includes(basename(resolved)) || !(await stat(resolved)).isFile()) continue
      await access(resolved, constants.X_OK)
      bin = resolved
      break
    } catch (error) {
      // Missing/non-executable candidates do not prevent checking the same installation's peers.
      if (
        !['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP'].includes(
          (error as NodeJS.ErrnoException).code ?? ''
        )
      ) {
        throw error
      }
    }
  }
  if (!bin) {
    throw new Error(`Cannot find Apache server executable (httpd/apache2) for ${selectedBin}`)
  }

  return { bin, execEnv }
}
