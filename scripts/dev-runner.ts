import { createServer, build as viteBuild } from 'vite'
import { spawn, ChildProcess } from 'child_process'
import _fs from 'fs-extra'
import _path from 'path'
import _md5 from 'md5'

import viteConfig from '../configs/vite.config'
import { DoFix } from './fix'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { ElectronKill, ElectronKillWin } from './electron-process-kill'
import { isMacOS, isWindows } from '../src/shared/utils'

const require = createRequire(import.meta.url)

global.require = require

const __dirname = dirname(fileURLToPath(import.meta.url))

const { copySync } = _fs

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

let building = false
const buildCallBack: any = []

function buildMainProcess() {
  return new Promise(async (resolve, reject) => {
    if (building) {
      buildCallBack.push({
        resolve,
        reject
      })
      return
    }
    building = true
    await DoFix()
    let promise: Promise<any> | undefined
    if (isMacOS()) {
      console.log('isMacOS !!!')
      const config = viteConfig.vite.mac
      promise = Promise.all([
        viteBuild(config.dev),
        viteBuild(config.devFork),
        viteBuild(config.devHelper),
        ElectronKill(electronProcess)
      ])
    } else if (isWindows()) {
      console.log('isWindows !!!')
      const config = viteConfig.vite.win
      promise = Promise.all([viteBuild(config.dev), viteBuild(config.devFork), ElectronKillWin()])
    }
    if (!promise) {
      building = false
      buildCallBack.forEach((b: any) => {
        b.reject(new Error('No PLATFORM provided'))
      })
      buildCallBack.splice(0)
      reject(new Error('No PLATFORM provided'))
      return
    }
    promise
      .then(() => {
        building = false
        buildCallBack.forEach((b: any) => {
          b.resolve(true)
        })
        buildCallBack.splice(0)
        resolve(true)
      })
      .catch((e) => {
        console.log('buildMainProcess error', e)
        building = false
        buildCallBack.forEach((b: any) => {
          b.reject(e)
        })
        buildCallBack.splice(0)
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

  if (log.includes('EGL Driver message (Error) eglQueryDeviceAttribEXT: Bad attribute.')) {
    return
  }

  if (/[0-9A-z]+/.test(log)) {
    console.log(log)
  }
}

function runElectronApp() {
  // Use the correct file path for development
  const electronEntryPoint = 'dist/electron/main.dev.mjs'
  console.log(`Starting Electron with entry point: ${electronEntryPoint}`)

  electronProcess = spawn(`electron --inspect=5858 ${electronEntryPoint}`, {
    stdio: 'pipe',
    shell: isWindows()
  })
  electronProcess?.stderr?.on('data', (data) => {
    console.error('electronProcess stderr:', data.toString())
    logPrinter(data)
  })

  electronProcess?.stdout?.on('data', (data) => {
    console.log('electronProcess stdout:', data.toString())
    logPrinter(data)
  })

  electronProcess.on('error', (err) => {
    console.error(`electronProcess spawn error: ${err.message}`)
  })

  electronProcess.on('close', (code) => {
    console.log(`electronProcess closed with code: ${code}`)
    if (restart) {
      restart = false
      runElectronApp()
    }
  })
}

Promise.all([launchViteDevServer(), buildMainProcess()])
  .then(() => {
    // Copy static files for initial run (the plugin handles this during build)
    const staticPath = _path.resolve(__dirname, '../static/')
    const staticDest = _path.resolve(__dirname, '../dist/electron/static/')
    copySync(staticPath, staticDest)
    console.log('Initial static files copied')

    runElectronApp()
  })
  .catch((err) => {
    console.log('vite or build error: ')
    console.error(err)
  })

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
