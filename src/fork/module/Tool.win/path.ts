import { statSync } from 'fs'
import {
  execPromise,
  fetchRawPATH,
  handleWinPathArr,
  isNTFS,
  uuid,
  writePath,
  existsSync,
  mkdirp,
  readdir,
  realpathSync,
  removeByRoot,
  writeFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, isAbsolute, join } from 'path'
import type { SoftInstalled } from '@shared/app'

export function fetchPATH(): ForkPromise<any> {
  return new ForkPromise(async (resolve) => {
    const res: any = {
      allPath: [],
      appPath: []
    }
    const pathArr = await fetchRawPATH()
    const allPath = pathArr
      .filter((f) => existsSync(f))
      .map((f) => realpathSync(f))
      .filter((f) => existsSync(f) && statSync(f).isDirectory())
    res.allPath = Array.from(new Set(allPath))

    const dir = join(dirname(global.Server.AppDir!), 'env')
    if (existsSync(dir)) {
      let allFile = await readdir(dir)
      allFile = allFile
        .filter((f) => existsSync(join(dir, f)))
        .map((f) => realpathSync(join(dir, f)))
        .filter((f) => existsSync(f) && statSync(f).isDirectory())
      res.appPath = Array.from(new Set(allFile))
    }
    resolve(res)
  })
}

export function removePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    let oldPath: string[] = []
    let oldPathError: unknown
    try {
      oldPath = await fetchRawPATH(true)
    } catch (error) {
      oldPathError = error
    }
    if (oldPath.length === 0) {
      reject(oldPathError instanceof Error ? oldPathError : new Error('Fail'))
      return
    }

    console.log('removePATH oldPath 0: ', oldPath)

    const envDir = join(dirname(global.Server.AppDir!), 'env')
    const flagDir = join(envDir, typeFlag)
    try {
      await removeByRoot(flagDir)
    } catch {}
    console.log('removePATH flagDir: ', flagDir)

    oldPath = oldPath.filter((p) => {
      const a = p.includes(flagDir)
      const b = p.includes(item.path)
      if (a || b) {
        return false
      }
      let res = true
      if (isAbsolute(p)) {
        try {
          const realPath = realpathSync(p)
          if (realPath.includes(flagDir) || realPath.includes(item.path)) {
            res = false
          }
        } catch {}
      }
      return res
    })

    console.log('removePATH oldPath 1: ', oldPath)

    oldPath = oldPath.filter((p) => !p.startsWith(item.path))

    console.log('removePATH oldPath 2: ', oldPath)

    const dirIndex = oldPath.findIndex((s) => isAbsolute(s))
    const varIndex = oldPath.findIndex((s) => !isAbsolute(s))
    if (varIndex < dirIndex && dirIndex > 0) {
      const dir = oldPath[dirIndex]
      oldPath.splice(dirIndex, 1)
      oldPath.unshift(dir)
    }

    if (typeFlag === 'composer') {
      oldPath = oldPath.filter(
        (s) =>
          !s.includes('%COMPOSER_HOME%\\vendor\\bin') &&
          !s.includes('%APPDATA%\\Composer\\vendor\\bin')
      )
    }

    oldPath = handleWinPathArr(oldPath)

    console.log('removePATH oldPath 3: ', oldPath)

    const pathString = oldPath
    try {
      await writePath(pathString)
    } catch (e) {
      return reject(e)
    }

    const allPath = await fetchPATH()
    resolve(allPath)
  })
}

