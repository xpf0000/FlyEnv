import { createServer } from 'vite'
import { spawn, ChildProcess, exec } from 'child_process'
import { build } from 'esbuild'
import _fs, { copySync } from 'fs-extra'
import _path from 'path'
// @ts-ignore
import _md5 from 'md5'

import viteConfig from '../configs/vite.config'
import esbuildConfig from '../configs/esbuild.config'

let restart = false
let electronProcess: ChildProcess | null

function execRoot(cammand: string) {
  return new Promise((resolve, reject) => {
    try {
      exec(
        cammand,
        (error, stdout, stderr) => {
          if (!error) {
            resolve({
              stdout: stdout?.toString() ?? '',
              stderr: stderr?.toString() ?? ''
            })
          } else {
            reject(error)
          }
        }
      )
    } catch (e) {
      reject(e)
    }
  })
}

async function killAllElectron() {
  const command = `wmic process get commandline,ProcessId | findstr "electron.exe"`
  console.log('_stopServer command: ', command)
  let res: any = null
  try {
    res = await execRoot(command)
  } catch (e) { }
  const pids = res?.stdout?.trim()?.split('\n') ?? []
  console.log('pids: ', pids)
  const arr: Array<string> = []
  for (const p of pids) {
    const pid = p.split(' ').filter((s: string) => {
      return !!s.trim()
    }).pop()
    arr.push(pid)
  }
  console.log('_stopServer arr: ', arr)
  if (arr.length > 0) {
    for (const pid of arr) {
      try {
        await execRoot(`wmic process where processid="${pid}" delete`)
      } catch (e) { }
    }
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
    Promise.all([build(esbuildConfig.dev), build(esbuildConfig.devFork)])
      .then(
        async () => {
          try {
            await killAllElectron()
          } catch (e) {
            console.log('close err: ', e)
          }
          resolve(true)
        },
        (err) => {
          console.log(err)
        }
      )
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
  const args = ['--inspect=5858', 'dist/electron/main.js']
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

// 监听main 文件改变
let preveMd5 = ''
let fsWait = false
const next = (base: string, file?: string | null) => {
  if (file) {
    if (fsWait) return
    const currentMd5 = _md5(_fs.readFileSync(_path.join(base, file)))
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
      const currentMd5 = _md5(_fs.readFileSync(from))
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
