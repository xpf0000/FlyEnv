import { stat, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { SoftInstalled } from '@shared/app'
import type { RuntimeCapabilities, FlagCapability, DeviceInfo } from '../shared/launchOptions'
export const parseRuntimeHelp = (help: string): RuntimeCapabilities => {
  const byAlias: Record<string, FlagCapability> = {}
  const lines = help.split(/\r?\n/)
  // llama.cpp aligns declarations at the left margin and indents descriptions.
  // Wrapped descriptions can themselves start with an option reference.
  const declarationIndent = lines.reduce(
    (indent, line) =>
      /^[ \t]*-{1,2}[A-Za-z]/.test(line) ? Math.min(indent, line.search(/\S/)) : indent,
    Infinity
  )
  let previous: string[] = []
  let continuation = false
  const valuesOf = (value: string) =>
    value
      .split(/[,|]/)
      .map((x) => x.trim())
      .filter(Boolean)
  for (const line of lines) {
    const match =
      line.search(/\S/) === declarationIndent
        ? line.match(
            /^\s*((?:-{1,2}[A-Za-z][\w-]*(?:,\s*|\s+(?=-))?)+)(?=\s|$)(?:\s+(\[[^\]]+\]|<[^>]+>|\{[^}]+\}|[A-Z][A-Z0-9_-]*|(?:[a-z][a-z0-9_-]*,)+[a-z][a-z0-9_-]*))?/
          )
        : null
    if (!match) {
      for (const alias of previous) byAlias[alias].helpLine += '\n' + line
      const bullet = line.match(/^\s+- ([a-z][a-z0-9_+-]*):/i)?.[1]
      if (bullet)
        for (const alias of previous)
          byAlias[alias].values = [...(byAlias[alias].values ?? []), bullet]
      if (continuation && /^\s*[a-z0-9_]+(?:,|\s*$)/.test(line)) {
        for (const alias of previous) byAlias[alias].values!.push(...valuesOf(line))
        continuation = line.trimEnd().endsWith(',')
        continue
      }
      const values = line
        .match(/allowed values:\s*([^()]+)/i)?.[1]
        ?.split(/[,|]/)
        .map((x) => x.trim())
        .filter(Boolean)
      if (values) {
        for (const alias of previous) byAlias[alias].values = values
        continuation = line.trimEnd().endsWith(',')
      }
      continue
    }
    const aliases: string[] = Array.from(match[1].match(/-{1,2}[A-Za-z][\w-]*/g) ?? [])
    const long = aliases.find((x) => x.startsWith('--')) ?? aliases[0]
    if (!long) continue
    continuation = false
    const value = match[2]
    const second = !!value && /^\s+[A-Z][A-Z0-9_-]*\s{2,}/.test(line.slice(match[0].length))
    const values =
      value && !value.startsWith('<') && /[|,]/.test(value)
        ? value
            .replace(/[[\]{}<>]/g, '')
            .split(/[|,]/)
            .map((x) => x.trim())
        : undefined
    const name = long.replace(/^-+/, '').replace(/^no-/, '')
    previous = aliases
    for (const alias of aliases)
      byAlias[alias] = {
        helpLine: line,
        canonicalName: name,
        aliases,
        arity: value ? (second ? 2 : value.startsWith('[') ? 'optional' : 1) : 0,
        values: line.match(/allowed values:\s*([^()]+)/i)?.[1]
          ? valuesOf(line.match(/allowed values:\s*([^()]+)/i)![1])
          : values,
        negative: alias.startsWith('--no-') || /^-(?:nkvo|nocb|no-kvu)$/.test(alias)
      }
  }
  return { status: byAlias['--model'] ? 'known' : 'unknown', byAlias, help }
}
export const probeRuntime = (bin: string, args: string[], timeoutMs = 60000): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = '',
      done = false
    const finish = (error?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(out)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(Error('Runtime probe timed out'))
    }, timeoutMs)
    const append = (b: Buffer) => {
      out += b.toString()
      if (out.length > 2000000) {
        child.kill()
        finish(Error('Runtime probe output limit exceeded'))
      }
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', finish)
    child.once('close', (code) =>
      finish(
        code === 0 ? undefined : Error('Runtime probe failed: ' + code + ' ' + out.slice(-2000))
      )
    )
  })
const cache = new Map<string, Promise<RuntimeCapabilities>>()
const devices = new Map<string, { at: number; value: Promise<DeviceInfo[]> }>()
const binaryKey = async (runtime: SoftInstalled) => {
  const bin = await realpath(runtime.bin),
    s = await stat(bin)
  return JSON.stringify([bin, runtime.version, runtime.flag, s.size, s.mtimeMs])
}
export const readRuntimeCapabilities = async (runtime: SoftInstalled) => {
  const key = await binaryKey(runtime)
  let result = cache.get(key)
  if (!result) {
    result = probeRuntime(runtime.bin, ['--help']).then(parseRuntimeHelp)
    cache.set(key, result)
    result.catch(() => cache.delete(key))
  }
  return result
}
export const readRuntimeDevices = async (runtime: SoftInstalled, refresh = false) => {
  const key = await binaryKey(runtime),
    old = devices.get(key)
  if (!refresh && old && Date.now() - old.at < 30000) return old.value
  const value = probeRuntime(runtime.bin, ['--list-devices'], 10000).then((text) =>
    text.split(/\r?\n/).flatMap((line) => {
      const m = line.match(/^\s*([A-Za-z]+\d+):\s*(.*)$/)
      return m ? [{ name: m[1], description: m[2] }] : []
    })
  )
  devices.set(key, { at: Date.now(), value })
  value.catch(() => devices.delete(key))
  return value
}
