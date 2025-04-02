import http from 'http'
import https from 'https'
import dns from 'dns'
import { performance } from 'perf_hooks'
import { URL } from 'url'
import type { IncomingMessage, RequestOptions } from 'http'
import type { AgentOptions } from 'https'
import { I18nT } from '@lang/index'

interface TimingResults {
  dnsLookup: number
  tcpConnect: number
  tlsHandshake?: number
  request: number
  ttfb: number
  download: number
  total: number
  dataLength: number
  httpVersion: string
  statusCode?: number
  throughput: number
  usingProxy: boolean
  firstByte?: number
}

interface RequestTimerOptions {
  timeout?: number
  retries?: number
  followRedirects?: boolean
  maxRedirects?: number
  keepAlive?: boolean
  proxy?: string
  strictSSL?: boolean
}

export default class RequestTimer {
  private timeout: number
  private retries: number
  private followRedirects: boolean
  private maxRedirects: number
  private dnsCache: Map<string, boolean>
  private keepAlive: boolean
  private proxy?: string
  private strictSSL: boolean
  private redirectCount = 0

  constructor(options: RequestTimerOptions = {}) {
    this.timeout = options.timeout || 5000
    this.retries = options.retries || 0
    this.followRedirects = options.followRedirects || false
    this.maxRedirects = options.maxRedirects || 5
    this.dnsCache = new Map()
    this.keepAlive = options.keepAlive !== false
    this.proxy = options.proxy
    this.strictSSL = options.strictSSL !== false
  }

