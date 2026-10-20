const normalize = (value: string, windows: boolean) =>
  windows ? value.replace(/\\/g, '/').toLowerCase() : value

export function hasExactDefaultsFile(command: string, config: string, windows: boolean): boolean {
  const program = /^(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command.trim())
  if (!/(?:^|[\\/])mysqld(?:\.exe)?$/i.test(program?.[1] ?? program?.[2] ?? program?.[3] ?? ''))
    return false
  // ps exposes unquoted argv containing spaces; compare the known complete value, not whitespace tokens.
  const flags = [...command.matchAll(/(?:^|\s)(["']?)--defaults-file(?:=|\s+)/g)]
  if (flags.length !== 1) return false
  const flag = flags[0]
  let value = command.slice(flag.index! + flag[0].length)
  const quote = /^["']/.test(value) ? value[0] : flag[1]
  if (/^["']/.test(value)) value = value.slice(1)
  const wanted = normalize(config, windows),
    actual = normalize(value, windows)
  if (!actual.startsWith(wanted)) return false
  let suffix = actual.slice(wanted.length)
  if (quote) {
    if (!suffix.startsWith(quote)) return false
    suffix = suffix.slice(1)
  }
  if (suffix && !/^\s/.test(suffix)) return false
  suffix = suffix.trim()
  return !suffix || suffix.startsWith('--')
}
export function selectInstanceRoots<T extends { PID: string; COMMAND: string }>(
  list: T[],
  config: string,
  windows: boolean,
  executables?: string | string[]
): T[] {
  const candidates = typeof executables === 'string' ? [executables] : executables
  return list.filter((p) => {
    if (!/^[1-9]\d*$/.test(p.PID) || !p.COMMAND) return false
    let command = p.COMMAND.trim()
    if (candidates) {
      let rest: string | undefined
      for (const executable of candidates) {
        for (const prefix of [executable, `"${executable}"`, `'${executable}'`]) {
          if (
            normalize(command, windows).startsWith(normalize(prefix, windows)) &&
            /^\s/.test(command.slice(prefix.length))
          ) {
            rest = command.slice(prefix.length)
            break
          }
        }
        if (rest !== undefined) break
      }
      if (rest === undefined) return false
      command = 'mysqld' + rest
    }
    return hasExactDefaultsFile(command, config, windows)
  })
}
