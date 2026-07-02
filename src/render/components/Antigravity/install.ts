import { buildInstallProxyEnvCommands } from '@shared/installProxyEnv'

export type AntigravityInstallPlatform = 'windows' | 'macos' | 'linux'

const ANTIGRAVITY_INSTALL_COMMANDS: Record<AntigravityInstallPlatform, string> = {
  windows:
    'powershell -ExecutionPolicy ByPass -c "irm https://antigravity.google/cli/install.ps1 | iex"',
  macos: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
  linux: 'curl -fsSL https://antigravity.google/cli/install.sh | bash'
}

export function resolveAntigravityInstallPlatform(platform?: string): AntigravityInstallPlatform {
  if (platform === 'win32' || platform === 'windows') {
    return 'windows'
  }
  if (platform === 'darwin' || platform === 'macos') {
    return 'macos'
  }
  return 'linux'
}

export function getAntigravityInstallDisplayCommand(platform: AntigravityInstallPlatform): string {
  return ANTIGRAVITY_INSTALL_COMMANDS[platform]
}

export function getAntigravityInstallCommandLines(
  platform: AntigravityInstallPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  const commands = buildInstallProxyEnvCommands(platform, proxyEnv)
  commands.push(getAntigravityInstallDisplayCommand(platform))
  return commands
}
