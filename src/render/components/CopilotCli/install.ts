import { buildInstallProxyEnvCommands } from '@shared/installProxyEnv'

export type CopilotCliInstallPlatform = 'windows' | 'macos' | 'linux'

const COPILOT_INSTALL_COMMAND = 'npm install -g @github/copilot'

export function resolveCopilotCliInstallPlatform(platform?: string): CopilotCliInstallPlatform {
  if (platform === 'win32' || platform === 'windows') {
    return 'windows'
  }
  if (platform === 'darwin' || platform === 'macos') {
    return 'macos'
  }
  return 'linux'
}

export function getCopilotCliInstallDisplayCommand(_platform: CopilotCliInstallPlatform): string {
  // GitHub Copilot CLI ships only as an npm package, so the command is the same on every platform.
  return COPILOT_INSTALL_COMMAND
}

export function getCopilotCliInstallCommandLines(
  platform: CopilotCliInstallPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  const commands = buildInstallProxyEnvCommands(platform, proxyEnv)
  commands.push(getCopilotCliInstallDisplayCommand(platform))
  return commands
}
