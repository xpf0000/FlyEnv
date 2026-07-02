export type InstallProxyPlatform = 'windows' | 'macos' | 'linux'

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

function unescapePowerShellSingleQuoted(value: string): string {
  return value.replace(/''/g, "'")
}

function unescapeShellDoubleQuoted(value: string): string {
  return value.replace(/\\(["\\$`])/g, '$1')
}

function normalizeProxyEntries(proxyEnv: Record<string, string | undefined> = {}) {
  return Object.entries(proxyEnv).filter((item): item is [string, string] => {
    return typeof item[1] === 'string'
  })
}

export function buildInstallProxyEnvCommands(
  platform: InstallProxyPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  console.log('buildInstallProxyEnvCommands: ', platform, proxyEnv)
  const commands: string[] = []

  normalizeProxyEntries(proxyEnv).forEach(([key, value]) => {
    if (platform === 'windows') {
      commands.push(`$env:${key}='${escapePowerShellSingleQuoted(value)}'`)
      return
    }
    commands.push(`export ${key}="${escapeShellDoubleQuoted(value)}"`)
  })

  return commands
}

export function buildProxyConfigCommand(
  platform: InstallProxyPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string {
  const entries = normalizeProxyEntries(proxyEnv)
  if (!entries.length) {
    return ''
  }
  if (platform === 'windows') {
    return entries
      .map(([key, value]) => `$env:${key}='${escapePowerShellSingleQuoted(value)}'`)
      .join('; ')
  }
  return `export ${entries
    .map(([key, value]) => `${key}="${escapeShellDoubleQuoted(value)}"`)
    .join(' ')}`
}

function parseProxyConfigValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) {
    return trimmed
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return unescapePowerShellSingleQuoted(trimmed.slice(1, -1))
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return unescapeShellDoubleQuoted(trimmed.slice(1, -1))
  }
  return trimmed
}

export function parseProxyConfigCommand(command?: string): Record<string, string> {
  const proxyEnv: Record<string, string> = {}
  const normalized = `${command ?? ''}`
    .replace(/\r?\n/g, ' ')
    .replace(/;\s*/g, ' ')
    .replace(/\bexport\s+/g, '')
    .replace(/\$env:/g, '')
    .trim()

  if (!normalized) {
    return proxyEnv
  }

  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:\\.|[^"])*"|'(?:''|[^'])*'|[^\s]+)/g
  let match: RegExpExecArray | null = null
  while ((match = pattern.exec(normalized))) {
    const [, key, value] = match
    proxyEnv[key] = parseProxyConfigValue(value)
  }

  return proxyEnv
}
