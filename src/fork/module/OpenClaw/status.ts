export interface GatewayStatus {
  isInstalled: boolean
  isRunning: boolean
  isStopped: boolean
  dashboard: string
}

export function parseGatewayStatus(status: string): GatewayStatus {
  const isRunning = status.includes('RPC probe: ok') || status.includes('Connectivity probe: ok')
  const isStopped =
    status.includes('RPC probe: failed') || status.includes('Connectivity probe: failed')
  const isInstalled =
    (!status.includes('Service: Scheduled Task (missing)') &&
      !status.includes('Service: systemd (disabled)')) ||
    isRunning
  const dashboard =
    status
      .split('\n')
      .find((line) => line.includes('Dashboard:'))
      ?.replace('Dashboard:', '')
      ?.trim() ?? ''

  return { isInstalled, isRunning, isStopped, dashboard }
}
