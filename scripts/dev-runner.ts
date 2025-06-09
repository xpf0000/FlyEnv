import { createServer } from 'vite'
import { spawn, ChildProcess } from 'child_process'
import { build } from 'esbuild'
import _fs from 'fs-extra'
import _path from 'path'
// @ts-ignore
import _md5 from 'md5'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import viteConfig from '../configs/vite.config'
import esbuildConfig from '../configs/esbuild.config'

import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

global.require = require

const __dirname = dirname(fileURLToPath(import.meta.url))

const { copySync } = _fs

const execPromise = promisify(exec)

let restart = false
let electronProcess: ChildProcess | null

async function killAllElectron() {
  const sh = _path.resolve(__dirname, '../scripts/electron-kill.ps1')
  const scriptDir = _path.dirname(sh)
  console.log('sh: ', sh, scriptDir)
  const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath './electron-kill.ps1'; & './electron-kill.ps1'"`
  let res: any = null
  try {
    res = await execPromise(command, {
      cwd: scriptDir
    })
  } catch (e) {
    console.log('killAllElectron err: ', e)
  }
  let all: any = []
  try {
    all = JSON.parse(res?.stdout?.trim() ?? '[]')
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

async function launchViteDevServer(openInBrowser = false) {
  const config = openInBrowser ? viteConfig.serveConfig : viteConfig.serverConfig
  const server = await createServer({
    ...config,
    configFile: false
  })
  await server.listen()
}

function buildMainProcess() {
  return new Promise((resolve, reject) => {
    Promise.all([killAllElectron(), build(esbuildConfig.dev), build(esbuildConfig.devFork)])
      .then(() => {
        resolve(true)
      })
      .catch((e) => {
        console.log(e)
        reject(e)
      })
  })
}

function logPrinter(data: string[]) {
  let log = '\n'

  data = data.toString().split(/\r?\n/)
  data.forEach((line) => {
    log += `  ${line}\n`
  })

  if (/[0-9A-z]+/.test(log)) {
    console.log(log)
  }
}

function runElectronApp() {
  const args = ['--inspect=5858', 'dist/electron/main.mjs']
  electronProcess = spawn('electron', args, {
    stdio: 'pipe',
    shell: process.platform === 'win32'
  })
  electronProcess?.stderr?.on('data', (data) => {
    logPrinter(data)
  })

  electronProcess?.stdout?.on('data', (data) => {
    logPrinter(data)
  })

  electronProcess.on('close', () => {
    console.log('electronProcess close !!!')
    if (restart) {
      restart = false
      runElectronApp()
    }
  })
}

if (process.env.TEST === 'electron') {
  console.log('process.env.TEST electron !!!!!!')
  Promise.all([launchViteDevServer(), buildMainProcess()])
    .then(() => {
      runElectronApp()
    })
    .catch((err) => {
      console.error(err)
    })
}

if (process.env.TEST === 'browser') {
  launchViteDevServer(true).then(() => {
    console.log('Vite Dev Server Start !!!')
  })
}

process.on('SIGINT', async () => {
  console.log('Catch SIGINT，Cleaning Electron Process...')
  await killAllElectron()
  process.exit(0)
})

// 监听main 文件改变
let preveMd5 = ''
let fsWait = false
const next = (base: string, file?: string | null) => {
  if (file) {
    if (fsWait) return
    const currentMd5 = _md5(_fs.readFileSync(_path.join(base, file))) as string
    if (currentMd5 == preveMd5) {
      return
    }
    fsWait = true
    preveMd5 = currentMd5
    console.log(`${file}文件发生更新`)
    restart = true
    buildMainProcess()
      .then()
      .catch((err) => {
        console.error(err)
      })
    setTimeout(() => {
      fsWait = false
    }, 500)
  }
}
const mainPath = _path.resolve(__dirname, '../src/main/')
_fs.watch(
  mainPath,
  {
    recursive: true
  },
  (event, filename) => {
    next(mainPath, filename)
  }
)

const forkPath = _path.resolve(__dirname, '../src/fork/')
_fs.watch(
  forkPath,
  {
    recursive: true
  },
  (event, filename) => {
    next(forkPath, filename)
  }
)

const staticPath = _path.resolve(__dirname, '../static/')
_fs.watch(
  staticPath,
  {
    recursive: true
  },
  (event, filename) => {
    if (filename) {
      if (fsWait) return
      const from = _path.join(staticPath, filename)
      const currentMd5 = _md5(_fs.readFileSync(from)) as string
      if (currentMd5 == preveMd5) {
        return
      }
      fsWait = true
      preveMd5 = currentMd5
      const to = _path.resolve(__dirname, '../dist/electron/static/', filename)
      console.log(`${filename}文件发生更新`)
      console.log('Copy文件: ', from, to)
      copySync(from, to)
      setTimeout(() => {
        fsWait = false
      }, 500)
    }
  }
)
