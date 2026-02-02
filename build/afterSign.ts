import type { AfterPackContext } from 'electron-builder'
import { dirname, join } from "node:path";
import _fs from 'fs-extra'

const { existsSync, mkdirp, copyFile, remove } = _fs

export default async function (configuration: AfterPackContext) {
  if (configuration.electronPlatformName !== "windows" && configuration.electronPlatformName !== "win32") {
    return
  }

  const appOutDir = configuration.appOutDir
  // 定位你的 helper 文件
  const helperPath = join(appOutDir, "resources/app.asar.unpacked/node_modules/helper/flyenv-helper.exe")
  if (existsSync(helperPath)) {
    try {
      const dest = join(appOutDir, "resources/helper-backup/flyenv-helper.exe")
      await mkdirp(dirname(dest))
      await copyFile(helperPath, dest)
      await remove(dirname(helperPath))
    } catch (e) {
      console.warn(`win copy helperPath File error: ${e}`)
    }
  } else {
    console.warn(`win helperPath File not found: ${helperPath}`)
  }
}
