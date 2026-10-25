import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { SoftInstalled } from '@shared/app'
import type { PItem } from '@shared/Process'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'

/** Windows CMD launches ./numa.exe; the actual image and config identify the service instance. */
export function windowsNumaRootMatcher(version: SoftInstalled, configFile: string) {
  const paths = new Map<string, string>()
  const canonical = (path: string) => {
    const key = resolve(path).replace(/\\/g, '/').toLowerCase()
    const cached = paths.get(key)
    if (cached !== undefined) return cached
    let actual = key
    try {
      actual = realpathSync(path).replace(/\\/g, '/').toLowerCase()
    } catch {
      // A removed executable/config can still have a live process; retain exact path comparison.
    }
    paths.set(key, actual)
    return actual
  }
  const executable = canonical(version.bin)
  const config = canonical(configFile)
  return (process: PItem) => {
    if (!isReadableServiceStopRoot(process, true)) return false
    if (canonical(process.EXECUTABLE!) !== executable) return false
    const args = (process.COMMAND.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((arg) =>
      arg.replace(/"([^"]*)"/g, '$1')
    )
    // The normal server invocation is `numa <config>`; install/service/relay commands are excluded.
    return args.length === 2 && isAbsolute(args[1]) && canonical(args[1]) === config
  }
}
