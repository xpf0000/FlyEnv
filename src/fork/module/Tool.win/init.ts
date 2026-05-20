import { copyFile, existsSync, mkdirp, readFile, writeFile, execPromiseWithEnv } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join } from 'path'
import EnvSync from '@shared/EnvSync'

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
    const psVersions = [
      { name: 'PowerShell 5.1', exe: 'powershell.exe', profileType: 'CurrentUserCurrentHost' },
      { name: 'PowerShell 7+', exe: 'pwsh.exe', profileType: 'CurrentUserAllHosts' }
    ]

    const flyenvScriptPath = join(dirname(global.Server.AppDir!), 'bin/flyenv.ps1')
    await mkdirp(dirname(flyenvScriptPath))
    await copyFile(join(global.Server.Static!, 'sh/fly-env.ps1'), flyenvScriptPath)

    for (const version of psVersions) {
      try {
        const profilePath = (
          await execPromiseWithEnv(`$PROFILE.${version.profileType}`, { shell: version.exe })
        ).stdout.trim()

        if (!profilePath || profilePath === '') continue

        // 写入配置（如果不存在）
        await mkdirp(dirname(profilePath))
        const loadCommand = `. "${flyenvScriptPath.replace(/\\/g, '/')}"\n`

        if (!existsSync(profilePath)) {
          await writeFile(profilePath, `# FlyEnv Auto-Load\n${loadCommand}`)
        } else {
          const content = await readFile(profilePath, 'utf-8')
          if (!content.includes(loadCommand.trim())) {
            await writeFile(profilePath, `${content.trim()}\n\n# FlyEnv Auto-Load\n${loadCommand}`)
          }
        }
      } catch (err) {
        console.log('initFlyEnvSH err: ', err)
      }
    }
    try {
      await EnvSync.sync()
      await execPromiseWithEnv(
        `if ((Get-ExecutionPolicy -Scope CurrentUser) -eq 'Restricted') {
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
}`,
        { shell: EnvSync.PowerShellPath || 'powershell.exe' }
      )
    } catch {}

    resolve(true)
  })
}