  public async measure(
    urlStr: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    body?: string
  ): Promise<TimingResults> {
    if (!urlStr.startsWith('http')) {
      throw new Error('URL must start with http:// or https://')
    }

    let lastError: Error | undefined
    let attempt = 0

    while (attempt <= this.retries) {
      try {
        this.redirectCount = 0
        return await this._measureAttempt(urlStr, method, headers, body)
      } catch (error) {
        lastError = error as Error
        attempt++
        if (attempt <= this.retries) {
          console.log(`Request failed, retrying (${attempt}/${this.retries})...`)
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)))
        }
      }
    }

    throw lastError || new Error(`Request measurement failed`)
  }

  private async _measureAttempt(
    urlStr: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<TimingResults> {
    if (this.redirectCount > this.maxRedirects) {
      throw new Error(`Maximum redirects reached (${this.maxRedirects})`)
    }

    const urlObj = new URL(urlStr)
    let protocol = urlObj.protocol === 'https:' ? https : http
    const isHttps = urlObj.protocol === 'https:'

    const timings = {
      dnsStart: performance.now(),
      dnsEnd: 0,
      tcpStart: 0,
      tcpEnd: 0,
      tlsStart: 0,
      tlsEnd: 0,
      requestStart: 0,
      responseStart: 0,
      firstByte: 0,
      downloadStart: 0,
      end: 0,
      dataLength: 0
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout (${this.timeout}ms)`))
      }, this.timeout)
    })

    // DNS resolution (skipped when using proxy)
    if (!this.proxy) {
      try {
        if (this.dnsCache.has(urlObj.hostname)) {
          timings.dnsEnd = performance.now()
        } else {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              dns.resolve(urlObj.hostname, (err) => {
                timings.dnsEnd = performance.now()
                if (err) reject(err)
                else {
                  this.dnsCache.set(urlObj.hostname, true)
                  resolve()
                }
              })
            }),
            timeoutPromise
          ])
        }
      } catch (err) {
        throw new Error(`DNS resolution failed: ${(err as Error).message}`)
      }
    }

    // Build request options
    const options: RequestOptions = {
      method: method,
      headers: {
        ...headers,
        Connection: this.keepAlive ? 'keep-alive' : 'close'
      },
      rejectUnauthorized: this.strictSSL
    } as RequestOptions

    if (this.proxy) {
      // Proxy configuration
      const proxyUrl = new URL(this.proxy)
      options.hostname = proxyUrl.hostname
      options.port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80)
      options.path = urlStr // Full URL as proxy request path

      // Add proxy auth header
      if (proxyUrl.username || proxyUrl.password) {
        const auth = `${proxyUrl.username}:${proxyUrl.password}`
        options.headers = {
          ...options.headers,
          'Proxy-Authorization': `Basic ${Buffer.from(auth).toString('base64')}`
        }
      }

      // Set proxy protocol
      protocol = proxyUrl.protocol === 'https:' ? https : http
    } else {
      // Direct connection configuration
      options.hostname = urlObj.hostname
      options.port = urlObj.port || (isHttps ? 443 : 80)
      options.path = urlObj.pathname + urlObj.search
    }

    // Keep-Alive agent configuration
    if (this.keepAlive) {
      options.agent = new protocol.Agent({
        keepAlive: true,
        rejectUnauthorized: this.strictSSL
      } as AgentOptions)
    }

    return new Promise((resolve, reject) => {
      const req = protocol.request(options, (res: IncomingMessage) => {
        // Handle redirects (non-proxy case)
        if (
          !this.proxy &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          this.followRedirects &&
          res.headers.location
        ) {
          this.redirectCount++
          this._handleRedirect(res, method, headers, body, timings, resolve, reject)
          return
        }

        this._processResponse(res, timings, isHttps, resolve, reject)
      })

      // Socket event handling
      req.on('socket', (socket) => {
        timings.tcpStart = performance.now()

        socket.on('connect', () => {
          timings.tcpEnd = performance.now()
          if (isHttps && !this.proxy) {
            timings.tlsStart = performance.now()
          } else {
            timings.requestStart = performance.now()
          }
        })

        if (isHttps && !this.proxy) {
          socket.on('secureConnect', () => {
            timings.tlsEnd = performance.now()
            timings.requestStart = performance.now()
          })
        }

        socket.on('error', (error) => {
          reject(new Error(`Socket error: ${error.message}`))
        })
      })

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`))
      })

      // Write request body
      if (body) {
        req.write(body)
      }

      req.end()

      // Ensure requestStart is set
      timings.requestStart = timings.requestStart || performance.now()
    })
  }

  private async _handleRedirect(
    res: IncomingMessage,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    timings: Record<string, number>,
    resolve: (value: TimingResults) => void,
    reject: (reason?: any) => void
  ): Promise<void> {
    try {
      if (!res.headers.location) {
        throw new Error('Redirect location not specified')
      }

      const redirectUrl = res.headers.location
      const redirectTimings = await this._measureAttempt(redirectUrl, method, headers, body)

      // Merge data
      redirectTimings.dataLength += timings.dataLength
      if (!redirectTimings.firstByte && timings.firstByte) {
        redirectTimings.firstByte = timings.firstByte
      }

      resolve(redirectTimings)
    } catch (error) {
      reject(error)
    }
  }

  private _processResponse(
    res: IncomingMessage,
    timings: Record<string, number>,
    isHttps: boolean,
    resolve: (value: TimingResults) => void,
    reject: (reason?: any) => void
  ): void {
    timings.responseStart = performance.now()
    let firstByteReceived = false

    res.on('data', (chunk: Buffer) => {
      if (!firstByteReceived) {
        timings.firstByte = performance.now()
        timings.downloadStart = performance.now()
        firstByteReceived = true
      }
      timings.dataLength += chunk.length
    })

    res.on('end', () => {
      timings.end = performance.now()

      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim()))
      } else {
        resolve(this._calculateResults(timings, isHttps, res))
      }
    })

    res.on('error', (error) => {
      reject(new Error(`Response error: ${error.message}`))
    })
  }

  private _calculateResults(
    timings: Record<string, number>,
    isHttps: boolean,
    res: IncomingMessage
  ): TimingResults {
    const result: TimingResults = {
      dnsLookup: this.proxy ? 0 : timings.dnsEnd - timings.dnsStart, // 0 when using proxy
      tcpConnect: timings.tcpEnd - timings.tcpStart,
      request: timings.responseStart - timings.requestStart,
      ttfb: timings.firstByte ? timings.firstByte - timings.responseStart : 0,
      download: timings.downloadStart ? timings.end - timings.downloadStart : 0,
      total: timings.end - timings.dnsStart,
      dataLength: timings.dataLength,
      httpVersion: res.httpVersion,
      statusCode: res.statusCode,
      throughput: timings.downloadStart
        ? (timings.dataLength / (timings.end - timings.downloadStart || 1)) * 1000
        : 0,
      usingProxy: !!this.proxy
    }

    if (isHttps && !this.proxy) {
      result.tlsHandshake = timings.tlsEnd - timings.tlsStart
    }

    return result
  }

  public static formatResults(results: TimingResults): any {
    const tableData: any = [
      {
        Metric: I18nT('requestTimer.dnsLookup'),
        Value: `${results.dnsLookup.toFixed(2)} ms`,
        Note: results.usingProxy ? I18nT('requestTimer.skippedForProxy') : ''
      },
      {
        Metric: I18nT('requestTimer.tcpConnect'),
        Value: `${results.tcpConnect.toFixed(2)} ms`
      }
    ]

    if (results.tlsHandshake !== undefined) {
      tableData.push({
        Metric: I18nT('requestTimer.tlsHandshake'),
        Value: `${results.tlsHandshake.toFixed(2)} ms`
      })
    }

    tableData.push(
      {
        Metric: I18nT('requestTimer.requestProcessing'),
        Value: `${results.request.toFixed(2)} ms`
      },
      { Metric: I18nT('requestTimer.ttfb'), Value: `${results.ttfb.toFixed(2)} ms` },
      { Metric: I18nT('requestTimer.contentDownload'), Value: `${results.download.toFixed(2)} ms` },
      {
        Metric: I18nT('requestTimer.downloadSpeed'),
        Value: `${(results.throughput / 1024).toFixed(2)} KB/s`
      },
      {
        Metric: I18nT('requestTimer.dataSize'),
        Value: `${(results.dataLength / 1024).toFixed(2)} KB`
      },
      { Metric: I18nT('requestTimer.httpVersion'), Value: `HTTP/${results.httpVersion}` },
      {
        Metric: I18nT('requestTimer.statusCode'),
        Value: results.statusCode || 'N/A'
      },
      {
        Metric: I18nT('requestTimer.usingProxy'),
        Value: results.usingProxy ? 'Yes' : 'No'
      },
      { Metric: I18nT('requestTimer.totalTime'), Value: `${results.total.toFixed(2)} ms` }
    )

    console.log(`\n=== Request Timing Results ===`)
    console.table(tableData)
    return tableData
  }
}

// Example usage
async function Test() {
  const timer = new RequestTimer({
    timeout: 10000,
    retries: 2,
    followRedirects: true,
    maxRedirects: 3,
    keepAlive: true,
    proxy: process.env.HTTP_PROXY, // Read proxy from env
    strictSSL: false // Set to false to ignore SSL errors
  })

  try {
    const url = process.argv[2] || 'https://www.baidu.com'
    const method = process.argv[3] || 'GET'
    const headers = {
      'User-Agent': 'RequestTimer/1.0',
      Accept: '*/*'
    }

    console.log(`Measuring ${method} ${url} ...`)

    const results = await timer.measure(url, method, headers)
    RequestTimer.formatResults(results)
  } catch (error) {
    console.error('\nError:', (error as Error).message)
    process.exit(1)
  }
}

export { RequestTimer, Test, type TimingResults, type RequestTimerOptions }
