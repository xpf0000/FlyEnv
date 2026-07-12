import { createRequire } from 'node:module'
import { join, basename, dirname, isAbsolute } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  versionLocalFetch,
  versionMacportsFetch,
  versionFixed,
  versionSort,
  getSubDirAsync,
  versionBinVersion,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionFilterSame,
  AppLog,
  writeFile,
  mkdirp,
  chmod,
  remove,
  zipUnpack,
  moveChildDirToParent,
  readFile,
  md5
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import Helper from '../../Helper'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { compareVersions } from '@shared/compare-versions'
import { ProcessOwnedPidsByPid } from '@shared/Process'
import { StopProcessPidList } from '@shared/StopProcessList'
import { parse as iniParse } from 'ini'
import { Connection, createConnection } from 'mysql2/promise'
import { format } from 'date-fns'

const require = createRequire(import.meta.url)
const { pki, md } = require('node-forge')

type MariaDBPemFiles = {
  ca: string
  cert: string
  key: string
  cachingPrivateKey: string
  cachingPublicKey: string
}

const stripMariaDBValueQuotes = (value: any) => {
  return `${value ?? ''}`.trim().replace(/^['"]|['"]$/g, '')
}

const getMariaDBServerConfig = (config: any) => {
  return config?.mariadbd ?? config?.mysqld ?? {}
}

const resolveMariaDBBin = (binDir: string, names: string[]) => {
  for (const name of names) {
    const bin = join(binDir, name)
    if (existsSync(bin)) {
      return bin
    }
  }
  return join(binDir, names[0])
}

const resolveMariaDBInstallDBBin = (version: SoftInstalled) => {
  return resolveMariaDBBin(
    join(version.path, 'bin'),
    isWindows()
      ? ['mariadb-install-db.exe', 'mysql_install_db.exe']
      : ['mariadb-install-db', 'mysql_install_db']
  )
}

const getMariaDBConfigValue = (section: any, names: string[]) => {
  for (const name of names) {
    const value = section?.[name]
    if (value !== undefined && value !== null && `${value}`.trim().length > 0) {
      return stripMariaDBValueQuotes(value)
    }
  }
  return ''
}

const mariaDBPathExists = (value: string, dataDir: string, binDir: string) => {
  if (!value) {
    return false
  }
  const path = stripMariaDBValueQuotes(value)
  const candidates = isAbsolute(path) ? [path] : [join(dataDir, path), join(binDir, path)]
  return candidates.some((p) => existsSync(p))
}

const isMariaDBSSLDisabled = (section: any) => {
  const ssl = getMariaDBConfigValue(section, ['ssl'])
  const disabledValues = new Set(['0', 'off', 'false', 'no', 'disabled'])
  if (ssl && disabledValues.has(ssl.toLowerCase())) {
    return true
  }
  return ['disable-ssl', 'disable_ssl', 'skip-ssl', 'skip_ssl'].some((key) => {
    const value = section?.[key]
    return value !== undefined && value !== false && `${value}`.toLowerCase() !== 'false'
  })
}

const supportsMariaDBZeroConfigSSL = (version?: string | null) => {
  return !!version && compareVersions(version, '11.4.0') !== -1
}

const supportsMariaDBCommandSet = (item?: { version?: string | null } | string | null) => {
  const version = typeof item === 'string' ? item : item?.version
  return !!version && compareVersions(version, '10.5.0') !== -1
}

type MariaDBOptionSupportCacheItem = {
  bin: string
  version: string
  option: string
  supported: boolean
  updatedAt: number
}

let MariaDBOptionSupportFileCache: Record<string, MariaDBOptionSupportCacheItem> | undefined

const mariaDBOptionSupportCacheFile = () => {
  return join(global.Server.Cache!, 'mariadb-option-support.json')
}

const readMariaDBOptionSupportCache = async () => {
  if (MariaDBOptionSupportFileCache) {
    return MariaDBOptionSupportFileCache
  }

  try {
    const file = mariaDBOptionSupportCacheFile()
    if (existsSync(file)) {
      const content = await readFile(file, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        MariaDBOptionSupportFileCache = parsed
        return MariaDBOptionSupportFileCache!
      }
    }
  } catch {}

  MariaDBOptionSupportFileCache = {}
  return MariaDBOptionSupportFileCache
}

const writeMariaDBOptionSupportCache = async () => {
  if (!MariaDBOptionSupportFileCache) {
    return
  }
  try {
    await mkdirp(global.Server.Cache!)
    await writeFile(
      mariaDBOptionSupportCacheFile(),
      JSON.stringify(MariaDBOptionSupportFileCache, null, 2)
    )
  } catch {}
}

const supportsMariaDBServerOption = async (version: SoftInstalled, option: string) => {
  const optionName = option.replace(/^--/, '')
  const bin = version.bin
  const versionNumber = version.version ?? ''
  let binStatKey = ''
  try {
    const info = statSync(bin)
    binStatKey = `${info.size}:${Math.floor(info.mtimeMs)}`
  } catch {}
  const cacheKey = md5(
    `mariadb:${pathFixedToUnix(bin)}:${versionNumber}:${binStatKey}:${optionName}`
  )
  const cache = await readMariaDBOptionSupportCache()
  const cached = cache?.[cacheKey]
  if (typeof cached?.supported === 'boolean') {
    return cached.supported
  }

  let supported = false
  let detected = false
  try {
    const res = await execPromise(`${basename(bin)} --no-defaults --verbose --help`, {
      cwd: dirname(bin),
      maxBuffer: 1024 * 1024 * 10
    })
    const output = `${res?.stdout ?? ''}\n${res?.stderr ?? ''}`
    supported = output.includes(optionName) || output.includes(optionName.replace(/-/g, '_'))
    detected = true
  } catch (e) {
    console.log('supportsMariaDBServerOption error: ', optionName, e)
  }

  if (!detected) {
    return false
  }

  cache[cacheKey] = {
    bin: pathFixedToUnix(bin),
    version: versionNumber,
    option: optionName,
    supported,
    updatedAt: Date.now()
  }
  await writeMariaDBOptionSupportCache()
  return supported
}

const quoteMariaDBArgPath = (file: string) => {
  // Args are passed to spawn() as an array (no shell), so the path must NOT be quoted —
  // quotes would become part of the literal path. Just normalize separators.
  return pathFixedToUnix(file)
}

const createSerialNumber = () => {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`
}

const generateCertificatePair = () => {
  const caKeys = pki.rsa.generateKeyPair(2048)
  const caCert = pki.createCertificate()
  caCert.publicKey = caKeys.publicKey
  caCert.serialNumber = createSerialNumber()
  caCert.validity.notBefore = new Date()
  caCert.validity.notAfter = new Date()
  caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10)
  const caAttrs = [{ name: 'commonName', value: 'FlyEnv MariaDB Local CA' }]
  caCert.setSubject(caAttrs)
  caCert.setIssuer(caAttrs)
  caCert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' }
  ])
  caCert.sign(caKeys.privateKey, md.sha256.create())

  const serverKeys = pki.rsa.generateKeyPair(2048)
  const serverCert = pki.createCertificate()
  serverCert.publicKey = serverKeys.publicKey
  serverCert.serialNumber = createSerialNumber()
  serverCert.validity.notBefore = new Date()
  serverCert.validity.notAfter = new Date()
  serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 10)
  serverCert.setSubject([{ name: 'commonName', value: 'localhost' }])
  serverCert.setIssuer(caCert.subject.attributes)
  serverCert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true
    },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' }
      ]
    }
  ])
  serverCert.sign(caKeys.privateKey, md.sha256.create())

  return {
    ca: pki.certificateToPem(caCert),
    cert: pki.certificateToPem(serverCert),
    key: pki.privateKeyToPem(serverKeys.privateKey)
  }
}

const ensureMariaDBPemFiles = async (dataDir: string): Promise<MariaDBPemFiles> => {
  await mkdirp(dataDir)
  const files: MariaDBPemFiles = {
    ca: join(dataDir, 'ca.pem'),
    cert: join(dataDir, 'server-cert.pem'),
    key: join(dataDir, 'server-key.pem'),
    cachingPrivateKey: join(dataDir, 'private_key.pem'),
    cachingPublicKey: join(dataDir, 'public_key.pem')
  }

  if (!existsSync(files.ca) || !existsSync(files.cert) || !existsSync(files.key)) {
    const ssl = generateCertificatePair()
    await writeFile(files.ca, ssl.ca)
    await writeFile(files.cert, ssl.cert)
    await writeFile(files.key, ssl.key)
    await chmod(files.key, '0600').catch(() => {})
  }

  if (!existsSync(files.cachingPrivateKey) || !existsSync(files.cachingPublicKey)) {
    const keyPair = pki.rsa.generateKeyPair(2048)
    await writeFile(files.cachingPrivateKey, pki.privateKeyToPem(keyPair.privateKey))
    await writeFile(files.cachingPublicKey, pki.publicKeyToPem(keyPair.publicKey))
    await chmod(files.cachingPrivateKey, '0600').catch(() => {})
  }

  return files
}

const getMariaDBPemStartArgs = async (
  version: SoftInstalled,
  section: any,
  dataDir: string,
  binDir: string
) => {
  if (!isWindows() || !supportsMariaDBZeroConfigSSL(version.version)) {
    return []
  }

  const args: string[] = []
  const sslDisabled = isMariaDBSSLDisabled(section)

  const sslKey = getMariaDBConfigValue(section, ['ssl-key', 'ssl_key'])
  const sslCert = getMariaDBConfigValue(section, ['ssl-cert', 'ssl_cert'])
  const hasValidSSL =
    !sslDisabled &&
    mariaDBPathExists(sslKey, dataDir, binDir) &&
    mariaDBPathExists(sslCert, dataDir, binDir)
  const needsSSLArgs = !hasValidSSL && !sslDisabled

  let needsCachingKeyArgs = false
  let supportsCachingKeys = false
  let privateKey = ''
  let publicKey = ''

  supportsCachingKeys =
    (await supportsMariaDBServerOption(version, 'caching-sha2-password-private-key-path')) &&
    (await supportsMariaDBServerOption(version, 'caching-sha2-password-public-key-path'))

  if (supportsCachingKeys) {
    privateKey = getMariaDBConfigValue(section, [
      'caching_sha2_password_private_key_path',
      'caching-sha2-password-private-key-path'
    ])
    publicKey = getMariaDBConfigValue(section, [
      'caching_sha2_password_public_key_path',
      'caching-sha2-password-public-key-path'
    ])
    needsCachingKeyArgs =
      !mariaDBPathExists(privateKey, dataDir, binDir) ||
      !mariaDBPathExists(publicKey, dataDir, binDir)
  }

  if (!needsSSLArgs && !needsCachingKeyArgs) {
    return args
  }

  const files = await ensureMariaDBPemFiles(dataDir)

  if (needsSSLArgs) {
    args.push(`--ssl-ca=${quoteMariaDBArgPath(files.ca)}`)
    args.push(`--ssl-cert=${quoteMariaDBArgPath(files.cert)}`)
    args.push(`--ssl-key=${quoteMariaDBArgPath(files.key)}`)
  }

  if (supportsCachingKeys && needsCachingKeyArgs) {
    args.push(
      `--caching-sha2-password-private-key-path=${quoteMariaDBArgPath(files.cachingPrivateKey)}`
    )
    args.push(
      `--caching-sha2-password-public-key-path=${quoteMariaDBArgPath(files.cachingPublicKey)}`
    )
  }

  return args
}

const mariaDBClientTLSArgs = (version?: string | null) => {
  return supportsMariaDBZeroConfigSSL(version) ? ' --skip-ssl-verify-server-cert' : ''
}

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  getConfigFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
    if (!v) return []
    return [{ name: 'main', path: join(global.Server.MariaDBDir!, `my-${v}.cnf`) }]
  }

  getLogFiles() {
    return [
      { name: 'error', path: join(global.Server.MariaDBDir!, 'error.log') },
      { name: 'slow', path: join(global.Server.MariaDBDir!, 'slow.log') }
    ]
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      let promise: Promise<any> | undefined
      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mariadb-admin.exe')
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
        let port = 3306
        try {
          const content = existsSync(m) ? await readFile(m, 'utf8') : ''
          const config = iniParse(content)
          port = getMariaDBServerConfig(config)?.port ?? 3306
        } catch {}

        promise = execPromise(
          `${basename(bin)} --defaults-file="${m}"${mariaDBClientTLSArgs(
            version.version
          )} --port=${port} --host="127.0.0.1" -uroot password "root"`,
          {
            cwd: dirname(bin)
          }
        )
      } else {
        const bin = join(dirname(version.bin), 'mariadb-admin')
        promise = execPromise(
          `./${basename(bin)} --socket=/tmp/mysql.sock -uroot password "root"`,
          {
            cwd: dirname(bin)
          }
        )
      }

      promise!
        .then((res) => {
          console.log('_initPassword res: ', res)
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
            )
          })
          resolve(true)
        })
        .catch((err) => {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBPassFail', { error: err }))
          })
          console.log('_initPassword err: ', err)
          reject(err)
        })
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<any> {
    if (!isWindows()) {
      return super._stopServer(version)
    }

    return new ForkPromise(async (resolve, reject, on) => {
      const pids = new Set<string>()
      const killPids = new Set<string>()
      const appPidFile = this.appPidFile()
      if (existsSync(appPidFile)) {
        try {
          const pid = await this.readPidFromFile(appPidFile)
          if (pid) {
            pids.add(pid)
          }
        } catch {}
        TaskQueue.run(remove, appPidFile).then().catch()
      }
      try {
        const pid = await this.readPidFromFile()
        if (pid) {
          pids.add(pid)
        }
      } catch {}
      if (version?.pid) {
        pids.add(`${version.pid}`)
      }
      try {
        const processList = await StopProcessPidList()
        const ownedMarkers = this.ownedProcessMarkers(version)
        for (const pid of pids) {
          ProcessOwnedPidsByPid(pid, processList, ownedMarkers).forEach((item) =>
            killPids.add(item)
          )
        }
      } catch {}
      if (pids.size > 0) {
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
        const bin = join(dirname(version.bin), 'mariadb-admin.exe')
        const password = version?.rootPassword ?? 'root'
        let port = 3306
        if (existsSync(m)) {
          try {
            const content = await readFile(m, 'utf8')
            const config = iniParse(content)
            port = getMariaDBServerConfig(config)?.port ?? 3306
          } catch {}
        }

        let success = false
        /**
         * ./mariadb-admin.exe --defaults-file="C:\Program Files\FlyEnv-Data\server\mariadb\my-11.4.cnf" -v --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" -uroot -proot001 shutdown
         */
        const command = `"${bin}" --defaults-file="${m}"${mariaDBClientTLSArgs(
          version.version
        )} --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" --port=${port} -uroot -p${password} shutdown`
        console.log('mariadb _stopServer command: ', command)
        try {
          await execPromise(command)
          success = true
        } catch (e) {
          success = false
          console.log('mariadb _stopServer command error: ', e)
        }

        if (!success) {
          const arr = Array.from(killPids)
          if (arr.length > 0) {
            const str = arr.map((s) => `/pid ${s}`).join(' ')
            try {
              await execPromise(`taskkill /f /t ${str}`)
            } catch {}
          }
        } else {
          await waitTime(1500)
        }
      }

      on({
        'APP-Service-Stop-Success': true
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      return resolve({
        'APP-Service-Stop-PID': [...new Set([...pids, ...killPids])].map((p) => Number(p))
      })
    })
  }

  _startServer(version: SoftInstalled, skipGrantTables?: boolean) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = pathFixedToUnix(join(global.Server.MariaDBDir!, `my-${v}.cnf`))
      const dataDir = pathFixedToUnix(join(global.Server.MariaDBDir!, `data-${v}`))
      await mkdirp(global.Server.MariaDBDir!)
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir=${dataDir}`
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const baseDir = global.Server.MariaDBDir!
      await mkdirp(baseDir)

      const doStart = async () => {
        return new Promise(async (resolve, reject) => {
          const p = this.pidPath
          const s = join(global.Server.MariaDBDir!, 'slow.log')
          const e = join(global.Server.MariaDBDir!, 'error.log')
          const bin = version.bin

          const content = await readFile(m, 'utf8')
          const config = iniParse(content)
          const serverConfig = getMariaDBServerConfig(config)
          const port = serverConfig?.port ?? 3306
          const ddir = pathFixedToUnix(stripMariaDBValueQuotes(serverConfig?.datadir ?? dataDir))

          if (isWindows()) {
            const params = [
              `--defaults-file=${m}`,
              `--pid-file=${p}`,
              '--slow-query-log=ON',
              `--slow-query-log-file=${s}`,
              `--log-error=${e}`,
              '--standalone'
            ]
            params.push(
              ...(await getMariaDBPemStartArgs(version, serverConfig, ddir, dirname(bin)))
            )

            if (skipGrantTables) {
              params.push(`--datadir=${ddir}`)
              params.push('--bind-address=127.0.0.1')
              params.push(`--port=${port}`)
              params.push(`--enable-named-pipe`)
              params.push('--skip-grant-tables')
            }

            try {
              const res = await serviceStartSpawn({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs: params,
                on,
                waitTime: 2000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
            // Use the real `mariadbd` (foreground) instead of the `mariadbd-safe`
            // wrapper that version.bin points to — serviceStartSpawn backgrounds the
            // process itself and needs a foreground server (no fork-and-exit wrapper).
            const serverBin = join(dirname(bin), 'mariadbd')
            const params = [
              `--defaults-file=${m}`,
              `--pid-file=${p}`,
              '--slow-query-log=ON',
              `--slow-query-log-file=${s}`,
              `--log-error=${e}`
            ]
            if (version?.flag === 'macports') {
              params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
            }

            if (skipGrantTables) {
              params.push(`--socket=/tmp/mysql.${version.version}.sock`)
              params.push(`--datadir=${ddir}`)
              params.push('--bind-address=127.0.0.1')
              params.push(`--port=${port}`)
              params.push('--skip-grant-tables')
            } else {
              params.push(`--socket=/tmp/mysql.sock`)
            }

            try {
              const res = await serviceStartSpawn({
                version,
                pidPath: p,
                baseDir,
                bin: serverBin,
                execArgs: params,
                on,
                waitTime: 2000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          }
        })
      }

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        if (isWindows()) {
          const binInstallDB = resolveMariaDBInstallDBBin(version)

          const params = [`--datadir="${dataDir}"`, `--config="${m}"`]

          process.chdir(dirname(binInstallDB))
          const command = `${basename(binInstallDB)} ${params.join(' ')}`
          console.log('command: ', command)

          try {
            const res = await execPromise(command)
            console.log('init res: ', res)
            on(res.stdout)
          } catch (e: any) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
          const bin = resolveMariaDBInstallDBBin(version)
          const params: string[] = []
          params.push(`--datadir="${dataDir}"`)
          params.push(`--basedir="${version.path}"`)
          params.push('--auth-root-authentication-method=normal')
          params.push(`--defaults-file="${m}"`)
          if (version?.flag === 'macports') {
            const enDir = join(version.path, 'share')
            if (!existsSync(enDir)) {
              const shareDir = `/opt/local/share/${basename(version.path)}`
              if (existsSync(shareDir)) {
                await Helper.send('mariadb', 'macportsDirFixed', enDir, shareDir)
              }
            }
          }
          try {
            await execPromise(`cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')}`)
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        }

        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dataDir }))
        })
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          if (!skipGrantTables) {
            await this._initPassword(version).on(on)
          }
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(res)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart().then(resolve).catch(reject)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = (await this._fetchOnlineVersion('mariadb')).filter(
          supportsMariaDBCommandSet
        )
        all.forEach((a: any) => {
          const appDir = join(global.Server.AppDir!, `mariadb-${a.version}`)
          const mariadbdBin = join(appDir, 'bin/mariadbd.exe')
          const zip = join(global.Server.Cache!, `mariadb-${a.version}.zip`)
          const oldMariadbdBin = join(
            global.Server.AppDir!,
            `mariadb-${a.version}`,
            `mariadb-${a.version}-winx64`,
            'bin/mariadbd.exe'
          )
          a.appDir = appDir
          a.zip = zip
          a.bin =
            existsSync(mariadbdBin) || !existsSync(oldMariadbdBin) ? mariadbdBin : oldMariadbdBin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(mariadbdBin) || existsSync(oldMariadbdBin)
          a.name = `MariaDB-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
      const fpms = allLibFile
        .filter((f) => f.startsWith('mariadb'))
        .map((f) => `lib/${f}/bin/mariadbd-safe`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.mariadb?.dirs ?? [], 'mariadbd.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.mariadb?.dirs ?? [], 'mariadbd-safe', 'mariadb'),
          versionMacportsFetch(fpms)
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            let bin = item.bin
            if (!isWindows()) {
              bin = join(dirname(item.bin), 'mariadbd')
            }
            const command = `"${bin}" -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
            return TaskQueue.run(versionBinVersion, bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: !!version,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['mariadb']
        const cammand = 'brew search -q --formula "/mariadb@[\\d\\.]+$/"'
        all = await brewSearch(all, cammand)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        '"^mariadb-([\\d\\.]*)\\d$"',
        (f) => {
          return f.includes('Multithreaded SQL database server')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/mariadbd-safe'))
        }
      )
      resolve(Info.filter((item: any) => supportsMariaDBCommandSet(item.version)))
    })
  }

  passwordChange(version: SoftInstalled, user: string, password: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const res: any = await this._startServer(version, true)
        console.log('rootPasswordChange _startServer res: ', res)
        const pid = res?.['APP-Service-Start-PID']
        version.pid = pid
      } catch (e) {
        console.log('rootPasswordChange _startServer e: ', e)
        return reject(e)
      }
      await waitTime(1000)

      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mariadb.exe')
        try {
          await execPromise(
            `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
          )
        } catch (e) {
          console.log('mariadb.exe error2: ', e)
        }
        try {
          await execPromise(
            `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
          )
        } catch (e) {
          console.log('mariadb.exe error3: ', e)
        }
      } else {
        const bin = join(dirname(version.bin), 'mariadb')
        const socket = `/tmp/mysql.${version.version}.sock`

        try {
          await execPromise(
            `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
          )
        } catch (e) {
          console.log('mariadb error2: ', e)
        }
        try {
          await execPromise(
            `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
          )
        } catch (e) {
          console.log('mariadb error3: ', e)
        }
      }

      version.rootPassword = password
      try {
        await super._stopServer(version)
      } catch {}

      resolve(true)
    })
  }

  getDatabasesWithUsers(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMariaDBServerConfig(config)?.port ?? 3306
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      try {
        const [databases]: any = await connection.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN (
        'mysql', 'information_schema', 'performance_schema', 'sys'
      )
    `)

        const [dbPrivileges]: any = await connection.query(`
      SELECT * FROM mysql.db
      WHERE Db NOT IN ('mysql', 'sys') and
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [globalUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
      WHERE
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [allUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
    `)

        const list = databases.map((db: any) => {
          const dbName = db?.SCHEMA_NAME ?? db.schema_name

          const directUsers = dbPrivileges
            .filter((priv: any) => priv.Db.replace(/[\\]+/g, '') === dbName)
            .map((priv: any) => `${priv.User}`)

          const globalUserList = globalUsers.map((u: any) => `${u.User}`)

          return {
            name: dbName,
            users: [...new Set([...directUsers, ...globalUserList])]
          }
        })
        resolve({
          list,
          databases,
          dbPrivileges,
          globalUsers,
          allUsers
        })
      } finally {
        await connection.end()
      }
    })
  }

  addDatabase(version: SoftInstalled, data: any) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMariaDBServerConfig(config)?.port ?? 3306
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      let userExists = false

      try {
        await connection.query('FLUSH PRIVILEGES')
        // 1. 创建数据库
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS \`${data.database}\` CHARACTER SET ${data.charset}`
        )

        const [users]: any = await connection.query(
          `SELECT User FROM mysql.user WHERE User = ? AND Host = 'localhost'`,
          [data.user]
        )
        if (!users || users.length === 0) {
          await connection.query(`CREATE USER ?@'localhost' IDENTIFIED BY ?`, [
            data.user,
            data.password
          ])
        } else {
          await connection.query(
            `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
          )
          userExists = true
        }

        // 3. 授予用户对数据库的所有权限
        await connection.query(
          `GRANT ALL PRIVILEGES ON \`${data.database}\`.* TO '${data.user}'@'localhost'`
        )

        // 4. 刷新权限
        await connection.query('FLUSH PRIVILEGES')
        await connection?.end()
      } catch (e) {
        console.log('addDatabase Error: ', e)
        await connection?.end()
        return reject(e)
      }

      resolve({
        userExists
      })
    })
  }

  backupDatabase(version: SoftInstalled, databases: string[], saveDir: string) {
    return new ForkPromise(async (resolve, reject) => {
      if (!isAbsolute(saveDir)) {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      try {
        await mkdirp(saveDir)
      } catch {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      let bin = ''
      if (isWindows()) {
        bin = join(dirname(version.bin), 'mariadb-dump.exe')
      } else {
        bin = join(dirname(version.bin), 'mariadb-dump')
      }

      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMariaDBServerConfig(config)?.port ?? 3306
      const password = version?.rootPassword ?? 'root'
      const error: any = []

      const time = format(new Date(), 'yyyy-MM-dd-HH-mm-ss')
      for (const database of databases) {
        const file = join(saveDir, `${database}-backup-${time}.sql`)
        const cammand = `"${bin}"${mariaDBClientTLSArgs(
          version.version
        )} -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --skip-add-locks --no-tablespaces ${database} > "${file}"`
        try {
          await execPromise(cammand)
        } catch (e) {
          error.push(I18nT('mysql.backupFail', { database, error: `${e}` }))
        }
      }

      resolve(error)
    })
  }
}

export default new Manager()
