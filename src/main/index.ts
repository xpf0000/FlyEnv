import { app } from 'electron'
import path from 'path'
import Launcher from './Launcher'
import { existsSync } from 'node:fs'
import is from 'electron-is'
import { isLinux } from '@shared/utils'
import { getElectronResourcePath } from './utils/AppRuntimePath'

if (is.production() && !isLinux()) {
  if (process.env?.PORTABLE_EXECUTABLE_DIR) {
    const portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'FlyEnv-Data')
    app.setPath('userData', portableDataPath)
    app.setPath('sessionData', portableDataPath)
  } else {
    const appData = app.getPath('appData')
    const oldPath = path.join(appData, 'PhpWebStudy')
    if (existsSync(oldPath)) {
      app.setPath('userData', oldPath)
      app.setPath('sessionData', oldPath)
    }
  }
}

global.__static = getElectronResourcePath('static').replace(/\\/g, '\\\\')
global.launcher = new Launcher()

export default () => {}