export function updatePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    let oldPath: string[] = []
    let rawOldPath: string[] = []
    let oldPathError: unknown
    try {
      oldPath = await fetchRawPATH(true)
      rawOldPath = oldPath.map((s) => {
        if (existsSync(s)) {
          return realpathSync(s)
        }
        return s
      })
    } catch (error) {
      oldPathError = error
    }
    if (oldPath.length === 0) {
      reject(oldPathError instanceof Error ? oldPathError : new Error('Fail'))
      return
    }
    console.log('oldPath 001: ', oldPath)
    console.log('rawOldPath: ', rawOldPath)

    const binDir = dirname(item.bin)
    /**
     * 初始化env文件夾
     * 删除标识文件夹
     * 如果原来没有 重新创建链接文件夹
     */
    const envDir = join(dirname(global.Server.AppDir!), 'env')
    if (!existsSync(envDir)) {
      await mkdirp(envDir)
    }
    const flagDir = join(envDir, typeFlag)
    console.log('flagDir: ', flagDir)
    try {
      await removeByRoot(flagDir)
    } catch {}

    if (!rawOldPath.includes(binDir)) {
      try {
        await execPromise(`mklink /J "${flagDir}" "${item.path}"`)
      } catch (e) {
        console.log('updatePATH mklink err: ', e)
      }
    }

    /**
     * 过滤掉此item
     */
    oldPath = oldPath.filter((o) => {
      const a = existsSync(o) && realpathSync(o).startsWith(item.path)
      return !a
    })

    /**
     * 获取env文件夹下所有子文件夹
     */
    let allFile = await readdir(envDir)
    allFile = allFile
      .filter((f) => existsSync(join(envDir, f)))
      .map((f) => join(envDir, f))
      .filter((f) => {
        let check = false
        try {
          const rf = realpathSync(f)
          check = existsSync(rf) && statSync(rf).isDirectory()
        } catch {
          check = false
        }
        return check
      })

    console.log('oldPath 002: ', oldPath)
    console.log('allFile: ', allFile)

    /**
     * 从原有PATH删除全部env文件夹
     */
    oldPath = oldPath.filter((o) => !o.includes(envDir))

    /**
     * 非NTFS的 无法创建软链接。allFile应该时空的。直接push item
     */
    if (!(await isNTFS(envDir)) || !(await isNTFS(item.path))) {
      allFile.push(item.path)
    }

    for (const envPath of allFile) {
      const rawEnvPath = realpathSync(envPath)
      /**
       * 从原有的oldPath过滤掉
       * 1. 文本地址包含软链接的
       * 2. 文本地址包含真实路径的
       * 3. 真实地址包含软链接或者真实路径的
       */
      oldPath = oldPath.filter((p) => {
        const a = p.includes(envPath)
        const b = p.includes(rawEnvPath)
        if (a || b) {
          return false
        }
        let res = true
        if (isAbsolute(p)) {
          try {
            const realPath = realpathSync(p)
            if (realPath.includes(envPath) || realPath.includes(rawEnvPath)) {
              res = false
            }
          } catch {}
        }
        return res
      })

      /**
       * 添加路径
       */
      oldPath.unshift(envPath)
      if (existsSync(join(envPath, 'bin'))) {
        oldPath.unshift(join(envPath, 'bin'))
      }
      if (existsSync(join(envPath, 'sbin'))) {
        oldPath.unshift(join(envPath, 'sbin'))
      }
      if (existsSync(join(envPath, 'python.exe'))) {
        const pip = join(envPath, 'Scripts/pip.exe')
        if (existsSync(pip)) {
          oldPath.unshift(dirname(pip))
        }
      }
    }

    if (typeFlag === 'composer') {
      const bat = join(binDir, 'composer.bat')
      if (!existsSync(bat)) {
        await writeFile(
          bat,
          `@echo off
php "%~dp0composer.phar" %*`
        )
      }
      const file = join(binDir, 'composer')
      if (!existsSync(file)) {
        await writeFile(
          file,
          `#!/usr/bin/env bash
exec php "$(dirname "\${BASH_SOURCE[0]}")/composer.phar" "$@"`
        )
      }
      let composer_bin_dir = ''
      try {
        const d = await execPromise(`echo %COMPOSER_HOME%\\Composer`)
        composer_bin_dir = d?.stdout?.trim()
        console.log('d: ', d)
      } catch {}
      if (composer_bin_dir && isAbsolute(composer_bin_dir)) {
        oldPath.push(`%COMPOSER_HOME%\\vendor\\bin`)
      } else {
        try {
          const d = await execPromise(`echo %APPDATA%\\Composer`)
          composer_bin_dir = d?.stdout?.trim()
          console.log('d: ', d)
        } catch {}
        if (composer_bin_dir && isAbsolute(composer_bin_dir)) {
          oldPath.push(`%APPDATA%\\Composer\\vendor\\bin`)
        }
      }
    }

    oldPath = handleWinPathArr(oldPath)

    console.log('oldPath 003: ', oldPath)

    const pathString = oldPath
    const otherVars: Record<string, string> = {}
    if (typeFlag === 'java') {
      otherVars['JAVA_HOME'] = flagDir
    } else if (typeFlag === 'gradle') {
      otherVars['GRADLE_HOME'] = flagDir
    } else if (typeFlag === 'erlang') {
      otherVars['ERLANG_HOME'] = flagDir
      const f = join(global.Server.Cache!, `${uuid()}.ps1`)
      await writeFile(
        f,
        `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
      )
      process.chdir(global.Server.Cache!)
      try {
        await execPromise(
          `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${f}'; & '${f}'"`
        )
      } catch {}
      await removeByRoot(f)
    }

    try {
      await writePath(pathString, otherVars)
    } catch (e) {
      return reject(e)
    }

    if (typeFlag === 'php') {
      const phpModule = (await import('../Php.win')).default
      try {
        await phpModule.getIniPath(item)
      } catch {}
    }

    const allPath = await fetchPATH()
    resolve(allPath)
  })
}

export function envPathList() {
  return new ForkPromise(async (resolve, reject) => {
    console.log('envPathList !!!!!')
    let oldPath: string[] = []
    let oldPathError: unknown
    try {
      oldPath = await fetchRawPATH(true)
    } catch (error) {
      oldPathError = error
    }
    if (oldPath.length === 0) {
      reject(oldPathError instanceof Error ? oldPathError : new Error('Fail'))
      return
    }
    const list: any = []
    for (const p of oldPath) {
      let raw = ''
      let error = false
      if (isAbsolute(p)) {
        try {
          raw = realpathSync(p)
          error = !existsSync(raw)
        } catch {
          error = true
        }
      } else if (p.includes('%') || p.includes('$env:')) {
        try {
          raw = (await execPromise(`echo ${p}`))?.stdout?.trim() ?? ''
          error = !raw || !existsSync(raw)
        } catch {
          error = true
        }
      }
      list.push({
        path: p,
        raw,
        error
      })
    }
    resolve(list)
  })
}

export function envPathUpdate(arr: string[]) {
  return new ForkPromise(async (resolve, reject) => {
    try {
      await writePath(arr)
    } catch (e) {
      console.log('envPathUpdate err: ', e)
      return reject(e)
    }
    resolve(true)
  })
}
