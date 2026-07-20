export type RunConfig = {
  dir: string
  proxy: string
  excludeLink: string
  pageLimit: string
  timeout: number
  maxImgSize: number
  maxVideoSize: number
  maxRetryTimes: number
  windowCount: number
}

const BaseExcludeHost = [
  'www.google-analytics.com',
  'hm.baidu.com',
  'www.googletagmanager.com',
  'static.hotjar.com',
  'apis.google.com',
  'www.google.com'
]

const numberOrDefault = (value: unknown, fallback: number, minimum: number, integer = false) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isInteger(value))
  ) {
    return fallback
  }
  return value
}

class Config implements RunConfig {
  dir: string = ''
  excludeLink: string = ''
  maxImgSize: number = 0
  maxRetryTimes: number = 3
  maxVideoSize: number = 0
  pageLimit: string = ''
  proxy: string = ''
  timeout: number = 5000
  windowCount = 2
  ExcludeHost: string[] = []

  constructor() {}

  update(config: Partial<RunConfig> = {}) {
    this.dir = typeof config.dir === 'string' ? config.dir : ''
    this.proxy = typeof config.proxy === 'string' ? config.proxy.trim() : ''
    this.excludeLink = typeof config.excludeLink === 'string' ? config.excludeLink.trim() : ''
    this.pageLimit = typeof config.pageLimit === 'string' ? config.pageLimit.trim() : ''
    this.timeout = numberOrDefault(config.timeout, 5000, 1)
    this.maxImgSize = numberOrDefault(config.maxImgSize, 0, 0)
    this.maxVideoSize = numberOrDefault(config.maxVideoSize, 0, 0)
    this.maxRetryTimes = numberOrDefault(config.maxRetryTimes, 3, 0, true)
    this.windowCount = numberOrDefault(config.windowCount, 2, 1, true)

    this.ExcludeHost.splice(0)
    this.ExcludeHost.push(...BaseExcludeHost)

    if (this.excludeLink) {
      const excludes = this.excludeLink
        .split('\n')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      this.ExcludeHost.push(...excludes)
    }
  }
}

export default new Config()
