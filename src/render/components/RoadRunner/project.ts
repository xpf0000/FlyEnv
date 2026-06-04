import { join } from '@/util/path-browserify'

export type RoadRunnerProjectPreset =
  | 'existing'
  | 'php-worker'
  | 'laravel-octane'
  | 'fileserver'
  | 'custom'

export type RoadRunnerProjectExtra = {
  roadRunnerPreset?: RoadRunnerProjectPreset
  roadRunnerConfigPath?: string
  roadRunnerConfigManaged?: boolean
  roadRunnerPHPBin?: string
  roadRunnerPHPVersion?: string
}

export type RoadRunnerProjectItem = RoadRunnerProjectExtra & {
  path: string
  projectPort: number
  runCommand: string
  configPath: Array<{ name: string; path: string }>
}

export const roadRunnerConfigName = 'RoadRunner'
export const roadRunnerConfigFile = '.rr.yaml'

export const roadRunnerConfigCandidates = ['.rr.yaml', '.rr.yml', 'rr.yaml', 'rr.yml', 'rr.json']

const yamlSingleQuote = (value: string) => {
  return `'${value.replace(/'/g, "''")}'`
}

export const shellQuote = (value: string) => {
  if (!value) {
    return value
  }
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value
  }
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
}

export const defaultRoadRunnerConfigPath = (projectPath: string) => {
  return projectPath ? join(projectPath, roadRunnerConfigFile) : ''
}

export const projectRelativePath = (projectPath: string, filePath: string) => {
  if (!projectPath || !filePath) {
    return filePath
  }
  const prefix = `${projectPath.replace(/\/+$/, '')}/`
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
}

export const roadRunnerServeCommand = (projectPath: string, configPath: string) => {
  const config = projectRelativePath(
    projectPath,
    configPath || defaultRoadRunnerConfigPath(projectPath)
  )
  return `rr serve -c ${shellQuote(config || roadRunnerConfigFile)} -w .`
}

export const roadRunnerPHPCommand = (phpBin?: string) => {
  return phpBin ? shellQuote(phpBin) : 'php'
}

export const roadRunnerPHPWorkerCommand = (phpBin?: string) => {
  return `${roadRunnerPHPCommand(phpBin)} -d display_startup_errors=0 -d display_errors=stderr worker.php`
}

export const roadRunnerLaravelOctaneCommand = (port: number, phpBin?: string) => {
  return `${roadRunnerPHPCommand(
    phpBin
  )} artisan octane:start --server=roadrunner --host=127.0.0.1 --port=${port}`
}

export const roadRunnerFileserverConfig = (port: number) => {
  return `version: "3"

fileserver:
  address: 127.0.0.1:${port}
  calculate_etag: true
  weak: false
  stream_request_body: true
  serve:
    - prefix: "/"
      root: "."
      compress: false
      cache_duration: 10
      max_age: 10
      bytes_range: true
`
}

export const roadRunnerPHPWorkerConfig = (port: number, phpBin?: string) => {
  return `version: "3"

server:
  command: ${yamlSingleQuote(roadRunnerPHPWorkerCommand(phpBin))}
  relay: pipes

http:
  address: 127.0.0.1:${port}
  pool:
    num_workers: 2
    max_jobs: 64
`
}

export const updateRoadRunnerConfigPort = (content: string, port: number) => {
  return content.replace(/^(\s*address:\s*(?:"|')?(?:[^\s:"']*:)?)(\d+)((?:"|')?)/m, `$1${port}$3`)
}

export const extractRoadRunnerConfigPort = (content: string) => {
  const match = /^\s*address:\s*(?:"|')?(?:[^\s:"']*:)?(\d+)(?:"|')?(?:\s+#.*)?$/m.exec(content)
  if (!match?.[1]) {
    return undefined
  }
  const port = Number.parseInt(match[1], 10)
  return Number.isInteger(port) && port > 0 ? port : undefined
}

export const updateRoadRunnerConfigPHPCommand = (content: string, phpBin?: string) => {
  return content.replace(
    /^(\s*command:\s*).+$/m,
    `$1${yamlSingleQuote(roadRunnerPHPWorkerCommand(phpBin))}`
  )
}

export const roadRunnerPrimaryConfigPath = (item: Partial<RoadRunnerProjectItem>) => {
  const configPath =
    item.roadRunnerConfigPath ||
    item.configPath?.find((c) => c.name === roadRunnerConfigName)?.path ||
    item.configPath?.find((c) => roadRunnerConfigCandidates.some((name) => c.path.endsWith(name)))
      ?.path
  if (configPath) {
    return configPath
  }
  if (item.roadRunnerPreset && ['custom', 'laravel-octane'].includes(item.roadRunnerPreset)) {
    return ''
  }
  return item.path ? defaultRoadRunnerConfigPath(item.path) : ''
}

export const syncRoadRunnerConfigPath = (item: RoadRunnerProjectItem) => {
  const configPath = roadRunnerPrimaryConfigPath(item)
  item.roadRunnerConfigPath = configPath
  if (!configPath) {
    return
  }
  if (!item.configPath.some((c) => c.path === configPath)) {
    item.configPath.unshift({
      name: roadRunnerConfigName,
      path: configPath
    })
  }
}

export const inferRoadRunnerPreset = (
  item: Partial<RoadRunnerProjectItem>
): RoadRunnerProjectPreset => {
  if (item.roadRunnerPreset) {
    return item.roadRunnerPreset
  }
  const command = item.runCommand || ''
  if (command.includes('octane:start')) {
    return 'laravel-octane'
  }
  if (command.includes('rr serve')) {
    return 'existing'
  }
  return 'php-worker'
}
