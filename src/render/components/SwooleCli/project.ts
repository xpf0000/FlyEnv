import { join } from '@/util/path-browserify'

export type SwooleCliProjectPreset =
  | 'native'
  | 'hyperf'
  | 'easyswoole'
  | 'laravel-octane'
  | 'php-script'
  | 'custom'

export type SwooleCliProjectExtra = {
  swooleCliPreset?: SwooleCliProjectPreset
  swooleCliScriptPath?: string
}

export type SwooleCliProjectItem = SwooleCliProjectExtra & {
  path: string
  projectPort: number
  runCommand: string
  commandType: 'command' | 'file'
  configPath: Array<{ name: string; path: string }>
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

export const projectRelativePath = (projectPath: string, filePath: string) => {
  if (!projectPath || !filePath) {
    return filePath
  }
  const prefix = `${projectPath.replace(/\/+$/, '')}/`
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
}

export const defaultSwooleCliScriptPath = (projectPath: string) => {
  return projectPath ? join(projectPath, 'server.php') : ''
}

export const swooleCliScriptCommand = (projectPath: string, scriptPath: string) => {
  const script = projectRelativePath(
    projectPath,
    scriptPath || defaultSwooleCliScriptPath(projectPath)
  )
  return `swoole-cli ${shellQuote(script || 'server.php')}`
}

export const swooleCliLaravelOctaneCommand = (port: number) => {
  return `swoole-cli artisan octane:start --server=swoole --host=127.0.0.1 --port=${port}`
}

export const swooleCliPresetCommand = (
  preset: SwooleCliProjectPreset,
  projectPath: string,
  port: number,
  scriptPath?: string
) => {
  switch (preset) {
    case 'hyperf':
      return 'swoole-cli bin/hyperf.php start'
    case 'easyswoole':
      return 'swoole-cli easyswoole server start'
    case 'laravel-octane':
      return swooleCliLaravelOctaneCommand(port || 3000)
    case 'native':
      return `${swooleCliScriptCommand(
        projectPath,
        scriptPath || defaultSwooleCliScriptPath(projectPath)
      )} ${port || 3000}`
    case 'php-script':
      return swooleCliScriptCommand(
        projectPath,
        scriptPath || defaultSwooleCliScriptPath(projectPath)
      )
    case 'custom':
      return ''
  }
}

export const inferSwooleCliPreset = (
  item: Partial<SwooleCliProjectItem>
): SwooleCliProjectPreset => {
  if (item.swooleCliPreset) {
    return item.swooleCliPreset
  }
  const command = item.runCommand || ''
  if (command.includes('bin/hyperf.php')) {
    return 'hyperf'
  }
  if (command.includes('easyswoole')) {
    return 'easyswoole'
  }
  if (command.includes('octane:start')) {
    return 'laravel-octane'
  }
  if (command.includes('swoole-cli')) {
    return 'php-script'
  }
  return 'native'
}

export const swooleCliConfigName = 'Swoole CLI'

export const swooleCliKnownConfigPaths = (
  preset: SwooleCliProjectPreset,
  projectPath: string,
  scriptPath?: string
) => {
  if (!projectPath) {
    return []
  }
  const script = scriptPath || defaultSwooleCliScriptPath(projectPath)
  switch (preset) {
    case 'hyperf':
      return [
        { name: 'Hyperf Server', path: join(projectPath, 'config/autoload/server.php') },
        { name: 'Hyperf Routes', path: join(projectPath, 'config/routes.php') }
      ]
    case 'easyswoole':
      return [
        { name: 'EasySwoole Dev', path: join(projectPath, 'dev.php') },
        { name: 'EasySwoole Produce', path: join(projectPath, 'produce.php') }
      ]
    case 'laravel-octane':
      return [{ name: 'Laravel Octane', path: join(projectPath, 'config/octane.php') }]
    case 'native':
    case 'php-script':
      return script ? [{ name: swooleCliConfigName, path: script }] : []
    case 'custom':
      return []
  }
}
