export type InstallProxyPlatform = 'windows' | 'macos' | 'linux'

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

export function buildInstallProxyEnvCommands(
  platform: InstallProxyPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  console.log('buildInstallProxyEnvCommands: ', platform, proxyEnv)
  const commands: string[] = []

  Object.entries(proxyEnv).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      return
    }
    if (platform === 'windows') {
      commands.push(`$env:${key}='${escapePowerShellSingleQuoted(value)}'`)
      return
    }
    commands.push(`export ${key}="${escapeShellDoubleQuoted(value)}"`)
  })

  return commands
}
