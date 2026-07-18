const dedicatedServiceModules = new Set(['dns', 'ftp-srv'])

export type DedicatedServiceTransition = 'pin' | 'unpin'

export function getDedicatedServiceTransition(
  module: string,
  command: string,
  responseCode: number
): DedicatedServiceTransition | undefined {
  if (responseCode !== 0 || !dedicatedServiceModules.has(module)) return undefined
  if (command === 'startService') return 'pin'
  if (command === 'stopService') return 'unpin'
  return undefined
}
