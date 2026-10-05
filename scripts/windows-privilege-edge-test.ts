import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { WindowsPrivilegeCoordinator } from '../src/main/core/WindowsPrivilegeCoordinator'
import { WindowsPrivilegeBridge } from '../src/main/core/WindowsPrivilegeBridge'
import { createAppHelper } from '../src/main/core/AppHelper'
import {
  setWindowsPrivilegeProvider,
  withWindowsElevationLease,
  withWindowsPrivilegeInteraction
} from '../src/shared/WindowsPrivilege'
import { runWindowsAction } from '../src/shared/WindowsElevation'
import { windowsHelperInstancePaths } from '../src/shared/WindowsHelperIdentity'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * 加载真实生产类而不是复制算法；仅替换 Electron/renderer 依赖以模拟失败。
 * 测试不会修改系统任务、安装 Helper 或弹真实 UAC，普通管道回归仍实跑 PowerShell。
 */
function loadSource(filename: string, deps: Record<string, unknown> = {}) {
  const module = { exports: {} as any }
  runInNewContext(
    transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    {
      module,
      exports: module.exports,
      require: (id: string) => ({ __esModule: true, ...(deps[id] as object) }),
      console,
      Error,
      Promise,
      setTimeout,
      clearTimeout
    }
  )
  return module.exports
}

