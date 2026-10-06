import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

// Homebrew layout: <path>/bin/opensearch is a wrapper that sets JAVA_HOME and
// execs <path>/libexec/bin/opensearch; the real home is <path>/libexec and its
// config is a symlink to /opt/homebrew/etc/opensearch.
export const resolveHome = (path: string): string => {
  if (existsSync(join(path, 'libexec/bin/opensearch'))) {
    return join(path, 'libexec')
  }
  return path
}

export const resolveConfDir = (path: string): string => {
  return join(resolveHome(path), 'config')
}

const ymlScalar = (content: string, key: string): string => {
  const escaped = key.replace(/\./g, '\\.')
  const match = content.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'm'))
  const value = match?.[1] ?? ''
  return value.replace(/^["']|["']$/g, '').trim()
}

const readMainYml = (path: string): string => {
  try {
    return readFileSync(join(resolveConfDir(path), 'opensearch.yml'), 'utf-8')
  } catch {
    return ''
  }
}

export const resolveLogsDir = (path: string): string => {
  return ymlScalar(readMainYml(path), 'path.logs') || join(resolveHome(path), 'logs')
}

export const resolveClusterName = (path: string): string => {
  return ymlScalar(readMainYml(path), 'cluster.name') || 'opensearch'
}
