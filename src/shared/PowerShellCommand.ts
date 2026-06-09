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
