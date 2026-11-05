import { mkdirp, readFile, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import { isMacOS } from '@shared/utils'
import { updateShellProfiles } from './shellProfiles'

export function initAllowDir(json: string) {
  return new ForkPromise(async (resolve) => {
    const jsonFile = join(dirname(global.Server.AppDir!), 'bin/.flyenv.dir')
    await mkdirp(dirname(jsonFile))
    await writeFile(jsonFile, json)
    resolve(true)
  })
}

export function initFlyEnvSH() {
  return new ForkPromise(async (resolve) => {
    const shfile = join(global.Server.BaseDir!, 'shell/flyenv.sh')
    await mkdirp(dirname(shfile))
    await writeFile(shfile, await readFile(join(global.Server.Static!, 'sh/fly-env.sh'), 'utf8'))
    const quoted = shfile
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
    const source = `source "${quoted}"`

    // The Linux loader is bash/zsh compatible, so zsh users need it too.
    await updateShellProfiles(
      (content) => {
        // Replace the legacy install-directory integration with the user-owned file.
        content = content.replace(
          /^(?!\s*#)\s*source\s*"[^"\n]*\/(?:resources|Resources)\/helper\/flyenv\.sh".*$/gm,
          ''
        )
        if (!content.split('\n').includes(source)) content = content.trim() + `\n${source}`
        return content
      },
      isMacOS() ? ['.zshrc'] : ['.bashrc', '.zshrc']
    )
    resolve(true)
  })
}
