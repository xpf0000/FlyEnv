import { userInfo } from 'node:os'
import { join } from 'node:path'
import { writeFile, existsSync } from '@shared/fs-extra'
import { app, dialog } from 'electron'
export const AppStartErrorCallback = async (error: Error) => {
  const info = userInfo()
  const homedir = info.homedir
  const file = join(homedir, '.flyenv-launch-flag')
  if (!existsSync(file)) {
    await writeFile(file, `${error}`)
    app.relaunch()
    app.exit()
  } else {
    dialog.showErrorBox('Error: ', `${error}`)
  }
}

export const AppStartFlagChech = () => {
  const info = userInfo()
  const homedir = info.homedir
  const file = join(homedir, '.flyenv-launch-flag')
  return existsSync(file)
}
