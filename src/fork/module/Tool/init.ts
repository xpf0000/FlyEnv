import { existsSync, mkdirp, readFile, readFileByRoot, writeFile, writeFileByRoot } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join, resolve as PathResolve } from 'path'
import { userInfo } from 'os'
import { isLinux, isMacOS } from '@shared/utils'
import Helper from '../../Helper'

export function initAllowDir(json: string) {
  return new ForkPromise(async (resolve) => {
    const jsonFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv.dir')
    await mkdirp(dirname(jsonFile))
    await writeFile(jsonFile, json)
    resolve(true)
  })
}

export function initFlyEnvSH() {
  return new ForkPromise(async (resolve, reject) => {
    const file = join(global.Server.UserHome!, isMacOS() ? '.zshrc' : '.bashrc')
    if (!existsSync(file)) {
      try {
        await writeFile(file, '')
      } catch {}
    }
    if (!existsSync(file)) {
      reject(new Error(`No found ${file} and create file failed`))
      return
    }
    let content = ''
    try {
      content = await readFileByRoot(file)
    } catch (e) {
      reject(e)
      return
    }
    const contentBack = content

    if (isMacOS()) {
      const shfile = `/Applications/FlyEnv.app/Contents/Resources/helper/flyenv.sh`
      if (!existsSync(shfile)) {
        const fileContent = await readFile(join(global.Server.Static!, 'sh/fly-env.sh'), 'utf-8')
        try {
          await writeFileByRoot(shfile, fileContent)
        } catch {}
        if (existsSync(shfile)) {
          const uinfo = userInfo()
          const user = `${uinfo.uid}:${uinfo.gid}`
          try {
            await Helper.send('tools', 'chmod', shfile, '777')
            await Helper.send('redis', 'logFileFixed', shfile, user)
          } catch {}
        }
      }

      const regex = new RegExp(
        `^(?!\\s*#)\\s*source\\s*"/Applications/FlyEnv\\.app/Contents/Resources/helper/flyenv\\.sh"`,
        'gmu'
      )
      if (!content.match(regex) && existsSync(file)) {
        content = content.trim() + `\nsource "${shfile}"`
      }
    } else if (isLinux()) {
      const binDir = PathResolve(global.Server.Static!, '../../../../')
      const shfile = join(binDir, 'helper/flyenv.sh')
      if (!existsSync(shfile)) {
        const fileContent = await readFile(join(global.Server.Static!, 'sh/fly-env.sh'), 'utf-8')
        try {
          await writeFileByRoot(shfile, fileContent)
        } catch {}
        if (existsSync(shfile)) {
          const uinfo = userInfo()
          const user = `${uinfo.uid}:${uinfo.gid}`
          try {
            await Helper.send('tools', 'chmod', shfile, '777')
            await Helper.send('redis', 'logFileFixed', shfile, user)
          } catch {}
        }
      }

      const regex = new RegExp(
        `^(?!\\s*#)\\s*source\\s*"/(.*?)/resources/helper/flyenv\\.sh"`,
        'gmu'
      )
      if (!content.match(regex) && existsSync(file)) {
        content = content.trim() + `\nsource "${shfile}"`
      }
    }

    if (content !== contentBack) {
      try {
        await writeFileByRoot(file, content)
      } catch {}
    }
    resolve(true)
  })
}