async function main() {
  let saved: { method?: 'helper' | 'uac'; choiceVersion?: number } = {}
  let choiceId = ''
  const notificationErrors: unknown[] = []
  const coordinator = new WindowsPrivilegeCoordinator({
    read: () => saved,
    save: (method, choiceVersion) => {
      saved = { method, choiceVersion }
    },
    elevated: async () => false,
    prompt: (choice) => {
      choiceId = choice.id
      throw new Error('Window destroyed')
    },
    dismiss: () => {
      throw new Error('Dismiss failed')
    },
    publish: () => {
      throw new Error('Publish failed')
    },
    onNotificationError: (error) => notificationErrors.push(error)
  })
  // 选择已保存时，显示通知失败不能遗失终态或把请求误判成保存失败。
  const waiting = coordinator.resolve({ operation: 'tools/writeFileByRoot', interactive: true })
  await coordinator.select('uac', choiceId)
  assert.equal(await waiting, 'uac')
  assert.equal(saved.method, 'uac')
  assert.equal(notificationErrors.length, 3)
  saved = {}
  const cancelled = coordinator.resolve({ operation: 'tools/rm', interactive: true })
  const rejected = assert.rejects(
    cancelled,
    (error: any) => error.code === 'windows_choice_cancelled'
  )
  coordinator.cancel(choiceId)
  await rejected

  // 批量回收退出者的租约，不得在释放第一份时授予同一退出者的第二份。
  const owner = {},
    survivor = {}
  await coordinator.acquire(owner)
  let wronglyGranted = false
  const ownedNext = coordinator.acquire(owner).then(() => {
    wronglyGranted = true
  })
  const ownerRejected = assert.rejects(ownedNext, /requester exited/)
  const survivorNext = coordinator.acquire(survivor)
  coordinator.releaseOwner(owner)
  await ownerRejected
  assert.equal(wronglyGranted, false)
  coordinator.release(await survivorNext, survivor)

  // 响应发送失败也必须释放 activeLease；否则下一份跨服务权限请求永久排队。
  const bridge = new WindowsPrivilegeBridge(coordinator)
  bridge.handle(
    { type: 'windows-privilege-request', requestId: 'failed-reply', action: 'acquire' },
    owner,
    () => {
      throw new Error('IPC disconnected')
    }
  )
  for (let i = 0; i < 5; i++) await Promise.resolve()
  coordinator.release(await coordinator.acquire(survivor), survivor)
  coordinator.dispose()

  // 已健康的 Helper 不因状态窗口发送异常变成安装失败；不用实际运行安装器。
  const appHelper = createAppHelper({ appHelperCheck: async () => true })
  appHelper.onStatusMessage(() => {
    throw new Error('Status window destroyed')
  })
  assert.equal(await appHelper.initHelper(), true)
  assert.equal(appHelper.state, 'normal')

  // 真正拿到租约后读取新方式；用户切换期间排队的旧 Helper action 不能执行。
  let grant!: (lease: string) => void
  let method: 'helper' | 'uac' = 'helper'
  let actionRan = false
  const releases: string[] = []
  setWindowsPrivilegeProvider({
    resolve: async () => method,
    acquire: () =>
      new Promise((resolve) => {
        grant = resolve
      }),
    release: (lease) => releases.push(lease)
  })
  const queued = withWindowsPrivilegeInteraction(true, () =>
    withWindowsElevationLease(async () => {
      actionRan = true
    }, 'helper')
  )
  method = 'uac'
  grant('lease')
  await assert.rejects(queued, (error: any) => error.code === 'windows_authorization_required')
  assert.equal(actionRan, false)
  assert.deepEqual(releases, ['lease'])

  const dependencies = {
    '@/store/app': {
      AppStore: () => ({
        serverCurrent: () => ({ current: { version: '1', path: 'p', bin: 'b' } })
      })
    },
    '@/store/brew': {
      BrewStore: () => ({
        module: () => ({ startSingleFlight: (action: () => unknown) => action() })
      })
    }
  }
  const { Module } = loadSource('src/render/core/Module/Module.ts', dependencies)
  const service = Object.create(Module.prototype)
  service.isOnlyRunOne = true
  const intents: boolean[] = []
  service.installed = [
    {
      stop: async (interactive: boolean) => {
        intents.push(interactive)
        return 'Denied'
      }
    }
  ]
  await assert.rejects(service.onItemStart({ version: '1', path: 'p', bin: 'b' }, false), /Denied/)
  assert.deepEqual(intents, [false])
  // 前置失败阻断 exclusive version 切换，不能依赖 Promise.all 仅检查是否 reject。
  const { ModuleCustomer, ModuleCustomerExecItem } = loadSource('src/render/core/ModuleCustomer.ts')
  const customer = Object.create(ModuleCustomer.prototype)
  customer.isOnlyRunOne = true
  customer.isService = true
  customer.currentItemID = 'old'
  customer.item = [
    {
      stop: async (interactive: boolean) => {
        intents.push(interactive)
        return 'Denied'
      }
    }
  ]
  await assert.rejects(customer.onExecStart({ id: 'new' }, false), /Denied/)
  assert.equal(customer.currentItemID, 'old')

  const { ModuleInstalledItem } = loadSource(
    'src/render/core/Module/ModuleInstalledItem.ts',
    dependencies
  )
  const item = new ModuleInstalledItem({ version: '1', path: 'p', bin: 'b' })
  item._onStart = async (_item: unknown, interactive: boolean) => {
    assert.equal(interactive, false)
    throw new Error('Precondition denied')
  }
  assert.equal(await item.start(false), 'Precondition denied')
  assert.equal(item.running, false, 'Failed prerequisite must settle and clear running')
  const customerItem = new ModuleCustomerExecItem({})
  customerItem._onStart = async () => {
    throw new Error('Precondition denied')
  }
  assert.equal(await customerItem.start(false), 'Precondition denied')
  assert.equal(customerItem.running, false)

  // 重启只有停止成功才进入 start；取消权限不触发第二次窗口。
  let starts = 0
  item.stop = async () => 'Denied'
  item.start = async () => {
    starts++
    return true
  }
  assert.equal(await item.restart(), 'Denied')
  assert.equal(starts, 0)
  let callback!: (key: string, result: unknown) => void
  const removed: string[] = []
  const { ProjectItem } = loadSource('src/render/components/LanguageProjects/ProjectItem.ts', {
    '@/util/IPC': {
      default: {
        send: () => ({
          then: (fn: typeof callback) => {
            callback = fn
          }
        }),
        off: (key: string) => removed.push(key)
      }
    }
  })
  const project = Object.create(ProjectItem.prototype)
  project._state = { isRun: true, pid: '123', running: false }
  const stopping = project.stop(false, false)
  callback('stop', { code: 200 })
  assert.equal(project._state.running, true)
  assert.equal(removed.length, 0)
  callback('stop', { code: 1, msg: 'Denied' })
  assert.equal(await stopping, false)
  assert.equal(project._state.pid, '123')
  project.stop = async () => false
  project.start = async () => {
    starts++
    return true
  }
  assert.equal(await project.restart(), false)
  assert.equal(starts, 0)

  // 配置丢失不代表任务不存在：模拟只剩实例目录，验证仍运行受验证的停用脚本。
  const identity = { ...windowsHelperInstancePaths('S-1-5-21-1-2-3-4'), sid: 'S-1-5-21-1-2-3-4' }
  const accesses: string[] = []
  let disabled = 0
  const disable = loadSource('src/main/core/WindowsHelperDisable.ts', {
    '@shared/WindowsHelperIdentity': {
      getWindowsHelperIdentity: async () => identity,
      windowsHelperArguments: () => '--fixed'
    },
    '@shared/WindowsPrivilege': { isWindowsProcessElevated: async () => true },
    '@shared/WindowsElevation': {
      runWindowsAction: async () => {
        disabled++
        return true
      }
    },
    'node:fs/promises': {
      access: async (file: string) => {
        accesses.push(file)
      }
    }
  })
  assert.equal(await disable.disableWindowsHelper(), true)
  assert.deepEqual(accesses, [identity.instanceRoot])
  assert.equal(disabled, 1)

  if (process.platform === 'win32') {
    // launcher 可先退出，PowerShell 子进程稍后才写结果；一秒缓冲应接到可信终态。
    const launches: Promise<unknown>[] = []
    const result = await runWindowsAction<number>('$global:FlyEnvActionResult = 17', false, {
      launch: async (plan) => {
        launches.push(
          promisify(execFile)(plan.executable, plan.args, { windowsHide: true, timeout: 20_000 })
        )
      }
    })
    await Promise.all(launches)
    assert.equal(result, 17)
  }
  console.log(
    'Windows privilege notification, lease, mode-change, lifecycle and orphan-instance tests passed'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
