export type CodexInstallPlatform = 'windows' | 'macos' | 'linux'

const CODEX_INSTALL_COMMANDS: Record<CodexInstallPlatform, string> = {
  windows:
    'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
  macos: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  linux: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
}

export function resolveCodexInstallPlatform(platform?: string): CodexInstallPlatform {
  if (platform === 'win32' || platform === 'windows') {
    return 'windows'
  }
  if (platform === 'darwin' || platform === 'macos') {
    return 'macos'
  }
  return 'linux'
}

export function getCodexInstallDisplayCommand(platform: CodexInstallPlatform): string {
  return CODEX_INSTALL_COMMANDS[platform]
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, '\\$1')
}

export function getCodexInstallCommandLines(
  platform: CodexInstallPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
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

  commands.push(getCodexInstallDisplayCommand(platform))
  return commands
}
