import { createConnection } from 'net'
import Sudo from '@shared/Sudo'
import { dirname, join, resolve as PathResolve } from 'path'
import logger from './Logger'
import is from 'electron-is'
import Helper from '../../fork/Helper'
import { userInfo } from 'os'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'

class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'
  version = 5
  check() {
    console.time('AppHelper check')
    return new Promise((resolve, reject) => {
      const client = createConnection(SOCKET_PATH)
      client.on('connect', () => {
        console.log('Connected to the server')
        client.end()
        try {
          client.destroySoon()
        } catch {}
        resolve(true)
        console.timeEnd('AppHelper check')
      })

      client.on('data', (data: any) => {
        console.log('Received server response:', data.toString())
      })

      client.on('end', () => {
        console.log('Disconnected from the server')
      })

      client.on('error', () => {
        try {
          client.destroySoon()
        } catch {}
        reject(new Error('Connect helper failed'))
        console.timeEnd('AppHelper check')
      })
    })
  }

  initHelper() {
    return new Promise((resolve, reject) => {
      const doChech = (time = 0) => {
        if (time > 9) {
          this.state = 'normal'
          reject(new Error('Install helper failed'))
          return
        }
        this.check()
          .then(() => {
            const vhostLogs = join(global.Server.BaseDir!, 'vhost/logs')
            const nginxLogs = join(global.Server.NginxDir!, 'common/logs')
            const apacheLogs = join(global.Server.ApacheDir!, 'common/logs')
            const uinfo = userInfo()
            const uid = uinfo.uid
            const gid = uinfo.gid
            try {
              Helper.send('tools', 'startService', `chown -R ${uid}:${gid} "${vhostLogs}"`)
                .then()
                .catch()
            } catch {}
            try {
              Helper.send('tools', 'startService', `chown -R ${uid}:${gid} "${nginxLogs}"`)
                .then()
                .catch()
            } catch {}
            try {
              Helper.send('tools', 'startService', `chown -R ${uid}:${gid} "${apacheLogs}"`)
                .then()
                .catch()
            } catch {}
            logger.info('[FlyEnv][initHelper][doChech] time: ', time)
            this.state = 'normal'
            resolve(true)
          })
          .catch(() => {
            setTimeout(() => {
              doChech(time + 1)
            }, 500)
          })
      }

      this.state = 'installing'
      let command = ''
      let icns = ``
      if (is.production()) {
        const binDir = PathResolve(global.Server.Static!, '../../../../')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(binDir, 'helper/flyenv-helper')
        command = `cd "${join(binDir, 'helper')}" && sudo ./postinstall.sh "${plist}" "${bin}"`
        icns = join(binDir, 'icon.icns')
      } else {
        const binDir = PathResolve(global.Server.Static!, '../../../build/')
        const plist = join(binDir, 'plist/com.flyenv.helper.plist')
        const bin = join(
          binDir,
          'bin',
          global.Server.isAppleSilicon ? 'arm' : 'x86',
          'flyenv-helper'
        )
        command = `cd "${dirname(bin)}" && sudo ./postinstall.sh "${plist}" "${bin}"`
        icns = join(binDir, 'icon.icns')
      }

      Sudo(command, {
        name: 'FlyEnv',
        icns: icns,
        dir: global.Server.Cache!
      })
        .then(({ stdout, stderr }) => {
          console.log('initHelper: ', stdout, stderr)
          this.state = 'installed'
          doChech()
        })
        .catch((e) => {
          console.log('initHelper err: ', e)
          this.state = 'normal'
          reject(e)
        })
    })
  }
}
export default new AppHelper()
