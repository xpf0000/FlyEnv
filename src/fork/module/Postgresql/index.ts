import { join, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  getSubDirAsync,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort,
  waitTime,
  chmod,
  copyFile,
  readFile,
  unlink,
  writeFile,
  serviceStartExecCMD,
  mkdirp,
  execPromiseWithEnv,
  spawnPromiseWithEnv,
  remove
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'
import { ProcessKill, ProcessListFetch, ProcessSearch } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import {
  findPgAdminPort,
  PGADMIN4_PACKAGE,
  pgAdminConfigContent,
  pgAdminPaths,
  pgAdminServersContent,
  pgAdminUrl,
  postgresqlPortFromConfig,
  type PgAdminCredentials,
  validPgAdminCredentials,
  validPgAdminPythonVersion
} from './pgAdmin'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  getConfigFiles(version?: SoftInstalled) {
    const versionTop = version?.version?.split('.')?.shift() ?? ''
    if (!versionTop) return []
    const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
    return [{ name: 'main', path: join(dbPath, 'postgresql.conf') }]
  }

  getLogFiles(version?: SoftInstalled) {
    const versionTop = version?.version?.split('.')?.shift() ?? ''
    if (!versionTop) return []
    const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
    const pgAdminLogDir = join(this.pgAdminPaths().root, 'log')
    return [
      { name: 'log', path: join(dbPath, 'pg.log') },
      { name: 'pgadmin4-start-out', path: join(pgAdminLogDir, 'pgadmin4.start.out.log') },
      { name: 'pgadmin4-start-error', path: join(pgAdminLogDir, 'pgadmin4.start.err.log') }
    ]
  }

  private pgAdminPaths() {
    return pgAdminPaths(global.Server.PostgreSqlDir!, isWindows())
  }

  private async pgAdminPackageRoot(pythonBin: string): Promise<string> {
    const result = await spawnPromiseWithEnv(
      pythonBin,
      ['-c', 'import os, pgadmin; print(os.path.dirname(os.path.dirname(pgadmin.__file__)))'],
      { shell: false }
    )
    const root = result.stdout.trim()
    if (!root) {
      throw new Error('pgAdmin package directory was not found')
    }
    return root
  }

  private async pgAdminRunningPid(): Promise<string | undefined> {
    const paths = this.pgAdminPaths()
    if (!existsSync(paths.pid)) {
      return undefined
    }

    const pid = await this.readPidFromFile(paths.pid)
    const process = pid ? (await ProcessListFetch()).find((item) => item.PID === pid) : undefined
    const command = process?.COMMAND ?? ''
    if (!command.includes(paths.root)) {
      await remove(paths.pid).catch(() => {})
      return undefined
    }
    return pid
  }

  private async _stopPGAdmin(): Promise<string[]> {
    const paths = this.pgAdminPaths()
    const pid = await this.pgAdminRunningPid()
    if (!pid) {
      return []
    }

    try {
      await ProcessKill('-INT', [pid])
    } finally {
      await remove(paths.pid).catch(() => {})
    }
    return [pid]
  }

  pgAdminStatus(): ForkPromise<{ initialized: boolean }> {
    return new ForkPromise((resolve) => {
      resolve({ initialized: existsSync(join(this.pgAdminPaths().data, 'pgadmin4.db')) })
    })
  }

  openPGAdmin(
    version: SoftInstalled,
    dataDir: string,
    python: SoftInstalled,
    credentials?: PgAdminCredentials
  ): ForkPromise<{ url: string; 'APP-Service-Start-PID': string }> {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const paths = this.pgAdminPaths()
        const firstStart = !existsSync(join(paths.data, 'pgadmin4.db'))
        if (!existsSync(join(dataDir, 'postmaster.pid'))) {
          throw new Error('PostgreSQL is not running')
        }
        if (!python?.bin || !existsSync(python.bin)) {
          throw new Error('A selected Python binary is required')
        }
        if (!validPgAdminPythonVersion(python.version)) {
          throw new Error('pgAdmin 4 requires Python 3.9 or later')
        }
        if (firstStart && !validPgAdminCredentials(credentials)) {
          throw new Error('pgAdmin administrator credentials are required')
        }

        if (!firstStart) {
          const runningPid = await this.pgAdminRunningPid()
          if (runningPid && existsSync(paths.port)) {
            const port = Number((await readFile(paths.port, 'utf-8')).trim())
            if (Number.isInteger(port) && port >= 1 && port <= 65535) {
              resolve({
                url: pgAdminUrl(port),
                'APP-Service-Start-PID': runningPid
              })
              return
            }
          }
          if (runningPid) {
            await this._stopPGAdmin()
          }
        }

        const postgreSqlPort = postgresqlPortFromConfig(
          await readFile(join(dataDir, 'postgresql.conf'), 'utf-8')
        )
        const logDir = join(paths.root, 'log')
        await mkdirp(paths.data)
        await mkdirp(logDir)
        if (!existsSync(paths.venv)) {
          await spawnPromiseWithEnv(python.bin, ['-m', 'venv', paths.venv], { shell: false })
        }
        if (!existsSync(paths.python)) {
          throw new Error('pgAdmin virtual environment Python was not created')
        }

        let packageRoot = ''
        try {
          packageRoot = await this.pgAdminPackageRoot(paths.python)
        } catch {}
        if (!packageRoot) {
          await spawnPromiseWithEnv(
            paths.python,
            ['-m', 'pip', 'install', '--disable-pip-version-check', PGADMIN4_PACKAGE],
            { shell: false }
          )
          packageRoot = await this.pgAdminPackageRoot(paths.python)
        }

        const port = await findPgAdminPort()
        await writeFile(paths.port, `${port}`)
        await writeFile(join(packageRoot, 'config_local.py'), pgAdminConfigContent(paths.data, port))

        if (firstStart) {
          const admin = credentials!
          await writeFile(paths.servers, pgAdminServersContent(postgreSqlPort))
          await spawnPromiseWithEnv(paths.python, [join(packageRoot, 'setup.py'), 'setup-db'], {
            shell: false,
            env: {
              PGADMIN_SETUP_EMAIL: admin.email,
              PGADMIN_SETUP_PASSWORD: admin.password
            }
          })
          await spawnPromiseWithEnv(
            paths.python,
            [join(packageRoot, 'setup.py'), 'load-servers', paths.servers, '--user', admin.email],
            { shell: false }
          )
        }

        const started = await serviceStartSpawn({
          version: {
            typeFlag: version.typeFlag,
            version: 'pgadmin4',
            bin: paths.python,
            path: paths.root,
            num: null,
            enable: true,
            run: false,
            running: false
          },
          pidPath: paths.pid,
          baseDir: paths.root,
          bin: paths.python,
          execArgs: [join(packageRoot, 'pgAdmin4.py')],
          execEnv: {
            LC_ALL: global.Server.Local!,
            LANG: global.Server.Local!
          },
          on,
          waitTime: 2000,
          cwd: packageRoot,
          outFile: join(logDir, 'pgadmin4.start.out.log'),
          errFile: join(logDir, 'pgadmin4.start.err.log')
        })
        resolve({
          url: pgAdminUrl(port),
          'APP-Service-Start-PID': `${started['APP-Service-Start-PID']}`
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  _stopServer(
    version: SoftInstalled,
    DATA_DIR?: string
  ): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      const pgAdminPids = await this._stopPGAdmin().catch(() => [])
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const logFile = join(dbPath, 'pg.log')

      const doStop = async () => {
        try {
          await spawnPromiseWithEnv(bin, ['stop', '-D', dbPath, '-l', logFile], {
            cwd: dirname(bin),
            shell: false
          })
        } catch (e) {
          appDebugLog(`[PostgreSql][_stopServer][error]`, `${e}`).catch()
          console.log('PostgreSQL shutdown error: ', e)
          console.log('PostgreSQL shutdown error version: ', version, bin)
        }
      }

      if (!isWindows()) {
        const pidFile = join(dbPath, 'postmaster.pid')
        await doStop()
        const check = async (times = 0) => {
          if (times >= 10) {
            console.log('times out: ', times)
            return true
          }
          if (!existsSync(pidFile)) {
            console.log('times success: ', times)
            return true
          } else {
            await waitTime(1000)
            return await check(times + 1)
          }
        }
        await check()

        // 等待 postgres 进程完全退出（解决 macOS 共享内存未释放问题）
        if (isMacOS()) {
          const waitProcessExit = async (retryTimes = 0) => {
            if (retryTimes >= 15) {
              console.log('waitProcessExit timeout')
              return
            }
            try {
              const plist = await StopProcessListFetch()
              const postgresProcs = ProcessSearch('postgres', false, plist).filter(
                (p) =>
                  p.COMMAND.includes(dbPath) &&
                  !p.COMMAND.includes('grep ') &&
                  !p.COMMAND.includes('/bin/sh -c')
              )
              if (postgresProcs.length > 0) {
                console.log('PostgreSQL processes still running:', postgresProcs)
                await waitTime(1000)
                await waitProcessExit(retryTimes + 1)
              }
            } catch (e) {
              console.log('waitProcessExit error:', e)
            }
          }
          await waitProcessExit()
          // 额外等待确保共享内存释放
          await waitTime(500)
        }
      } else {
        await doStop()
      }

      const pids = new Set<string>()
      const appPidFile = this.appPidFile()
      if (existsSync(appPidFile)) {
        try {
          const pid = await this.readPidFromFile(appPidFile)
          if (pid) {
            pids.add(pid)
          }
        } catch {}
        TaskQueue.run(unlink, appPidFile).then().catch()
      }
      try {
        const pid = await this.readPidFromFile(join(dbPath, 'postmaster.pid'))
        if (pid) {
          pids.add(pid)
        }
      } catch {}
      if (version?.pid) {
        pids.add(`${version.pid}`)
      }
      pgAdminPids.forEach((pid) => pids.add(pid))
      on({
        'APP-Service-Stop-Success': true
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      return resolve({
        'APP-Service-Stop-PID': [...pids].map((p) => Number(p))
      })
    })
  }

  _startServer(version: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      const sendUserPass = false

      await mkdirp(global.Server.PostgreSqlDir!)

      const doRun = async () => {
        const baseDir = global.Server.PostgreSqlDir!
        if (isWindows()) {
          const execArgs = `-D "${dbPath}" -l "${logFile}" start`

          try {
            const res = await serviceStartExecCMD({
              version,
              pidPath: pidFile,
              baseDir,
              bin,
              execArgs,
              execEnv: '',
              on
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = res['APP-Service-Start-PID'].trim().split('\n').shift()!.trim()
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        } else {
          // Use `postgres -D` (foreground) instead of `pg_ctl ... start`, which forks
          // a daemon and exits — serviceStartSpawn backgrounds the process itself and
          // needs a foreground server. version.bin is pg_ctl; postgres is its sibling.
          // postgres reads postgresql.conf from the data dir and writes postmaster.pid.
          const postgresBin = join(dirname(bin), 'postgres')
          const execEnv: Record<string, string> = {
            LC_ALL: global.Server.Local!,
            LANG: global.Server.Local!
          }
          const execArgs = ['-D', dbPath]

          try {
            const res = await serviceStartSpawn({
              version,
              pidPath: pidFile,
              baseDir,
              bin: postgresBin,
              execArgs,
              execEnv,
              on,
              waitTime: 2000,
              // Preserve the old `pg_ctl -l pg.log` behaviour: server log → pg.log.
              outFile: logFile,
              errFile: logFile
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            await waitTime(1000)
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        }
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath) || (existsSync(dbPath) && readdirSync(dbPath).length === 0)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        const binDir = dirname(bin)
        if (isWindows()) {
          process.env.LC_ALL = global.Server.Local!
          process.env.LANG = global.Server.Local!
          await mkdirp(dbPath)
          const initDB = join(binDir, 'initdb.exe')
          try {
            const res = await spawnPromiseWithEnv(initDB, ['-D', dbPath, '-U', 'root'], {
              cwd: binDir,
              shell: false,
              env: {
                LC_ALL: global.Server.Local!,
                LANG: global.Server.Local!
              }
            })
            appDebugLog(
              `[PostgreSql][initdb][windows]`,
              JSON.stringify({
                dbPath,
                stdout: res.stdout,
                stderr: res.stderr
              })
            ).catch()
          } catch (e) {
            appDebugLog(
              `[PostgreSql][initdb][windows][error]`,
              JSON.stringify({
                dbPath,
                error: `${e}`
              })
            ).catch()
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
          const initDB = join(binDir, 'initdb')
          const command = `"${initDB}" -D "${dbPath}" -U root --locale=${global.Server.Local} --encoding=UTF8 && wait`
          console.log('global.Server.Local: ', global.Server.Local)
          try {
            await execPromiseWithEnv(command, {
              env: {
                LC_ALL: global.Server.Local!,
                LANG: global.Server.Local!
              }
            })
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          on({
            'APP-On-Log': AppLog(
              'error',
              I18nT('appLog.initDBDataDirFail', { error: `Data Dir ${dbPath} create faild` })
            )
          })
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dbPath }))
        })

        if (isWindows()) {
          let conf = await readFile(confFile, 'utf-8')
          let find = conf.match(/lc_messages = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_messages = '${global.Server.Local}'`)
          find = conf.match(/lc_monetary = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_monetary = '${global.Server.Local}'`)
          find = conf.match(/lc_numeric = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_numeric = '${global.Server.Local}'`)
          find = conf.match(/lc_time = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_time = '${global.Server.Local}'`)

          await writeFile(confFile, conf)
        }

        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  fetchLastedTag() {
    return new ForkPromise(async (resolve) => {
      try {
        const url = 'https://api.github.com/repos/pgvector/pgvector/tags?page=1&per_page=1'
        const res = await axios({
          url,
          method: 'get',
          proxy: this.getAxiosProxy()
        })
        const html = res.data
        let arr: any
        try {
          if (typeof html === 'string') {
            arr = JSON.parse(html)
          } else {
            arr = html
          }
        } catch {}
        resolve(arr?.[0]?.name)
      } catch {
        resolve('v0.7.4')
      }
    })
  }

  installPgvector(version: SoftInstalled, tag: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/pgsql-pgvector.sh')
      const copyfile = join(global.Server.Cache!, 'pgsql-pgvector.sh')
      if (existsSync(copyfile)) {
        await unlink(copyfile)
      }
      let content = await readFile(sh, 'utf-8')
      content = content.replace('##BIN_PATH##', dirname(version.bin)).replace('##BRANCH##', tag)
      await writeFile(copyfile, content)
      await chmod(copyfile, '0777')
      // const params = [copyfile]
      try {
        // ('zsh', params).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('postgresql')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `postgresql-${a.version}`,
            `pgsql`,
            'bin/pg_ctl.exe'
          )
          const zip = join(global.Server.Cache!, `postgresql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `postgresql-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `PostgreSQL-${a.version}`
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
        .filter((f) => f.startsWith('postgresql'))
        .map((f) => `lib/${f}/bin/pg_ctl`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl', 'postgresql'),
          versionMacportsFetch(fpms)
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
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
              enable: version !== null,
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^postgresql@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
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
        `"^postgresql\\d*$"`,
        (f) => {
          return f.includes('The most advanced open-source database available anywhere.')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/pg_ctl'))
        }
      )
      resolve(Info)
    })
  }
}

export default new Manager()
