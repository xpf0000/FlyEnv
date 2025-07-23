import { createConnection } from 'net'
import { exec as Sudo } from '@shared/Sudo'
import { dirname, join, resolve as PathResolve } from 'path'
import is from 'electron-is'
import { isLinux, isMacOS } from '@shared/utils'
import { writeFile, stat } from '@shared/fs-extra'
import Helper from '../../fork/Helper'
import { ExecCommand } from '@shared/Exec'

const SOCKET_PATH = '/tmp/flyenv-helper.sock'
const Role_Path = '/tmp/flyenv.role'
const Role_Path_Back = '/usr/local/share/FlyEnv/flyenv.role'

let HadOpenInTerminal = false

class AppHelper {
  state: 'normal' | 'installing' | 'installed' = 'normal'
  version = 7
  check() {
    console.time('AppHelper check')
    return new Promise(async (resolve, reject) => {
      const stats = await stat(process.execPath)
      const role = `${stats.uid}:${stats.gid}`
      await writeFile(Role_Path, role)
      try {
        Helper.send('tools', 'writeFileByRoot', Role_Path_Back, role).catch()
      } catch {}
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
        if (isMacOS()) {
          const binDir = PathResolve(global.Server.Static!, '../../../../')
          const plist = join(binDir, 'plist/com.flyenv.helper.plist')
          const bin = join(binDir, 'helper/flyenv-helper')
          command = `cd "${join(binDir, 'helper')}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${plist}" "${bin}"`
          icns = join(binDir, 'icon.icns')
        } else if (isLinux()) {
          const binDir = PathResolve(global.Server.Static!, '../../../../')
          const bin = join(binDir, 'helper/flyenv-helper')
          command = `cd "${join(binDir, 'helper')}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${bin}"`
          icns = join(binDir, 'Icon@256x256.icns')
        }
      } else {
        if (isMacOS()) {
          const binDir = PathResolve(global.Server.Static!, '../../../build/')
          const plist = join(binDir, 'plist/com.flyenv.helper.plist')
          const bin = join(binDir, 'bin', global.Server.isArmArch ? 'arm' : 'x86', 'flyenv-helper')
          command = `cd "${dirname(bin)}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${plist}" "${bin}"`
          icns = join(binDir, 'icon.icns')
        } else if (isLinux()) {
          const binDir = PathResolve(global.Server.Static!, '../../../build/')
          const bin = join(binDir, 'bin', global.Server.isArmArch ? 'arm' : 'x86', 'flyenv-helper')
          const shDir = join(global.Server.Static!, 'sh')
          command = `cd "${shDir}" && sudo chmod 777 ./flyenv-helper-init.sh && sudo ./flyenv-helper-init.sh "${bin}"`
          icns = join(binDir, 'Icon@256x256.icns')
        }
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
          if (!HadOpenInTerminal) {
            HadOpenInTerminal = true
            ExecCommand.runInTerminal(command).catch()
          }
          this.state = 'normal'
          reject(e)
        })
    })
  }
}
export default new AppHelper()
