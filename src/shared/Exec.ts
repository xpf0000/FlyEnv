import { basename, join } from 'path'
import { spawnPromise } from '@shared/child-process'
import { remove, chmod, copyFile, writeFile } from '@shared/fs-extra'
import { isLinux, isMacOS, isWindows, uuid, waitTime } from '@shared/utils'

type ExecType = {
  escapeCommand: (command: string) => string
  runInTerminal: (command: string) => Promise<void>
}

function escapeCommand(command: string) {
  // First check if argument needs wrapping
  if (!command.match(/[ "'\r\n]/)) return command
  // Escape double quotes by backslash-escaping them, then wrap in double quotes
  return command.replace(/"/g, '\\"').replace(/!\\/g, '! \\')
}

const runInTerminal = async (c: string) => {
  const command = escapeCommand(c)
  if (isMacOS()) {
    const appleScript = `tell application "Terminal"
  if not running then
    activate
    do script "${command}" in front window
  else
    activate
    do script "${command}"
  end if
end tell`
    const scptFile = join(global.Server.Cache!, `${uuid()}.scpt`)
    await writeFile(scptFile, appleScript.trim())
    await chmod(scptFile, '0755')
    try {
      await spawnPromise('osascript', [`./${basename(scptFile)}`], {
        cwd: global.Server.Cache!
      })
    } catch (e) {
      console.log('runInTerminal error', e)
    } finally {
      await waitTime(300)
      remove(scptFile).catch()
    }
    return
  }
  if (isLinux()) {
    const terminalSH = join(global.Server.Static!, 'sh/exec-by-terminal.sh')
    const exeSH = join(global.Server.Cache!, `${uuid()}.sh`)
    await copyFile(terminalSH, exeSH)
    await chmod(exeSH, '0755')

    console.log('runInTerminal exeSH: ', exeSH)
    console.log('runInTerminal command: ', command)

    try {
      const res = await spawnPromise('/bin/bash', [`./${basename(exeSH)}`, command], {
        cwd: global.Server.Cache!
      })
      console.log('runInTerminal res', res)
    } catch (e) {
      console.log('runInTerminal error', e)
    } finally {
      // await waitTime(300)
      // remove(exeSH).catch()
    }
    return
  }

  if (isWindows()) {
    try {
      await spawnPromise('start', ['powershell', '-NoExit', '-Command', `& {${command}}`])
    } catch (e) {
      console.log('runInTerminal error', e)
    }
  }
}

export const ExecCommand: ExecType = {
  escapeCommand,
  runInTerminal
}
