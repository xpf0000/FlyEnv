import { execPromise, chmod, copyFile, remove, uuid, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join, basename } from 'path'
import { spawn } from 'child_process'
import { isMacOS } from '@shared/utils'

export function runInTerminal(command: string) {
  return new ForkPromise(async (resolve, reject) => {
    if (isMacOS()) {
      // 转义命令中的特殊字符
      command = command.replace(/"/g, '\\"')
      const appleScript = `
        tell application "Terminal"
          if not running then
            activate
            do script "${command}" in front window
          else
            activate
            do script "${command}"
          end if
        end tell`

      let error: any = undefined
      const osa = spawn('osascript', ['-e', appleScript])
      osa.on('error', (err) => {
        error = err
      })
      osa.on('close', () => {
        console.log('close !!!')
        if (error) {
          reject(error)
        } else {
          resolve(true)
        }
      })
    } else {
      const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
      const exeSH = join(global.Server.Cache!, `${uuid()}.sh`)
      await copyFile(terminalSH, exeSH)
      await chmod(exeSH, '0755')

      try {
        await execPromise(`"${exeSH}" "${command}"`, {
          cwd: global.Server.Cache!
        })
        await remove(exeSH)
        resolve(true)
      } catch (e) {
        await remove(exeSH)
        return reject(e)
      }
    }
  })
}

export function openPathByApp(dir: string, app: 'Terminal') {
  return new ForkPromise(async (resolve, reject) => {
    if (isMacOS()) {
      let appleScript = ''
      if (app === 'Terminal') {
        appleScript = `tell application "Terminal"
  if not running then
    activate
    do script "cd " & quoted form of "${dir}" in front window
  else
    activate
    do script "cd " & quoted form of "${dir}"
  end if
end tell`
      }
      const scptFile = join(global.Server.Cache!, `${uuid()}.scpt`)
      await writeFile(scptFile, appleScript)
      await chmod(scptFile, '0777')
      try {
        await execPromise(`osascript ./${basename(scptFile)}`, {
          cwd: global.Server.Cache!
        })
        await remove(scptFile)
      } catch (e) {
        await remove(scptFile)
        return reject(e)
      }
      resolve(true)
    } else {
      const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
      const exeSH = join(global.Server.Cache!, `${uuid()}.sh`)
      await copyFile(terminalSH, exeSH)
      await chmod(exeSH, '0755')

      try {
        await execPromise(`"${exeSH}" "cd \\"${dir}\\""`, {
          cwd: global.Server.Cache!
        })
        await remove(exeSH)
        resolve(true)
      } catch (e) {
        await remove(exeSH)
        return reject(e)
      }
    }
  })
}
