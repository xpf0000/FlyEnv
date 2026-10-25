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

function extensionLayout(lines: string[]) {
  let global = true
  let phpSection = -1
  let globalEnd = 0
  const globalLines: boolean[] = []
  const entries: {
    index: number
    name: string
    active: boolean
    global: boolean
    zend: boolean
    indent: string
    comment: string
  }[] = []
  lines.forEach((line, index) => {
    const section = line.match(/^\s*\[(.+)\]\s*(?:;.*)?$/)
    if (section) {
      global = !/^(?:PATH|HOST)\s*=/i.test(section[1].trim())
      if (/^PHP$/i.test(section[1].trim()) && phpSection < 0) phpSection = index
    }
    globalLines.push(global)
    if (global) globalEnd = index + 1
    const match = line.match(/^(\s*)(;?)\s*(zend_)?extension\s*=\s*(.*)$/i)
    if (!match) return
    const value = match[4].trim()
    const quoteEnd = /^["']/.test(value) ? value.indexOf(value[0], 1) : -1
    const comment = value.indexOf(';', quoteEnd + 1)
    entries.push({
      index,
      name: extensionName(iniValue(value)),
      active: !match[2],
      global,
      zend: !!match[3],
      indent: match[1],
      comment: comment < 0 ? '' : ` ${value.slice(comment)}`
    })
  })
  return { entries, globalLines, phpSection, globalEnd }
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
  const lines = content.trimEnd() ? content.trimEnd().split(/\r?\n/) : []
  const matches = extensionLayout(lines).entries.filter((entry) => entry.name === name)
  const anchor =
    matches.find((entry) => entry.global && entry.active) ?? matches.find((entry) => entry.global)
  const directive = `${zend ? 'zend_extension' : 'extension'}="${dll.replaceAll('\\', '/')}"`
  const matchingLines = new Set(matches.map((entry) => entry.index))
  const updated = lines.flatMap((line, index) => {
    if (!matchingLines.has(index)) return [line]
    return enabled && index === anchor?.index
      ? [`${anchor.indent}${directive}${anchor.comment}`]
      : []
  })
  if (!enabled) {
    let text = updated.join(newline)
    if (name === 'xdebug')
      text = text.replace(/;\[FlyEnv-xdebug-ini-begin\][\s\S]*?;\[FlyEnv-xdebug-ini-end\]/g, '')
    return bom + text.trimEnd() + newline
  }
  if (!anchor) {
    const layout = extensionLayout(updated)
    const lastExtension = layout.entries.filter((entry) => entry.global).at(-1)
    const position = lastExtension
      ? lastExtension.index + 1
      : layout.phpSection >= 0
        ? layout.phpSection + 1
        : layout.globalEnd
    updated.splice(position, 0, directive)
  }
  // Adjust only the extension being enabled; preserve every other extension's order.
  if (zend && (name === 'xdebug' || name === 'opcache')) {
    const entries = extensionLayout(updated).entries.filter(
      (entry) => entry.global && entry.active && entry.zend
    )
    const target = entries.find((entry) => entry.name === name)!
    const peer =
      name === 'xdebug'
        ? entries.filter((entry) => entry.name === 'opcache').at(-1)
        : entries.find((entry) => entry.name === 'xdebug')
    if (peer && (name === 'xdebug' ? target.index < peer.index : target.index > peer.index)) {
      const [line] = updated.splice(target.index, 1)
      // Removing an earlier Xdebug shifts OPcache left, so this index is now after it.
      updated.splice(peer.index, 0, line)
    }
  }
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
    const layout = extensionLayout(updated)
    const globalContent = updated.filter((_line, index) => layout.globalLines[index]).join(newline)
    const missing = Object.entries(defaults)
      .filter(([key]) => !new RegExp(`^\\s*xdebug\\.${key}\\s*=`, 'mi').test(globalContent))
      .map(([key, value]) => `xdebug.${key} = ${value}`)
    if (missing.length) {
      const position =
        layout.entries.find((entry) => entry.global && entry.name === name)!.index + 1
      updated.splice(
        position,
        0,
        ';[FlyEnv-xdebug-ini-begin]',
        ...missing,
        ';[FlyEnv-xdebug-ini-end]'
      )
    }
  }
  return bom + updated.join(newline).trimEnd() + newline
}
