import { join } from 'path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { FtpItem, SoftInstalled } from '@shared/app'
import { createFolder, execPromise, execSyncFix, spawnPromiseMore, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
class Manager extends Base {
  constructor() {
    super()
    this.type = 'pure-ftpd'
  }

  init() {
    this.pidPath = join(global.Server.FTPDir!, 'pure-ftpd.pid')
  }

  initConf() {
    return new ForkPromise((resolve) => {
      this._initConf().then(resolve)
    })
  }
  _initConf() {
    return new ForkPromise((resolve) => {
      createFolder(global.Server.FTPDir!)
      const confFile = join(global.Server.FTPDir!, 'pure-ftpd.conf')
      if (!existsSync(confFile)) {
        let content = readFileSync(join(global.Server.Static!, 'tmpl/pure-ftpd.conf'), 'utf-8')
        content = content.replace(new RegExp('##DIR##', 'g'), global.Server.FTPDir!)
        writeFileSync(confFile, content)
        writeFileSync(join(global.Server.FTPDir!, 'pure-ftpd.conf.default'), content)
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const confFile = await this._initConf()
      const bin = version.bin
      const command = `echo '${global.Server.Password}' | sudo -S ${bin} ${confFile}`
      await execPromise(command)
      await waitTime(1000)
      let res: any = await execPromise(
        `echo '${global.Server.Password}' | sudo -S ps aux | grep 'pure-ftpd'`
      )
      res = res.stdout.toString()
      if (res.includes(`${bin} ${confFile}`)) {
        resolve(true)
        return
      }
      reject(new Error(I18nT('fork.startFail')))
    })
  }

  _stopServer(version: SoftInstalled) {
    console.log(version)
    return new ForkPromise(async (resolve) => {
      const confFile = join(global.Server.FTPDir!, 'pure-ftpd.conf')
      const command = `ps aux | grep 'pure-ftpd' | awk '{print $2,$11,$12}'`
      const res = await execPromise(command)
      const pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
      const arr = []
      for (const p of pids) {
        if (p.includes(`${confFile}`)) {
          arr.push(p.split(' ')[0])
        }
      }
      if (arr.length === 0) {
        resolve(true)
      } else {
        const pids = arr.join(' ')
        const sig = '-INT'
        try {
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        } catch (e) {}
        resolve(true)
      }
    })
  }

  getPort() {
    return new ForkPromise((resolve) => {
      let port: any = 21
      const conf = join(global.Server.FTPDir!, 'pure-ftpd.conf')
      if (existsSync(conf)) {
        const content = readFileSync(conf, 'utf-8')
        const reg = new RegExp('Bind(.*?),(.*?)\n', 'g')
        let result
        if ((result = reg.exec(content)) != null) {
          port = result[2].trim()
        }
      }
      resolve(port)
    })
  }

  getAllFtp() {
    return new ForkPromise((resolve) => {
      const json = join(global.Server.FTPDir!, 'pureftpd.json')
      const all = []
      if (existsSync(json)) {
        try {
          const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
          all.push(...arr)
        } catch (e) {}
      }
      resolve(all)
    })
  }

  _delFtp(item: FtpItem, version: SoftInstalled) {
    const cwd = join(version.path, 'bin')
    const user = item.user
    const pdb = join(global.Server.FTPDir!, 'pureftpd.pdb')
    const passwd = join(global.Server.FTPDir!, 'pureftpd.passwd')
    const cammand = `./pure-pw userdel ${user} -f ${passwd} -F ${pdb} -m`
    try {
      execSyncFix(cammand, { cwd })
    } catch (e) {}
  }

  delFtp(item: FtpItem, version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      console.log('delFtp: ', item, version)
      const bin = join(version.path, 'bin/pure-pw')
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      this._delFtp(item, version)
      const json = join(global.Server.FTPDir!, 'pureftpd.json')
      const all = []
      if (existsSync(json)) {
        try {
          const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
          all.push(...arr)
        } catch (e) {}
      }
      const findOld = all.findIndex((a) => a.user === item.user)
      if (findOld >= 0) {
        all.splice(findOld, 1)
      }
      writeFileSync(json, JSON.stringify(all))
      resolve(true)
    })
  }

  addFtp(item: FtpItem, version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      console.log('addFtp: ', item, version)
      const bin = join(version.path, 'bin/pure-pw')
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      this._delFtp(item, version)

      const dir = item.dir
      const dirStat = statSync(dir)

      const cwd = join(version.path, 'bin')
      const user = item.user
      const pass = item.pass
      const pdb = join(global.Server.FTPDir!, 'pureftpd.pdb')
      const passwd = join(global.Server.FTPDir!, 'pureftpd.passwd')

      const stdout: Array<string> = []
      const { promise, spawn } = spawnPromiseMore(
        './pure-pw',
        [
          'useradd',
          user,
          '-u',
          dirStat.uid,
          '-g',
          dirStat.gid,
          '-d',
          dir,
          '-F',
          pdb,
          '-f',
          passwd,
          '-m'
        ],
        {
          cwd
        }
      )

      promise
        .on((data) => {
          stdout.push(data)
          const txt = data.toString().trim()
          if (txt === 'Password:' || txt === 'Enter it again:') {
            spawn?.stdin?.write(`${pass}\n`)
          }
        })
        .then(() => {
          const json = join(global.Server.FTPDir!, 'pureftpd.json')
          const all = []
          if (existsSync(json)) {
            try {
              const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
              all.push(...arr)
            } catch (e) {}
          }
          const findOld = all.findIndex((a) => a.user === item.user)
          if (findOld >= 0) {
            all.splice(findOld, 1, item)
          } else {
            all.unshift(item)
          }
          writeFileSync(json, JSON.stringify(all))
          resolve(true)
        })
        .catch(() => {
          reject(new Error(stdout.join('')))
        })
    })
  }
}

export default new Manager()
