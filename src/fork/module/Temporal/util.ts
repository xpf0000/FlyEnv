/** Normalize to forward slashes so paths are safe inside yaml double-quoted scalars. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function serverEnvName(version: string): string {
  return `temporal-v${version}`
}

export function buildServerStartArgs(configDir: string, version: string): string[] {
  return ['-c', configDir, '-e', serverEnvName(version), 'start']
}

/**
 * temporal-server standalone config (SQLite dual-store, schema auto-setup).
 * Based on the official guide: https://learn.temporal.io/tutorials/infrastructure/configuring-sqlite-binary/
 */
export function buildServerYaml(dataDir: string): string {
  const dir = normalizePath(dataDir)
  return `log:
  stdout: true
  level: info
persistence:
  defaultStore: sqlite-default
  visibilityStore: sqlite-visibility
  numHistoryShards: 4
  datastores:
    sqlite-default:
      sql:
        pluginName: "sqlite"
        databaseName: "${dir}/default.db"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
    sqlite-visibility:
      sql:
        pluginName: "sqlite"
        databaseName: "${dir}/visibility.db"
        connectAddr: "localhost"
        connectProtocol: "tcp"
        connectAttributes:
          cache: "private"
          setup: true
global:
  membership:
    maxJoinDuration: 30s
    broadcastAddress: "127.0.0.1"
  pprof:
    port: 7936
services:
  frontend:
    rpc:
      grpcPort: 7233
      membershipPort: 6933
      bindOnIP: '127.0.0.1'
      httpPort: 7243
  matching:
    rpc:
      grpcPort: 7235
      membershipPort: 6935
      bindOnLocalHost: true
  history:
    rpc:
      grpcPort: 7234
      membershipPort: 6934
      bindOnLocalHost: true
  worker:
    rpc:
      membershipPort: 6939
clusterMetadata:
  enableGlobalNamespace: false
  failoverVersionIncrement: 10
  masterClusterName: "active"
  currentClusterName: "active"
  clusterInformation:
    active:
      enabled: true
      initialFailoverVersion: 1
      rpcName: "frontend"
      rpcAddress: "127.0.0.1:7233"
      httpAddress: "127.0.0.1:7243"
dcRedirectionPolicy:
  policy: "noop"
`
}

export function buildUiYaml(): string {
  return `temporalGrpcAddress: 127.0.0.1:7233
host: 127.0.0.1
port: 8233
enableUi: true
cors:
  allowOrigins:
    - http://localhost:8233
defaultNamespace: default
`
}
