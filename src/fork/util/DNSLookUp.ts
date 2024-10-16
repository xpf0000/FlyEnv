import { isIP } from 'node:net'
import { readFileAsText } from '@ayonli/jsext/fs'
import { platform, unrefTimer } from '@ayonli/jsext/runtime'
import { lines } from '@ayonli/jsext/string'
import throttle from '@ayonli/jsext/throttle'
import { RecordWithTtl, Resolver, ResolveOptions } from 'dns'

type AddressInfo = { address: string; family: 4 | 6 }
type AddressInfoDetail = AddressInfo & { expireAt: number }
type LookupCallback<T extends string | AddressInfo[]> = (
  err: NodeJS.ErrnoException,
  address: T,
  family?: 4 | 6
) => void

const resolver = new Resolver()
resolver.setServers([
  '8.8.8.8', // Google
  '1.1.1.1', // Cloudflare
  '8.8.4.4',
  '64.6.64.6',
  '64.6.65.6',
  '168.95.192.1',
  '168.95.1.1'
])

const resolve4 = (hostname: string, options: ResolveOptions): Promise<RecordWithTtl[]> => {
  return new Promise((resolve, reject) => {
    resolver.resolve4(hostname, options, (err, addresses) => {
      if (err) {
        reject(err)
        return
      }
      resolve(addresses as any)
    })
  })
}
const resolve6 = (hostname: string, options: ResolveOptions): Promise<RecordWithTtl[]> => {
  return new Promise((resolve, reject) => {
    resolver.resolve6(hostname, options, (err, addresses) => {
      if (err) {
        reject(err)
        return
      }
      resolve(addresses as any)
    })
  })
}
const Cache: Record<string, AddressInfoDetail[]> = {}

let HostsConfig: Record<string, AddressInfoDetail[]> | undefined

const timer = setInterval(async () => {
  // reload hosts file for every 10 seconds.
  HostsConfig = await readHosts()
}, 10_000)
unrefTimer(timer) // allow the process to exit once there are no more pending jobs.

function timestamp() {
  return Math.floor(Date.now() / 1000)
}

const readHosts = throttle(async () => {
  const file =
    platform() === 'windows' ? 'c:\\Windows\\System32\\Drivers\\etc\\hosts' : '/etc/hosts'
  const contents = await readFileAsText(file)

  return lines(contents)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
    .reduce((configs: Record<string, AddressInfoDetail[]>, segments) => {
      const expireAt = timestamp() + 10 // mark available for 10 seconds

      segments.slice(1).forEach((hostname) => {
        const family = isIP(segments[0]) as 0 | 4 | 6

        if (family) {
          ;(configs[hostname] || (configs[hostname] = [])).push({
            address: segments[0],
            family,
            expireAt
          })
        }
      })

      return configs
    }, {})
}, 5_000)

/**
 * Queries IP addresses of the given hostname, this operation is async and
 * atomic, and uses cache when available. When `family` is omitted, both
 * `A (IPv4)` and `AAAA (IPv6)` records are searched, however only one address
 * will be returned if `options.all` is not set.
 *
 * NOTE: The internal TTL for an identical query is 10 seconds.
 */
