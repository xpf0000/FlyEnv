import { execPromiseWithEnv, existsSync } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'

const findIdePath = async (ideName: string) => {
  try {
    // 定义所有可能的注册表路径
    const registryPaths = [
      `HKLM\\SOFTWARE\\JetBrains\\${ideName}`,
      `HKLM\\SOFTWARE\\WOW6432Node\\JetBrains\\${ideName}`,
      `HKCU\\SOFTWARE\\JetBrains\\${ideName}`
    ]

    for (const regPath of registryPaths) {
      try {
        // 使用 /s 参数查询所有子项和值
        const { stdout } = await execPromiseWithEnv(`reg query "${regPath}" /s`)
        const lines = stdout.split('\n').map((line: string) => line.trim())

        let basePath = null

        for (const line of lines) {
          if (line.includes('InstallPath') || line.includes('(Default)')) {
            const pathMatch = line.match(/(InstallPath|\(Default\))\s+REG_SZ\s+(.+)/i)
            if (pathMatch) {
              basePath = pathMatch[2].trim()
              break // 找到路径后退出循环
            }
          }
        }

        if (basePath) {
          return formatExePath(basePath, ideName)
        }
      } catch {}
    }

    return null
  } catch (error) {
    console.error(`Error finding IDE path: ${error}`)
    return null
  }
}

const findToolboxIdePath = async (ideName: string) => {
  try {
    // 尝试获取 Toolbox 安装目录
    const { stdout } = await execPromiseWithEnv(
      `reg query "HKCU\\SOFTWARE\\JetBrains\\Toolbox" /v "InstallDir"`
    )
    const match = stdout.match(/InstallDir\s+REG_SZ\s+(.+)/i)
    if (!match) return null

    const toolboxPath = match[1].trim()
    const appsPath = `${toolboxPath}\\apps\\${ideName}\\ch-0`

    // 获取最新版本目录（按修改时间倒序）
    const { stdout: dirs } = await execPromiseWithEnv(`dir "${appsPath}" /AD /B /O-N`)
    const latestVersionDir = dirs.split('\r\n')[0].trim()
    if (!latestVersionDir) return null

    return formatExePath(`${appsPath}\\${latestVersionDir}`, ideName)
  } catch (error) {
    console.error(`Error finding Toolbox IDE path: ${error}`)
    return null
  }
}

// 统一格式化可执行文件路径
const formatExePath = (basePath: string, ideName: string) => {
  const exeMap: Record<string, string> = {
    phpstorm: 'phpstorm64.exe',
    pycharm: 'pycharm64.exe',
    intellijidea: 'idea64.exe',
    webstorm: 'webstorm64.exe',
    clion: 'clion64.exe',
    rider: 'rider64.exe',
    goland: 'goland64.exe',
    datagrip: 'datagrip64.exe',
    rubymine: 'rubymine64.exe',
    appcode: 'appcode64.exe'
  }

  const normalizedName = ideName.toLowerCase()
  const exeName = exeMap[normalizedName] || `${normalizedName}64.exe`
  const exePath = `${basePath}\\bin\\${exeName}`

  if (existsSync(exePath)) {
    return exePath
  }
  return null
}

const openWithIde = async (ideName: string, folderPath: string) => {
  try {
    let idePath = await findIdePath(ideName)
    if (!idePath) {
      idePath = await findToolboxIdePath(ideName)
    }

    if (!idePath) {
      console.error(`${ideName} not found`)
      return false
    }

    await execPromiseWithEnv(`"${idePath}" "${folderPath}"`)
    console.log(`Opened ${folderPath} with ${ideName}`)
    return true
  } catch (error) {
    console.error(`Error opening IDE: ${error}`)
    return false
  }
}

const getHBuilderXPath = async (): Promise<string | null> => {
  try {
    // 查询注册表
    const { stdout } = await execPromiseWithEnv(
      `reg query "HKCR\\hbuilderx\\shell\\open\\command" /ve`
    )

    // 提取路径（示例输出: "(Default) REG_SZ "D:\Program Files\HBuilderX\HBuilderX.exe" "%1""）
    const match = stdout.match(/"(.*?HBuilderX\.exe)"/i)
    if (match && match[1]) {
      return match[1] // 返回可执行文件完整路径
    }
    return null
  } catch {
    return null
  }
}

const openWithHBuilderX = async (targetPath: string): Promise<boolean> => {
  try {
    const hbuilderxPath = await getHBuilderXPath()
    if (!hbuilderxPath) {
      return false
    }
    await execPromiseWithEnv(`"${hbuilderxPath}" "${targetPath}"`)
    return true
  } catch {
    return false
  }
}

export function openPathByApp(
  dir: string,
  app:
    | 'PowerShell'
    | 'PowerShell7'
    | 'PhpStorm'
    | 'WebStorm'
    | 'IntelliJ'
    | 'PyCharm'
    | 'RubyMine'
    | 'GoLand'
    | 'HBuilderX'
    | 'RustRover'
) {
  return new ForkPromise(async (resolve, reject) => {
    let command = ''
    const JetBrains = [
      'PhpStorm',
      'WebStorm',
      'IntelliJ',
      'PyCharm',
      'RubyMine',
      'GoLand',
      'RustRover'
    ]
    if (JetBrains.includes(app)) {
      const res = await openWithIde(app, dir)
      if (res) {
        return resolve(true)
      }
      return reject(new Error(`${app} Not Found`))
    }
    if (app === 'HBuilderX') {
      const res = await openWithHBuilderX(dir)
      if (res) {
        return resolve(true)
      }
      return reject(new Error(`HBuilderX Not Found`))
    }
    if (app === 'PowerShell') {
      command = `cd "${dir}"`
      command = JSON.stringify(command).slice(1, -1)
      command = `start powershell -NoExit -Command "${command}"`
    } else if (app === 'PowerShell7') {
      command = `cd "${dir}"`
      command = JSON.stringify(command).slice(1, -1)
      command = `start pwsh.exe -NoExit -Command "${command}"`
    }
    try {
      await execPromiseWithEnv(command)
    } catch (e) {
      return reject(e)
    }
    resolve(true)
  })
}
