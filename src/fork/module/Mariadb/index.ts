import { join, basename, dirname, isAbsolute } from 'path'
import { existsSync, readdirSync } from 'fs'
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
  serviceStartExec,
  writeFile,
  mkdirp,
  chmod,
  remove,
  serviceStartExecCMD,
  zipUnpack,
  moveChildDirToParent,
  readFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import Helper from '../../Helper'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { compareVersions } from 'compare-versions'
import { parse as iniParse } from 'ini'
import { Connection, createConnection } from 'mysql2/promise'
import { format } from 'date-fns'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      let promise: Promise<any> | undefined
      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mariadb-admin.exe')
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

        promise = execPromise(
          `${basename(bin)} --defaults-file="${m}" --port=3306 --host="127.0.0.1" -uroot password "root"`,
          {
            cwd: dirname(bin)
          }
        )
      } else {
        promise = execPromise('./mariadb-admin --socket=/tmp/mysql.sock -uroot password "root"', {
          cwd: dirname(version.bin)
        })
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
      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      if (existsSync(appPidFile)) {
        const pid = (await readFile(appPidFile, 'utf-8')).trim()
        pids.add(pid)
        TaskQueue.run(remove, appPidFile).then().catch()
      }
      if (version?.pid) {
        pids.add(`${version.pid}`)
      }
      if (pids.size > 0) {
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
        const bin = join(dirname(version.bin), 'mariadb-admin.exe')
        const password = version?.rootPassword ?? 'root'

        const content = await readFile(m, 'utf8')
        const config = iniParse(content)
        const port = config?.mysqld?.port ?? 3306

        let success = false
        /**
         * ./mysqladmin.exe --defaults-file="C:\Program Files\PhpWebStudy-Data\server\mysql\my-5.7.cnf" -v --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" -uroot -proot001 shutdown
         */
        const command = `"${bin}" --defaults-file="${m}" --connect-timeout=1 --shutdown-timeout=1 --protocol=tcp --host="127.0.0.1" --port=${port} -uroot -p${password} shutdown`
        console.log('mysql _stopServer command: ', command)
        try {
          await execPromise(command)
          success = true
        } catch (e) {
          success = false
          console.log('mysql _stopServer command error: ', e)
        }

        if (!success) {
          const arr: string[] = Array.from(pids)
          const str = arr.map((s) => `/pid ${s}`).join(' ')
          try {
            await execPromise(`taskkill /f /t ${str}`)
          } catch {}
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
        'APP-Service-Stop-PID': [...pids].map((p) => Number(p))
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
          const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
          const s = join(global.Server.MariaDBDir!, 'slow.log')
          const e = join(global.Server.MariaDBDir!, 'error.log')
          const bin = version.bin

          const content = await readFile(m, 'utf8')
          const config = iniParse(content)
          const port = config?.mysqld?.port ?? 3306
          const ddir = config?.mysqld?.datadir ?? dataDir

          if (isWindows()) {
            const params = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              '--standalone'
            ]

            if (skipGrantTables) {
              params.push(`--datadir="${ddir}"`)
              params.push('--bind-address="127.0.0.1"')
              params.push(`--port=${port}`)
              params.push(`--enable-named-pipe`)
              params.push('--skip-grant-tables')
            }

            const execEnv = ``
            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExecCMD({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on,
                maxTime: 20,
                timeToWait: 1000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
            const params = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`
            ]
            if (version?.flag === 'macports') {
              params.push(`--lc-messages-dir="/opt/local/share/${basename(version.path)}/english"`)
            }

            if (skipGrantTables) {
              params.push(`--socket=/tmp/mysql.${version.version}.sock`)
              params.push(`--datadir="${ddir}"`)
              params.push('--bind-address="127.0.0.1"')
              params.push(`--port=${port}`)
              params.push('--skip-grant-tables')
            } else {
              params.push(`--socket=/tmp/mysql.sock`)
            }

            const bin = version.bin
            const execEnv = ''
            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExec({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on
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
          const binInstallDB = join(version.path, 'bin/mariadb-install-db.exe')

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
          let bin = join(version.path, 'bin/mariadb-install-db')
          if (!existsSync(bin)) {
            bin = join(version.path, 'bin/mysql_install_db')
          }
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mariadb')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `mariadb-${a.version}`, 'bin/mariadbd.exe')
          const zip = join(global.Server.Cache!, `mariadb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mariadb-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          const oldDir = join(
            global.Server.AppDir!,
            `mariadb-${a.version}`,
            `mariadb-${a.version}-winx64`,
            'bin/mariadbd.exe'
          )
          a.installed = existsSync(dir) || existsSync(oldDir)
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
          versionLocalFetch(setup?.mariadbd?.dirs ?? [], 'mariadbd-safe', 'mariadb'),
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
          return (
            existsSync(join('/opt/local/lib', name, 'bin/mariadbd-safe')) ||
            existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
          )
        }
      )
      resolve(Info)
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
        if (compareVersions(version.version!, '10.2.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error3: ', e)
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
        }
      } else {
        const bin = join(dirname(version.bin), 'mariadb')
        const socket = `/tmp/mysql.${version.version}.sock`

        if (compareVersions(version.version!, '10.2.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error3: ', e)
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch (e) {
            console.log('mysql.exe error2: ', e)
          }
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
      const port = config?.mysqld?.port ?? 3306
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
      const port = config?.mysqld?.port ?? 3306
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
          if (compareVersions(version.version!, '10.2.0') === 1) {
            await connection.query(
              `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
            )
          } else {
            await connection.query(
              `UPDATE mysql.user SET Password=PASSWORD('${data.password}') WHERE User='${data.user}';`
            )
          }
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
      const port = config?.mysqld?.port ?? 3306
      const password = version?.rootPassword ?? 'root'
      const error: any = []

      const time = format(new Date(), 'yyyy-MM-dd-HH-mm-ss')
      for (const database of databases) {
        const file = join(saveDir, `${database}-backup-${time}.sql`)
        const cammand = `"${bin}" -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --skip-add-locks --no-tablespaces ${database} > "${file}"`
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
