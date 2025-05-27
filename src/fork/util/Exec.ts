import type { ModuleExecItem } from '@shared/app'
import { existsSync } from 'fs'
import { mkdirp, readFile, remove, writeFile } from 'fs-extra'
import { dirname, join } from 'path'
import { waitPidFile } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { spawn } from 'child_process'

function spawnAsyncPromise(
  cammand: string,
  params: Array<any>,
  opt?: { [k: string]: any }
): ForkPromise<{
  stdout: string
  stderr: string
}> {
  return new ForkPromise((resolve) => {
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    const child = spawn(cammand, params, opt)
    let exit = false
    const onEnd = () => {
      if (exit) return
      exit = true
      resolve({
        stdout: Buffer.concat(stdout).toString().trim(),
        stderr: Buffer.concat(stderr).toString().trim()
      })
    }

    child?.stdout?.on('data', (data) => {
      stdout.push(data)
    })
    child?.stderr?.on('data', (err) => {
      stderr.push(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}

export async function customerServiceStartExec(
  version: ModuleExecItem
): Promise<{ 'APP-Service-Start-PID': string }> {
  const pidPath = version?.pidPath ?? ''
  if (pidPath && existsSync(pidPath)) {
    try {
      await remove(pidPath)
    } catch (e) {}
  }

  const baseDir = join(global.Server.BaseDir!, 'module-customer')
  await mkdirp(baseDir)

  const outFile = join(baseDir, `${version.id}.out.log`)
  const errFile = join(baseDir, `${version.id}.error.log`)

  let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-customer-exec.ps1'), 'utf8')

  let bin = ''
  if (version.commandType === 'file') {
    bin = version.commandFile
  } else {
    bin = join(baseDir, `${version.id}.start.ps1`)
    await writeFile(bin, version.command)
  }

  psScript = psScript
    .replace('#CWD#', dirname(bin))
    .replace('#BIN#', bin)
    .replace('#OUTLOG#', outFile)
    .replace('#ERRLOG#', errFile)

  const psName = `start-${version.id.trim()}.ps1`.split(' ').join('')
  const psPath = join(baseDir, psName)
  await writeFile(psPath, psScript)

  process.chdir(baseDir)
  let res: any
  let error: any
  try {
    res = await spawnAsyncPromise(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `\`"${psPath}\`"`],
      {
        shell: 'powershell.exe',
        cwd: baseDir
      }
    )
  } catch (e) {
    error = e
    if (!version.pidPath) {
      throw error
    }
  }

  if (!version.pidPath) {
    let pid = ''
    const stdout = res.stdout.trim() + '\n' + res.stderr.trim()
    const regex = /FlyEnv-Process-ID(.*?)FlyEnv-Process-ID/g
    const match = regex.exec(stdout)
    if (match) {
      pid = match[1]
    }
    if (pid) {
      return {
        'APP-Service-Start-PID': pid
      }
    } else {
      throw new Error(stdout)
    }
  }

  res = await waitPidFile(pidPath, 0, 20, 500)
  if (res) {
    if (res?.pid) {
      return {
        'APP-Service-Start-PID': res.pid
      }
    }
  }
  let msg = 'Start Fail: '
  if (error && error?.toString) {
    msg += '\n' + (error?.toString() ?? '')
  }
  if (existsSync(errFile)) {
    msg += '\n' + (await readFile(errFile, 'utf-8'))
  }
  throw new Error(msg)
}
