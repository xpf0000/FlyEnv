export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function powerShellInlineArgs(script: string): string[] {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-NonInteractive',
    '-EncodedCommand',
    encodePowerShellCommand(script)
  ]
}

function quoteCmdArg(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}

export function buildPowerShellEncodedCommand(
  script: string,
  powershellPath = 'powershell.exe'
): string {
  return [powershellPath, ...powerShellInlineArgs(script)].map(quoteCmdArg).join(' ')
}
