import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { shouldOpenHelperInstaller } from '../src/shared/WindowsHelperState'

async function main() {
  let sends = 0
  let hostWrites = 0
  let failSend = false
  let elConfirm: () => Promise<any> = async () => undefined
  const listeners = new Map<string, (key: string, res: any) => void>()
  const dialogs: any[] = []
  const timers = new Set<() => void>()
  const ipc = {
    send() {
      if (failSend) throw new Error('IPC disconnected')
      const key = `request-${++sends}`
      return {
        key,
        then(callback: any) {
          listeners.set(key, callback)
        }
      }
    },
    off(key: string) {
      listeners.delete(key)
    }
  }
  const dependencies: Record<string, any> = {
    'element-plus': { ElMessageBox: { confirm: () => elConfirm() } },
    '@lang/index': { I18nT: (key: string) => key },
    '@/util/IPC': { default: ipc },
    '@/util/NodeFn': {
      dialog: {
        showMessageBox: async (value: any) => {
          dialogs.push(value)
        }
      }
    },
    '@/util/AsyncComponent': {},
    '@/util/Index': { reactiveBind: (value: any) => value },
    '@shared/WindowsHelperState': { shouldOpenHelperInstaller },
    '@/util/Host': {
      handleWriteHosts: async () => {
        hostWrites++
      }
    }
  }
  const module = { exports: {} as any }
  const code = transformSync(readFileSync('src/render/store/helper.ts', 'utf8'), {
    loader: 'ts',
    format: 'cjs'
  }).code
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id: string) => {
      assert.ok(dependencies[id], id)
      return { __esModule: true, ...dependencies[id] }
    },
    window: { Server: { isWindows: true } },
    setTimeout: (callback: () => void) => {
      timers.add(callback)
      return callback
    },
    clearTimeout: (callback: () => void) => {
      timers.delete(callback)
    }
  })
  const controller = module.exports.default
  const respond = (number: number, res: any) => {
    const key = `request-${number}`
    assert.ok(listeners.has(key))
    listeners.get(key)!(key, res)
  }
  const first = controller.repair()
  const second = controller.repair()
  assert.equal(sends, 1)
  assert.equal(controller.isInstallResultPending(), true)
  respond(1, { code: 200 })
  assert.equal(controller.isInstallResultPending(), true)
  respond(1, { code: 0 })
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(controller.isInstallResultPending(), false)
  assert.equal(listeners.size, 0)
  assert.equal(hostWrites, 1)
  assert.equal(timers.size, 0)

  const failed = controller.repair()
  respond(2, { code: 1, reason: 'helper_acl_invalid', msg: 'stage=publish: denied' })
  assert.equal(await failed, false)
  assert.match(dialogs[0].message, /stage=publish: denied/)
  assert.equal(listeners.size, 0)

  const cancelled = controller.repair()
  respond(3, { code: 1, reason: 'elevation_uac_cancelled' })
  assert.equal(await cancelled, false)
  assert.equal(dialogs.length, 1)

  failSend = true
  assert.equal(await controller.repair(), false)
  assert.equal(controller.isInstallResultPending(), false)
  assert.match(dialogs[1].message, /IPC disconnected/)
  failSend = false
  const timedOut = controller.repair()
  assert.equal(timers.size, 1)
  const timeout = [...timers][0]
  timers.delete(timeout)
  timeout()
  assert.equal(await timedOut, false)
  assert.match(dialogs[2].message, /flyenvHelperInstallTimeout/)
  assert.equal(listeners.size, 0)
  assert.equal(controller.isInstallResultPending(), false)
  const retry = controller.repair()
  respond(5, { code: 0 })
  assert.equal(await retry, true)
  assert.equal(timers.size, 0)

  let rejectConfirm: (error: any) => void = () => {}
  elConfirm = () =>
    new Promise((_resolve, reject) => {
      rejectConfirm = reject
    })
  controller.showNeedInstallDialog('helper_not_found')
  assert.equal(controller.show, true)
  const inFlight = controller.repair()
  assert.equal(controller.isInstallResultPending(), true)
  rejectConfirm(new Error('cancel'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(controller.isInstallResultPending(), true)
  assert.equal(controller.show, false)
  respond(6, { code: 0 })
  assert.equal(await inFlight, true)
  assert.equal(controller.isInstallResultPending(), false)

  console.log('windows-helper-renderer-controller-test: ok')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
