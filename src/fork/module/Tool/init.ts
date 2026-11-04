import { existsSync, mkdirp, readFile, readFileByRoot, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { isMacOS } from '@shared/utils'

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

    const shfile = join(global.Server.BaseDir!, 'shell/flyenv.sh')
    await mkdirp(dirname(shfile))
    await writeFile(shfile, await readFile(join(global.Server.Static!, 'sh/fly-env.sh'), 'utf8'))
    // Replace the legacy install-directory integration with the user-owned file.
    content = content.replace(
      /^(?!\s*#)\s*source\s*"[^"\n]*\/(?:resources|Resources)\/helper\/flyenv\.sh".*$/gm,
      ''
    )
    const quoted = shfile
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
    const source = `source "${quoted}"`
    if (!content.split('\n').includes(source)) content = content.trim() + `\n${source}`

    if (content !== contentBack) await writeFile(file, content)
    resolve(true)
  })
}
