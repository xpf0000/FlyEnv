export const ntpModuleId = 'ntp-server'
export const serviceLogName = 'ntp.log'
export const errorLogName = 'ntp-start-error.log'
export const configName = 'config.json'
export const maxOffsetSeconds = 2_147_483_647

export interface NtpSettings {
  mode: 'real' | 'offset' | 'frozen'
  offsetSeconds: number
  frozenTime: string
  host: string
  port: number
  logRequests: boolean
  upstreamEnabled: boolean
  upstreamServers: string
}

export const defaultSettings = (): NtpSettings => ({
  mode: 'real',
  offsetSeconds: 0,
  frozenTime: '',
  host: '0.0.0.0',
  port: 12300,
  logRequests: true,
  upstreamEnabled: true,
  upstreamServers: ['time.cloudflare.com', 'time.google.com', 'pool.ntp.org'].join('\n')
})

export function parseConfig(content: string): NtpConfig {
  const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ''))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalidConfig')
  }
  return parsed as NtpConfig
}

export interface NtpConfig {
  [key: string]: unknown
  clock?: { mode?: NtpSettings['mode']; offsetSeconds?: number; frozenTime?: string }
  ntp?: { listenAddress?: string; logRequests?: boolean; [key: string]: unknown }
  upstream?: { enabled?: boolean; servers?: string[]; [key: string]: unknown }
  api?: { enabled?: boolean; [key: string]: unknown }
}

export interface ConfigSnapshot {
  settings: NtpSettings
  path: string
  exists: boolean
}

export function settingsFromConfig(config: NtpConfig): NtpSettings {
  const defaults = defaultSettings()
  const address = config.ntp?.listenAddress ?? ''
  const separator = address.lastIndexOf(':')
  return {
    mode: config.clock?.mode ?? defaults.mode,
    offsetSeconds: config.clock?.offsetSeconds ?? defaults.offsetSeconds,
    frozenTime: config.clock?.frozenTime ?? defaults.frozenTime,
    host:
      separator < 0
        ? defaults.host
        : address.slice(0, separator).replace(/^\[(.*)\]$/, '$1') || '::',
    port: separator < 0 ? defaults.port : Number(address.slice(separator + 1)),
    logRequests: config.ntp?.logRequests ?? defaults.logRequests,
    upstreamEnabled: config.upstream?.enabled ?? defaults.upstreamEnabled,
    upstreamServers: config.upstream?.servers?.join('\n') ?? defaults.upstreamServers
  }
}

export function parseFrozenTime(value: unknown): Date | undefined {
  if (typeof value !== 'string') return
  const time = value.trim()
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      time
    )
  if (!match) return
  const date = new Date(time)
  const calendarDay = new Date(`${match[1]}T00:00:00Z`)
  if (
    !Number.isFinite(date.valueOf()) ||
    !Number.isFinite(calendarDay.valueOf()) ||
    !calendarDay.toISOString().startsWith(match[1])
  ) {
    return
  }
  return date
}

export function updateConfig(config: NtpConfig, settings: NtpSettings): NtpConfig {
  const host = settings.host.trim()
  const ipv6 = host.indexOf(':') !== host.lastIndexOf(':')
  if (!host || !/^[\w.:%-]+$/.test(host) || (!ipv6 && host.includes(':'))) {
    throw new Error('invalidHost')
  }
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
    throw new Error('invalidPort')
  }

  const mode = settings.mode
  if (mode !== 'real' && mode !== 'offset' && mode !== 'frozen') {
    throw new Error('invalidMode')
  }
  const clock: NonNullable<NtpConfig['clock']> = { ...config.clock, mode }
  delete clock.offsetSeconds
  delete clock.frozenTime
  if (mode === 'offset') {
    const offset = settings.offsetSeconds
    if (!Number.isInteger(offset) || Math.abs(offset) > maxOffsetSeconds) {
      throw new Error('invalidOffset')
    }
    clock.offsetSeconds = offset
  }
  if (mode === 'frozen') {
    const date = parseFrozenTime(settings.frozenTime)
    if (!date) throw new Error('invalidFrozenTime')
    clock.frozenTime = date.toISOString()
  }

  const servers = settings.upstreamServers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (mode === 'real' && settings.upstreamEnabled && !servers.length) {
    throw new Error('invalidUpstreamServers')
  }
  return {
    ...config,
    clock,
    ntp: {
      ...config.ntp,
      listenAddress: `${ipv6 ? `[${host}]` : host}:${settings.port}`,
      logRequests: settings.logRequests
    },
    upstream: { ...config.upstream, enabled: settings.upstreamEnabled, servers },
    api: { enabled: false, ...config.api }
  }
}
