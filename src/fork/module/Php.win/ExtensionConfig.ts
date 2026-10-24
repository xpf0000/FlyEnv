import { win32 } from 'node:path'

export function extensionName(value: string): string {
  return win32
    .basename(value.trim().replaceAll('/', '\\'))
    .toLowerCase()
    .replace(/^zend /, '')
    .replace(/^php_/, '')
    .replace(/\.dll$/, '')
    .replace(/-\d[\w.-]*$/, '')
    .replace(/_\d{2,3}_(?:nts|ts)_(?:x64|x86)$/, '')
}

export function extensionIsLoaded(loaded: string[], name: string, warnings = ''): boolean {
  return (
    loaded.some((item) => extensionName(item) === name) &&
    !warnings
      .split(/\r?\n/)
      .some(
        (line) =>
          /already (?:been )?loaded/i.test(line) && new RegExp(`\\b${name}\\b`, 'i').test(line)
      )
  )
}

export function iniValue(value: string): string {
  const text = value.trim()
  if (text.startsWith('"') || text.startsWith("'")) {
    const end = text.indexOf(text[0], 1)
    return end < 0 ? '' : text.slice(1, end)
  }
  return text.split(';')[0].trim()
}

export function configuredExtensions(content: string, loaded: string[]) {
  const active = new Set(loaded.map(extensionName))
  const entries = new Map<string, { name: string; zend: boolean; loaded: boolean }>()
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(zend_)?extension\s*=\s*(.*)$/i)
    if (!match) continue
    const name = extensionName(iniValue(match[2]))
    if (/^[a-z][a-z0-9_]*$/.test(name))
      entries.set(name, { name, zend: !!match[1], loaded: active.has(name) })
  }
  return [...entries.values()]
}

export function extensionDirectory(content: string, bin: string): string {
  let directory = 'ext'
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*extension_dir\s*=\s*(.*)$/i)
    if (match) directory = iniValue(match[1]) || directory
  }
  return win32.resolve(win32.dirname(bin), directory)
}

export function updateExtensionIni(
  content: string,
  name: string,
  enabled: boolean,
  zend = false,
  dll = `php_${name}.dll`,
  xdebugDirectory = ''
): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid PHP extension name')
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
  if (bom) content = content.slice(1)
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  let updated = content
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*;?\s*(?:zend_)?extension\s*=\s*(.*)$/i)
      return !match || extensionName(iniValue(match[1])) !== name
    })
    .join(newline)
    .trimEnd()
  if (!enabled) {
    if (name === 'xdebug')
      updated = updated.replace(
        /;\[FlyEnv-xdebug-ini-begin\][\s\S]*?;\[FlyEnv-xdebug-ini-end\]/g,
        ''
      )
    return bom + updated.trimEnd() + newline
  }
  const directive = `${zend ? 'zend_extension' : 'extension'}="${dll.replaceAll('\\', '/')}"`
  // Place startup directives before any per-directory [PATH=...] or [HOST=...] section.
  if (name === 'xdebug') {
    const defaults: Record<string, string> = {
      idekey: '"PHPSTORM"',
      client_host: 'localhost',
      client_port: '9003',
      mode: 'debug',
      profiler_append: '0',
      profiler_output_name: 'cachegrind.out.%p',
      start_with_request: 'yes',
      trigger_value: 'StartProfileForMe',
      output_dir: `"${xdebugDirectory.replaceAll('\\', '/')}"`
    }
    const missing = Object.entries(defaults)
      .filter(([key]) => !new RegExp(`^\\s*xdebug\\.${key}\\s*=`, 'mi').test(updated))
      .map(([key, value]) => `xdebug.${key} = ${value}`)
    if (missing.length)
      updated = [
        ';[FlyEnv-xdebug-ini-begin]',
        ...missing,
        ';[FlyEnv-xdebug-ini-end]',
        updated
      ].join(newline)
  }
  return bom + directive + newline + updated + newline
}
