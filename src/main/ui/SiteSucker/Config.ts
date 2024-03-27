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

class Config implements RunConfig {
  dir: string = ''
  excludeLink: string = ''
  maxImgSize: number = 0
  maxRetryTimes: number = 3
  maxVideoSize: number = 0
  pageLimit: string = ''
  proxy: string = ''
  timeout: number = 6000
  windowCount = 4
  ExcludeHost: string[] = []

  constructor() {}

  update(config: RunConfig) {
    this.ExcludeHost.splice(0)
    this.ExcludeHost.push(...BaseExcludeHost)

    if (config?.excludeLink?.trim()) {
      const excludes = config.excludeLink
        .trim()
        .split('\n')
        .filter((f) => !!f.trim())
        .map((m) => m.trim())
      this.ExcludeHost.push(...excludes)
    }

    if (config?.pageLimit?.trim()) {
      this.pageLimit = config.pageLimit.trim()
    } else {
      this.pageLimit = ''
    }

    if (config?.timeout) {
      this.timeout = config.timeout
    } else {
      this.timeout = 5000
    }

    if (config?.maxImgSize) {
      this.maxImgSize = config.maxImgSize
    } else {
      this.maxImgSize = 0
    }

    if (config?.maxVideoSize) {
      this.maxVideoSize = config.maxVideoSize
    } else {
      this.maxVideoSize = 0
    }
  }
}

export default new Config()
