/**
 * Parse a key=value conf file into `temporal server start-dev` CLI flags.
 * Every valid line `key=value` becomes `--key=value` (pflag bool flags accept
 * the `=true/false` form, so no special-casing is needed).
 */
export function parseConfToArgs(content: string): string[] {
  const args: string[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!key || !value) {
      continue
    }
    args.push(`--${key}=${value}`)
  }
  return args
}

export function buildDefaultConf(dbFile: string): string {
  const lines = [
    '# Temporal CLI dev server config. Each line maps to a flag of `temporal server start-dev`.',
    '# See: https://docs.temporal.io/cli/server#start-dev',
    'ip=127.0.0.1',
    'port=7233',
    'http-port=7243',
    'ui-ip=127.0.0.1',
    'ui-port=8233',
    `db-filename=${dbFile}`,
    'log-level=info',
    'log-format=text',
    'headless=false'
  ]
  return lines.join('\n') + '\n'
}
