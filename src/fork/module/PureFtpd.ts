import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { FtpItem, SoftInstalled } from '@shared/app'
import { execPromise, spawnPromiseMore, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
class Manager extends Base {
  constructor() {
    super()
    this.type = 'pure-ftpd'
  }

  init() {
    this.pidPath = join(global.Server.FTPDir!, 'pure-ftpd.pid')
  }

  initConf() {
    return this._initConf()
  }
  _initConf(): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      await mkdirp(global.Server.FTPDir!)
      const confFile = join(global.Server.FTPDir!, 'pure-ftpd.conf')
      if (!existsSync(confFile)) {
        let content = await readFile(join(global.Server.Static!, 'tmpl/pure-ftpd.conf'), 'utf-8')
        content = content.replace(new RegExp('##DIR##', 'g'), global.Server.FTPDir!)
        await writeFile(confFile, content)
        await writeFile(join(global.Server.FTPDir!, 'pure-ftpd.conf.default'), content)
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const confFile = await this._initConf()
      const bin = version.bin
      await execPromiseRoot([bin, confFile])
      await waitTime(500)
      let res: any = await execPromiseRoot(`ps aux | grep "pure-ftpd"`)
      res = res.stdout.toString()
      if (res.includes(`${bin} ${confFile}`)) {
        resolve(true)
        return
      }
      reject(new Error(I18nT('fork.startFail')))
    })
  }

  getPort() {
    return new ForkPromise(async (resolve) => {
      let port: any = 21
      const conf = join(global.Server.FTPDir!, 'pure-ftpd.conf')
      if (existsSync(conf)) {
        const content = await readFile(conf, 'utf-8')
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
    return new ForkPromise(async (resolve) => {
      const json = join(global.Server.FTPDir!, 'pureftpd.json')
      const all = []
      if (existsSync(json)) {
        try {
          const txt = await readFile(json, 'utf-8')
          const arr = JSON.parse(txt.toString())
          all.push(...arr)
        } catch (e) {}
      }
      resolve(all)
    })
  }

  async _delFtp(item: FtpItem, version: SoftInstalled) {
    const cwd = join(version.path, 'bin')
    const user = item.user
    const pdb = join(global.Server.FTPDir!, 'pureftpd.pdb')
    const passwd = join(global.Server.FTPDir!, 'pureftpd.passwd')
    const cammand = `./pure-pw userdel ${user} -f ${passwd} -F ${pdb} -m`
    try {
      await execPromise(cammand, { cwd })
    } catch (e) {}
  }

  delFtp(item: FtpItem, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = join(version.path, 'bin/pure-pw')
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      await this._delFtp(item, version)
      const json = join(global.Server.FTPDir!, 'pureftpd.json')
      const all = []
      if (existsSync(json)) {
        try {
          const txt = await readFile(json, 'utf-8')
          const arr = JSON.parse(txt.toString())
          all.push(...arr)
        } catch (e) {}
      }
      const findOld = all.findIndex((a) => a.user === item.user)
      if (findOld >= 0) {
        all.splice(findOld, 1)
      }
      await writeFile(json, JSON.stringify(all))
      resolve(true)
    })
  }

  addFtp(item: FtpItem, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = join(version.path, 'bin/pure-pw')
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      await this._delFtp(item, version)

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
        .then(async () => {
          const json = join(global.Server.FTPDir!, 'pureftpd.json')
          const all = []
          if (existsSync(json)) {
            try {
              const txt = await readFile(json, 'utf-8')
              const arr = JSON.parse(txt.toString())
              all.push(...arr)
            } catch (e) {}
          }
          const findOld = all.findIndex((a) => a.user === item.user)
          if (findOld >= 0) {
            all.splice(findOld, 1, item)
          } else {
            all.unshift(item)
          }
          await writeFile(json, JSON.stringify(all))
          resolve(true)
        })
        .catch(() => {
          reject(new Error(stdout.join('')))
        })
    })
  }
}

export default new Manager()
