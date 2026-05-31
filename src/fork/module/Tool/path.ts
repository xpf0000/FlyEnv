import { realpathSync, statSync } from 'fs'
import {
  execPromise,
  existsSync,
  mkdirp,
  readdir,
  readFileByRoot,
  removeByRoot,
  writeFile,
  writeFileByRoot
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join, resolve as PathResolve } from 'path'
import { shellEnv } from 'shell-env'
import { appDebugLog, isMacOS } from '@shared/utils'
import EnvSync from '@shared/EnvSync'
import type { SoftInstalled } from '@shared/app'
import { createPythonBinShims } from '../../util/PythonShim'

export function fetchEnvPath(): ForkPromise<string[]> {
  return new ForkPromise(async (resolve) => {
    const { PATH } = await shellEnv()
    const arr = PATH.trim().split(':') ?? []
    resolve(Array.from(new Set(arr)))
  })
}

export function fetchPATH(): ForkPromise<{ allPath: string[]; appPath: string[] }> {
  return new ForkPromise(async (resolve) => {
    const res: any = {
      allPath: [],
      appPath: []
    }
    const pathArr = await fetchEnvPath()
    const allPath = pathArr
      .filter((f) => existsSync(f))
      .map((f) => realpathSync(f))
      .filter((f) => existsSync(f) && statSync(f).isDirectory())
    res.allPath = Array.from(new Set(allPath))

    const dir = join(dirname(global.Server.AppDir!), 'env')
    if (existsSync(dir)) {
      const appPath = new Set<string>()
      const allFile = await readdir(dir)
      for (const f of allFile) {
        const envPath = join(dir, f)
        if (!existsSync(envPath)) {
          continue
        }
        try {
          const realEnvPath = realpathSync(envPath)
          if (existsSync(realEnvPath) && statSync(realEnvPath).isDirectory()) {
            appPath.add(realEnvPath)
          }
        } catch {}
        if (f !== 'python') {
          continue
        }
        for (const command of ['python', 'python3']) {
          const shim = join(envPath, 'bin', command)
          if (!existsSync(shim)) {
            continue
          }
          try {
            const realBin = realpathSync(shim)
            if (existsSync(realBin) && statSync(realBin).isFile()) {
              appPath.add(realBin)
            }
          } catch {}
        }
      }
      res.appPath = Array.from(appPath)
    }
    resolve(res)
  })
}

export function handleUpdatePath(param?: { zsh: string }) {
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
    const appDir = dirname(global.Server.AppDir!)
    const contentBack = content

    const regex = new RegExp(
      `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"(.*?)(${appDir})(.*?)\\$PATH"`,
      'gmu'
    )
    const regex2 = new RegExp(`^(?!\\s*#)\\s*export\\s*JAVA_HOME\\s*=\\s*"(.*?)"`, 'gmu')
    const regex3 = new RegExp(`^(?!\\s*#)\\s*export\\s*GRADLE_HOME\\s*=\\s*"(.*?)"`, 'gmu')
    const regexArr = [regex, regex2, regex3]
    regexArr.forEach((regex) => {
      let x: any = content.match(regex)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(`\n${x}`, '').replace(`${x}`, '')
      }
    })
    if (param) {
      const text = param.zsh
      content = content.trim() + text
    }
    if (content !== contentBack) {
      try {
        await writeFileByRoot(file, content)
      } catch {}
    }
    resolve(true)
  })
}

export function updatePATH(item: SoftInstalled, flag: string) {
  return new ForkPromise(async (resolve, reject) => {
    // Get the PATH environment variable array. Real absolute path array.
    const all = (await fetchPATH()).allPath
    // Path of the installed software
    const binPath = dirname(join(item.path, 'bin'))
    const envDir = join(dirname(global.Server.AppDir!), 'env')
    if (!existsSync(envDir)) {
      await mkdirp(envDir)
    }
    // Subfolder under the `env` folder for `flag` (e.g., 'php', 'nginx', 'mysql', etc.)
    const flagDir = join(envDir, flag)
    // Delete the subfolder
    try {
      await removeByRoot(flagDir)
    } catch {}
    appDebugLog('[updatePATH][binPath]', `${binPath}`).catch()
    appDebugLog('[updatePATH][all]', `${JSON.stringify(all, null, 2)}`).catch()
    if (flag === 'python') {
      try {
        await createPythonBinShims(join(flagDir, 'bin'), item.bin, item.version)
      } catch (e) {
        appDebugLog('[updatePATH][python shim][error]', `${e}`).catch()
        reject(e)
        return
      }
    } else if (!all.includes(binPath)) {
      // If the PATH environment variable array does not include the installed software path, create a symlink
      try {
        await execPromise(['ln', '-s', `"${binPath}"`, `"${flagDir}"`].join(' '))
      } catch (e) {
        appDebugLog('[updatePATH][ls -s][error]', `${e}`).catch()
      }
    }
    // Get all subfolders under the `env` folder (e.g., 'php', 'nginx', 'mysql', etc.)
    let allFile = await readdir(envDir)
    // Get valid paths
    allFile = allFile
      .filter((f) => existsSync(join(envDir, f)))
      .map((f) => join(envDir, f))
      // Only keep paths that exist and are directories
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
      .map((f) => {
        const arr: string[] = [f]
        if (existsSync(join(f, 'bin'))) {
          arr.push(join(f, 'bin'))
        } else if (existsSync(join(f, 'sbin'))) {
          arr.push(join(f, 'sbin'))
        }
        return arr
      })
      .flat()

    appDebugLog('[updatePATH][allFile]', `${JSON.stringify(allFile, null, 2)}`).catch()

    const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
    const param: { zsh: string } = {
      zsh: ''
    }
    if (allFile.length > 0) {
      // Handle Java path and add JAVA_HOME variable
      let java = allFile.find((f) => {
        const fl = f.toLowerCase()
        return (fl.includes('java') || fl.includes('jdk')) && fl.includes('/bin')
      })
      let other_zsh = ''
      if (java) {
        java = dirname(realpathSync(java))
        other_zsh += `\nexport JAVA_HOME="${java}"`
      }
      let gradle = allFile.find((f) => {
        const files = [join(f, 'gradle'), join(f, 'bin/gradle')]
        return files.some((s) => existsSync(s)) && f.includes('/bin')
      })
      if (gradle) {
        gradle = dirname(realpathSync(gradle))
        other_zsh += `\nexport GRADLE_HOME="${gradle}"`
      }
      param.zsh = `\nexport PATH="${aliasDir}:${allFile.join(':')}:$PATH"${other_zsh}\n`
    } else {
      param.zsh = `\nexport PATH="${aliasDir}:$PATH"\n`
    }
    appDebugLog('[updatePATH][allFile]', `${JSON.stringify(param, null, 2)}`).catch()
    try {
      // Write to the .zshrc file
      await handleUpdatePath(param)
    } catch (e) {
      appDebugLog('[updatePATH][error]', `${e}`).catch()
      reject(e)
      return
    }
    EnvSync.AppEnv = undefined
    const allPath = await fetchPATH()
    resolve(allPath)
  })
}
