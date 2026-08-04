const validPort = (value: number) => Number.isInteger(value) && value > 0 && value <= 65535

export function unquoteConfigValue(value: string): string {
  const trimmed = value.trim()
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  return trimmed.length >= 2 && (first === '"' || first === "'") && first === last
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

export function readConfigValue(content: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = content.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, 'm'))
  return match ? unquoteConfigValue(match[1]) : ''
}

export function parsePort(value: string, fallback: number): number {
  const parsed = Number(unquoteConfigValue(value))
  return validPort(parsed) ? parsed : fallback
}

export function normalizeListenAddress(value: string, fallback = '127.0.0.1:9001'): string {
  const normalized = unquoteConfigValue(value)
  if (/^\d+$/.test(normalized) && validPort(Number(normalized))) return `127.0.0.1:${normalized}`
  const match = normalized.match(/^(?:[^:\s]+|\[[^\]]+\]):(\d+)$/) ?? normalized.match(/^:(\d+)$/)
  if (match && validPort(Number(match[1]))) return normalized
  return fallback
}

export function httpUrlFromAddress(value: string, fallback: string, path = '/'): string {
  const address = normalizeListenAddress(value, fallback)
  return `http://${address.startsWith(':') ? `127.0.0.1${address}` : address}${path}`
}
