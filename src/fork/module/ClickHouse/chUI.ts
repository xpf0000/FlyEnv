export const CH_UI_PORT = 3488
export const CH_UI_CONNECTION_NAME = 'FlyEnv ClickHouse'

export function chUIAssetName(platform: NodeJS.Platform, arch: string): string {
  if (platform !== 'darwin' && platform !== 'linux') {
    throw new Error(`CH-UI is not supported on ${platform}`)
  }
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64'
  return `ch-ui-${platform}-${cpu}`
}

export function chUIReleaseURL(platform: NodeJS.Platform, arch: string): string {
  return `https://github.com/caioricciuti/ch-ui/releases/latest/download/${chUIAssetName(platform, arch)}`
}

export function clickHouseHttpPort(xml: string): number {
  const match = xml.match(/<http_port>\s*(\d+)\s*<\/http_port>/)
  const port = Number(match?.[1])
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8123
}

export function chUIConfigContent(databasePath: string, clickHouseURL: string): string {
  return `port: ${CH_UI_PORT}
app_url: "http://127.0.0.1:${CH_UI_PORT}"
database_path: ${JSON.stringify(databasePath)}
clickhouse_url: ${JSON.stringify(clickHouseURL)}
connection_name: ${JSON.stringify(CH_UI_CONNECTION_NAME)}
`
}
