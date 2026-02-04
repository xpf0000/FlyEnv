import { app } from 'electron'
import path from 'path'
import Launcher from './Launcher'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import fs from 'fs-extra' // 建议使用 fs-extra 处理文件夹复制

const __dirname = dirname(fileURLToPath(import.meta.url))

const appData = app.getPath('appData')
const oldPath = path.join(appData, 'PhpWebStudy')
const nowPath = path.join(appData, 'FlyEnv')

/**
 * 迁移逻辑：如果新文件夹不存在且旧文件夹存在，则进行同步复制
 */
try {
  if (!existsSync(nowPath) && existsSync(oldPath)) {
    console.log('Detected legacy data, migrating from PhpWebStudy to FlyEnv...')
    // 使用 copySync 同步复制整个目录，确保在应用完全启动前数据到位
    fs.copySync(oldPath, nowPath, {
      overwrite: false,
      errorOnExist: true
    })
    console.log('Migration successful.')
  }
} catch (err) {
  console.error('Data migration failed: ', err)
}

// 重要：强制将当前的 userData 指向 nowPath
// 这样无论 package.json 里的 name 是什么，都会使用 FlyEnv 目录
app.setPath('userData', nowPath)
app.setPath('sessionData', nowPath)

// 打印确认最终路径
console.log('Final userData path: ', app.getPath('userData'))

global.__static = path.resolve(__dirname, 'static/').replace(/\\/g, '\\\\')
global.launcher = new Launcher()

export default () => {}
