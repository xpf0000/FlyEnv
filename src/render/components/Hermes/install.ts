import { buildInstallProxyEnvCommands } from '@shared/installProxyEnv'

export type HermesInstallPlatform = 'windows' | 'macos' | 'linux'

const HERMES_INSTALL_COMMANDS: Record<HermesInstallPlatform, string> = {
  windows:
    'powershell -ExecutionPolicy ByPass -c "irm https://hermes-agent.nousresearch.com/install.ps1 | iex"',
  macos: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
  linux: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
}

export function resolveHermesInstallPlatform(platform?: string): HermesInstallPlatform {
  if (platform === 'win32' || platform === 'windows') {
    return 'windows'
  }
  if (platform === 'darwin' || platform === 'macos') {
    return 'macos'
  }
  return 'linux'
}

export function getHermesInstallDisplayCommand(platform: HermesInstallPlatform): string {
  return HERMES_INSTALL_COMMANDS[platform]
}

export function getHermesInstallCommandLines(
  platform: HermesInstallPlatform,
  proxyEnv: Record<string, string | undefined> = {}
): string[] {
  const commands = buildInstallProxyEnvCommands(platform, proxyEnv)
  commands.push(getHermesInstallDisplayCommand(platform))
  return commands
}
