import { createServer } from 'vite'
import { spawn, ChildProcess } from 'child_process'
import { build } from 'esbuild'
import _fs, { copySync } from 'fs-extra'
import _path from 'path'
// @ts-ignore
import _md5 from 'md5'

import viteConfig from '../configs/vite.config'
import esbuildConfig from '../configs/esbuild.config'
import { DoFix } from './fix'

let restart = false
let electronProcess: ChildProcess | null

async function launchViteDevServer(openInBrowser = false) {
  const config = openInBrowser ? viteConfig.serveConfig : viteConfig.serverConfig
  const server = await createServer({
    ...config,
    configFile: false
  })
  await server.listen()
}

function buildMainProcess() {
  return new Promise(async (resolve, reject) => {
    await DoFix()
    Promise.all([
      build(esbuildConfig.dev),
      build(esbuildConfig.devFork),
      build(esbuildConfig.devHelper)
    ])
      .then(
        () => {
          try {
            if (electronProcess && !electronProcess.killed) {
              electronProcess.kill('SIGINT')
              if (electronProcess.pid) {
                process.kill(electronProcess.pid, 'SIGINT')
              }
              electronProcess = null
            }
          } catch (e) {
            console.log('close err: ', e)
          }
          resolve(true)
          console.log('buildMainProcess !!!!!!')
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
  electronProcess = spawn('electron', args)
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

// Watch for changes in main files
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
    console.log(`${file} file has been updated`)
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
      console.log(`${filename} file has been updated`)
      console.log('Copying file: ', from, to)
      copySync(from, to)
      setTimeout(() => {
        fsWait = false
      }, 500)
    }
  }
)
