import { basename, join } from 'path'
import { chmod, copyFile, execPromiseWithEnv, uuid, writeFile } from '../fork/Fn'
import { execPromise } from '@shared/child-process'
import { remove } from '@shared/fs-extra'
import { isLinux, isMacOS, isWindows } from '@shared/utils'

type ExecType = {
  runInTerminal: (command: string) => Promise<void>
}

function escapeShellArg(arg: string) {
  // First check if argument needs wrapping
  if (!arg.match(/[ "'\r\n]/)) return arg
  // Escape double quotes by backslash-escaping them, then wrap in double quotes
  return arg.replace(/'/g, `\\'`)
}

const runInTerminal = async (c: string) => {
  const command = escapeShellArg(c)
  if (isMacOS()) {
    const appleScript = `
        tell application "Terminal"
          if not running then
            activate
            do script '${command}' in front window
          else
            activate
            do script '${command}'
          end if
        end tell`
    const scptFile = join(global.Server.Cache!, `${uuid()}.scpt`)
    await writeFile(scptFile, appleScript)
    await chmod(scptFile, '0777')
    try {
      await execPromise(`osascript ./${basename(scptFile)}`, {
        cwd: global.Server.Cache!
      })
    } catch (e) {
      console.log('runInTerminal error', e)
    } finally {
      await remove(scptFile)
    }
    return
  }
  if (isLinux()) {
    const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
    const exeSH = join(global.Server.Cache!, `exec-by-terminal.sh`)
    await copyFile(terminalSH, exeSH)
    await chmod(exeSH, '0755')

    try {
      await execPromise(`"${exeSH}" '${command}'`, {
        cwd: global.Server.Cache!
      })
    } catch (e) {
      console.log('runInTerminal error', e)
    }
  }

  if (isWindows()) {
    try {
      await execPromiseWithEnv(`start powershell -NoExit -Command '${command}'`)
    } catch (e) {
      console.log('runInTerminal error', e)
    }
  }
}

export const ExecCommand: ExecType = {
  runInTerminal
}
