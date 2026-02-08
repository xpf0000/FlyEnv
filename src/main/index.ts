import { app } from 'electron'
import path from 'path'
import Launcher from './Launcher'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import is from 'electron-is'
import { isLinux } from '@shared/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

global.__static = path.resolve(__dirname, 'static/').replace(/\\/g, '\\\\')
global.launcher = new Launcher()

export default () => {}
