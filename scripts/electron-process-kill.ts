import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { powershellExecWithUnblock } from '../src/fork/util/Powershell'

const __dirname = dirname(fileURLToPath(import.meta.url))
const execPromise = promisify(exec)

async function ElectronKillWin() {
  const sh = resolve(__dirname, '../scripts/electron-kill.ps1')
  const scriptDir = dirname(sh)
  console.log('sh: ', sh, scriptDir)

  let res: any = null
  try {
    res = await powershellExecWithUnblock(sh, { cwd: scriptDir })
  } catch (e) {
    console.log('killAllElectron err: ', e)
  }
  let all: any = []
  try {
    all = JSON.parse(res?.trim() ?? '[]')
  } catch {}
  console.log('all: ', all)
  const arr: Array<string> = []
  if (all && !Array.isArray(all)) {
    all = [all]
  }
  for (const item of all) {
    arr.push(item.ProcessId)
  }
  console.log('_stopServer arr: ', arr)
  if (arr.length > 0) {
    const str = arr.map((s) => `/pid ${s}`).join(' ')
    await execPromise(`taskkill /f /t ${str}`)
  }
}

async function ElectronKill(child?: ChildProcess | null) {
  try {
    if (child && !child.killed) {
      child.kill('SIGINT')
      if (child.pid) {
        process.kill(child.pid, 'SIGINT')
      }
    }
  } catch (e) {
    console.log('ElectronKill err: ', e)
  }
}

export { ElectronKillWin, ElectronKill }
