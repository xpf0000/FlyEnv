import { join, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { MysqlGroupItem, SoftInstalled } from '@shared/app'
import { spawnPromiseMore, execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, writeFile, chmod, unlink, remove } from 'fs-extra'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      let cwd = ''
      if (existsSync(join(version.path, 'bin/mysqladmin'))) {
        cwd = join(version.path, 'bin')
      } else if (existsSync(join(version.path, 'sbin/mysqladmin'))) {
        cwd = join(version.path, 'sbin')
      } else if (version.bin === '/usr/libexec/mysqld' && existsSync('/usr/bin/mysqladmin')) {
        cwd = '/usr/bin'
      }
      if (!cwd) {
        reject(new Error('Init Password Failed'))
        return
      }
      console.log('_initPassword cwd: ', cwd)
      execPromise('./mysqladmin --socket=/tmp/mysql.sock -uroot password "root"', {
        cwd
      })
        .then((res) => {
          console.log('_initPassword res: ', res)
          resolve(true)
        })
        .catch((err) => {
          console.log('_initPassword err: ', err)
          reject(err)
        })
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`)
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
datadir=${dataDir}`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      const params = [
        `--defaults-file=${m}`,
        '--user=mysql',
        `--pid-file=${p}`,
        '--socket=/tmp/mysql.sock',
        `--log-error=${e}`,
        `--slow-query-log-file=${s}`
      ]
      let needRestart = false
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        params.push('--initialize-insecure')
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}
      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }
      const checkpid = async (time = 0) => {
        if (existsSync(p)) {
          console.log('time: ', time)
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            reject(new Error('Start Failed'))
          }
        }
      }
      try {
        if (needRestart) {
          const command = `${bin} ${params.join(' ')}`
          console.log('mysql start: ', command)
          on(I18nT('fork.command') + `: ${command}`)
          await execPromise(command)
          if (readdirSync(dataDir).length > 0) {
            await this._startServer(version).on(on)
            await this._initPassword(version)
          } else {
            await unlinkDirOnFail()
            reject(new Error('Start Failed'))
            return
          }
        } else {
          const command = `nohup ${bin} ${params.join(' ')} &`
          console.log('mysql start: ', command)
          on(I18nT('fork.command') + `: ${command}`)
          await execPromise(command)
          console.log('command end checkpid !!!')
          await checkpid()
        }
      } catch (e) {
        console.log('command error: ', e)
        if (needRestart) {
          await unlinkDirOnFail()
        }
        reject(e)
        return
      }
    })
  }

  stopGroupService(version: MysqlGroupItem) {
    console.log(version)
    return new ForkPromise(async (resolve, reject) => {
      const id = version?.id ?? ''
      const conf = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const serverName = 'mysqld'
      const command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20}'`
      console.log('_stopServer command: ', command)
      try {
        const res = await execPromise(command)
        const pids = res?.stdout?.trim()?.split('\n') ?? []
        const arr: Array<string> = []
        for (const p of pids) {
          if (p.includes(conf)) {
            arr.push(p.split(' ')[0])
          }
        }
        if (arr.length > 0) {
          const pids = arr.join(' ')
          const sig = '-TERM'
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        }
        await waitTime(500)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.stopGroupService(version)
      let bin = version.version.bin
      if (existsSync(join(version.version.path!, 'mysqld_safe'))) {
        bin = join(version.version.path!, 'mysqld_safe')
      } else if (existsSync(join(version.version.path!, 'bin/mysqld_safe'))) {
        bin = join(version.version.path!, 'bin/mysqld_safe')
      } else if (existsSync(join(version.version.path!, 'sbin/mysqld_safe'))) {
        bin = join(version.version.path!, 'sbin/mysqld_safe')
      }

      const id = version?.id ?? ''
      const m = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const dataDir = version.dataDir
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, `group/my-group-${id}.pid`)
      const s = join(global.Server.MysqlDir!, `group/my-group-${id}-slow.log`)
      const e = join(global.Server.MysqlDir!, `group/my-group-${id}-error.log`)
      const sock = join(global.Server.MysqlDir!, `group/my-group-${id}.sock`)
      const params = [
        `--defaults-file=${m}`,
        `--datadir=${dataDir}`,
        `--port=${version.port}`,
        `--pid-file=${p}`,
        '--user=mysql',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        `--socket=${sock}`
      ]
      if (version?.version?.flag === 'macports') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        const currentVersion = version.version!
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0755')
        const installdb = join(currentVersion.path!, 'bin/mysql_install_db')
        if (existsSync(installdb) && version.version.num! < 57) {
          bin = installdb
          params.splice(0)
          params.push(`--defaults-file=${m}`)
          params.push(`--datadir=${dataDir}`)
          params.push(`--basedir=${currentVersion.path}`)
          if (currentVersion?.flag === 'macports') {
            const defaultCnf = join(currentVersion.path!, 'my-default.cnf')
            if (!existsSync(defaultCnf)) {
              await execPromise(
                `echo '${global.Server.Password}' | sudo -S cp -f ${m} ${defaultCnf}`
              )
            }
            const enDir = join(currentVersion.path!, 'share')
            if (!existsSync(enDir)) {
              const shareDir = `/opt/local/share/${basename(currentVersion.path!)}`
              if (existsSync(shareDir)) {
                await execPromise(`echo '${global.Server.Password}' | sudo -S mkdir -p ${enDir}`)
                await execPromise(
                  `echo '${global.Server.Password}' | sudo -S cp -R ${shareDir}/* ${enDir}`
                )
                const langDir = join(enDir, basename(currentVersion.path!))
                await execPromise(`echo '${global.Server.Password}' | sudo -S mkdir -p ${langDir}`)
                const langEnDir = join(shareDir, 'english')
                await execPromise(
                  `echo '${global.Server.Password}' | sudo -S cp -R ${langEnDir} ${langDir}`
                )
              }
            }
          }
        } else {
          params.push('--initialize-insecure')
        }
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}
      console.log('mysql start: ', bin, params.join(' '))
      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = spawnPromiseMore(bin!, params)
      let success = false
      let checking = false
      const initPassword = () => {
        return new ForkPromise((resolve, reject) => {
          let cwd = ''
          if (existsSync(join(version.version.path!, 'bin/mysqladmin'))) {
            cwd = join(version.version.path!, 'bin/mysqladmin')
          } else if (existsSync(join(version.version.path!, 'sbin/mysqladmin'))) {
            cwd = join(version.version.path!, 'sbin/mysqladmin')
          } else if (
            version.version.bin === '/usr/libexec/mysqld' &&
            existsSync('/usr/bin/mysqladmin')
          ) {
            cwd = '/usr/bin/mysqladmin'
          }
          execPromise(`./mysqladmin -P${version.port} -S${sock} -uroot password "root"`, {
            cwd
          })
            .then((res) => {
              console.log('_initPassword res: ', res)
              resolve(true)
            })
            .catch((err) => {
              console.log('_initPassword err: ', err)
              reject(err)
            })
        })
      }
      async function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          try {
            await execPromise(`kill -9 ${spawn.pid}`)
          } catch (e) {}
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            try {
              await execPromise(`kill -9 ${spawn.pid}`)
            } catch (e) {}
          }
        }
      }
      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }
      promise
        .on(async (data) => {
          on(data)
          if (!checking) {
            checking = true
            await checkpid()
          }
        })
        .then(async (code) => {
          if (success) {
            resolve(code)
          } else {
            if (needRestart) {
              try {
                await this.startGroupServer(version).on(on)
                await initPassword()
                on(I18nT('fork.postgresqlInit', { dir: dataDir }))
                resolve(code)
              } catch (e) {
                await unlinkDirOnFail()
                reject(e)
              }
            } else {
              reject(code)
            }
          }
        })
        .catch(async (err) => {
          if (needRestart) {
            await unlinkDirOnFail()
          }
          reject(err)
        })
    })
  }
}
export default new Mysql()
