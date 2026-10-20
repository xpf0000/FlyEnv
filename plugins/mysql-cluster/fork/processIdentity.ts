// Preserve backslashes in Windows paths; only quote delimiters affect token boundaries.
function commandArgs(command: string): string[] {
  const args: string[] = []; let current = '', quote = ''
  for (const char of command) {
    if (quote) { if (char === quote) quote = ''; else current += char }
    else if (char === '"' || char === "'") quote = char
    else if (/\s/.test(char)) { if (current) { args.push(current); current = '' } }
    else current += char
  }
  if (quote) return []
  if (current) args.push(current)
  return args
}
export function hasExactDefaultsFile(command: string, config: string, windows: boolean): boolean {
  const args = commandArgs(command)
  if (!/(?:^|[\\/])mysqld(?:\.exe)?$/i.test(args[0] ?? '')) return false
  const norm = (value: string) => windows ? value.replace(/\\/g, '/').toLowerCase() : value
  const values: string[] = []
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--defaults-file=')) values.push(args[i].slice('--defaults-file='.length))
    else if (args[i] === '--defaults-file' && args[i + 1]) values.push(args[++i])
  }
  return values.length === 1 && norm(values[0]) === norm(config)
}
export function selectInstanceRoots<T extends { PID: string; COMMAND: string }>(list: T[], config: string, windows: boolean): T[] {
  return list.filter(p => /^\d+$/.test(p.PID) && Number(p.PID) > 0 && !!p.COMMAND && hasExactDefaultsFile(p.COMMAND, config, windows))
}