export function lookup(hostname: string, family?: 0 | 4 | 6): Promise<string>
export function lookup(hostname: string, callback: LookupCallback<string>): void
export function lookup(hostname: string, family: 0 | 4 | 6, callback: LookupCallback<string>): void
export function lookup(hostname: string, options: { family?: 0 | 4 | 6 }): Promise<string>
export function lookup(
  hostname: string,
  options: { family?: 0 | 4 | 6 },
  callback: LookupCallback<string>
): void
export function lookup(
  hostname: string,
  options: { family?: 0 | 4 | 6; all: true }
): Promise<AddressInfo[]>
export function lookup(
  hostname: string,
  options: { family?: 0 | 4 | 6; all: true },
  callback: LookupCallback<AddressInfo[]>
): void
export function lookup(hostname: string, options: any = void 0, callback: any = null): any {
  let family: 0 | 4 | 6 = 0
  let all = false

  if (typeof options === 'object') {
    family = options.family || 0
    all = options.all || false
  } else if (typeof options === 'number') {
    family = options as 0 | 4 | 6
  } else if (typeof options === 'function') {
    callback = options
  }

  const _family = isIP(hostname) as 0 | 4 | 6

  if (_family) {
    if (all) {
      if (callback) {
        return callback(null, [{ address: hostname, family: _family }])
      } else {
        return Promise.resolve([{ address: hostname, family: _family }])
      }
    } else {
      if (callback) {
        return callback(null, hostname, _family)
      } else {
        return Promise.resolve(hostname)
      }
    }
  }

  let query: Promise<AddressInfo[]> | undefined

  // If local cache contains records of the target hostname, try to retrieve
  // them and prevent network query.
  if (!!Cache[hostname]?.length) {
    const now = timestamp()
    let addresses = Cache[hostname].filter((a) => a.expireAt > now)

    if (family) {
      addresses = addresses.filter((a) => a.family === family)
    }

    if (!!addresses?.length) {
      query = Promise.resolve(addresses)
    }
  }

  // If local cache doesn't contain available records, then goto network
  // query.
  if (!query) {
    query = throttle(
      async () => {
        HostsConfig ??= await readHosts()

        const result: AddressInfoDetail[] = HostsConfig[hostname] || []
        let err4: NodeJS.ErrnoException | undefined
        let err6: NodeJS.ErrnoException | undefined

        if (!result?.length || (family && !result.some((item) => item.family === family))) {
          if (!family || family === 4) {
            try {
              const records = await resolve4(hostname, { ttl: true })
              const now = timestamp()
              const addresses = records.map((record) => ({
                address: record.address,
                family: 4 as const,
                // In case the DNS refresh the record, we only allow
                // 10 seconds for maximum cache time.
                expireAt: Math.max(record.ttl + now, 10)
              }))

              result.push(...addresses)

              // Cache the records.
              if (Cache[hostname]) {
                Cache[hostname] = Cache[hostname].filter(
                  (a) => a.family !== 4 // remove history
                )
                Cache[hostname].unshift(...addresses)
              } else {
                Cache[hostname] = addresses
              }
            } catch (e) {
              err4 = e as any
            }
          }

          if (!family || family === 6) {
            try {
              const records = await resolve6(hostname, { ttl: true })
              const now = timestamp()
              const addresses = records.map((record) => ({
                address: record.address,
                family: 6 as const,
                expireAt: Math.max(record.ttl + now, 10)
              }))

              result.push(...addresses)

              // Cache the records.
              if (Cache[hostname]) {
                Cache[hostname] = Cache[hostname].filter(
                  (a) => a.family !== 6 // remove history
                )
                Cache[hostname].push(...addresses)
              } else {
                Cache[hostname] = addresses
              }
            } catch (e: any) {
              if (
                (e.code === 'ENODATA' || e.code === 'EREFUSED') &&
                e.syscall === 'queryAaaa' &&
                family === 6
              ) {
                try {
                  const records = await resolve4(hostname, {
                    ttl: true
                  })
                  const now = timestamp()

                  result.push(
                    ...records.map((record) => ({
                      address: `::ffff:${record.address}`,
                      family: 6 as const,
                      expireAt: Math.max(record.ttl + now, 10)
                    }))
                  )

                  // Cache the records.
                  const addresses = records.map((record) => ({
                    address: record.address,
                    family: 4 as const,
                    expireAt: Math.max(record.ttl + now, 10)
                  }))

                  if (Cache[hostname]) {
                    Cache[hostname] = Cache[hostname].filter(
                      (a) => a.family !== 4 // remove history
                    )
                    Cache[hostname].unshift(...addresses)
                  } else {
                    Cache[hostname] = addresses
                  }
                } catch (_e) {
                  err6 = e
                }
              } else {
                err6 = e
              }
            }
          }
        }

        if (err4 && err6 && !family) {
          console.log('err4: ', err4)
          console.log('err6: ', err6)
          throw Object.assign(new Error(`queryA and queryAaaa ENODATA ${hostname}`), {
            errno: undefined,
            code: 'ENODATA',
            syscall: undefined,
            hostname
          })
        } else if (err4 && family === 4) {
          throw err4
        } else if (err6 && family === 6) {
          throw err6
        } else {
          return result
        }
      },
      {
        duration: 10_000,
        for: `dnsLookup:${hostname}:${family}:${all}`
      }
    )()
  }

  if (query) {
    query = query.then((addresses) =>
      addresses.map(({ address, family }) => {
        // Make sure the result only contains 'address' and 'family'.
        return { address, family }
      })
    )
  }

  if (!callback) {
    return query.then((addresses) => {
      if (all) {
        if (family) {
          return addresses.filter((a) => a.family === family)
        } else {
          return addresses
        }
      } else {
        if (family) {
          return addresses.find((a) => a.family === family)!.address
        } else {
          return addresses[0].address
        }
      }
    })
  } else {
    query
      .then((addresses) => {
        if (all) {
          if (family) {
            callback(
              null,
              addresses.filter((a) => a.family === family)
            )
          } else {
            callback(null, addresses)
          }
        } else {
          if (family) {
            callback(null, addresses.find((a) => a.family === family)!.address, family)
          } else {
            callback(null, addresses[0].address, addresses[0].family)
          }
        }
      })
      .catch((err) => {
        callback(err, void 0)
      })
  }
}
