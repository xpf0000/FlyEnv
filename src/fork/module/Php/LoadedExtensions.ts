import { posix, win32 } from 'node:path'
import type { SoftInstalled } from '@shared/app'

export type LoadedPhpExtension = { name: string }
const marker = 'FLYENV_LOADED_EXTENSIONS='

export function phpIniPathScript(): string {
  return "echo 'FLYENV_PHP_INI='.base64_encode(php_ini_loaded_file() ?: '');"
}

export function parsePhpIniPath(stdout: string): string {
  const value = stdout.match(/FLYENV_PHP_INI=([A-Za-z0-9+/=]*)/)?.[1]
  return value ? Buffer.from(value, 'base64').toString('utf8') : ''
}

export function loadedExtensionsCommand(version: SoftInstalled, ini: string, windows: boolean) {
  const path = windows ? win32 : posix
  const bin = version.phpBin || path.join(version.path, windows ? 'php.exe' : 'bin/php')
  const script = `echo '${marker}'.json_encode(array_values(array_unique(array_merge(get_loaded_extensions(),get_loaded_extensions(true)))));`
  return { bin, args: ['-c', ini, '-r', script], cwd: path.dirname(bin) }
}

export function parseLoadedExtensions(stdout: string): LoadedPhpExtension[] {
  const line = stdout.split(/\r?\n/).find((line) => line.startsWith(marker))
  if (!line) throw new Error('The selected PHP did not return its loaded extensions')
  const names: unknown = JSON.parse(line.slice(marker.length))
  if (!Array.isArray(names) || !names.every((name) => typeof name === 'string' && !!name.trim())) {
    throw new Error('The selected PHP returned an invalid loaded-extension list')
  }
  return [...new Set(names.map((name) => name.trim().toLowerCase()))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }))
}
