import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { baseCompile } from '@intlify/message-compiler'

/** 在 VM 中注入 IPC/计时器验证控制器终态，同时编译 Vue 和所有语言文案。 */
async function main() {
  // 逐语言编译核心文案，确认解释/切换提示和 operation 插值不会因漏 key 失效。
  for (const locale of readdirSync('src/lang', { withFileTypes: true }).filter((entry) =>
    entry.isDirectory()
  )) {
    const setup = JSON.parse(readFileSync(`src/lang/${locale.name}/setup.json`, 'utf8'))
    for (const key of [
      'title',
      'description',
      'uacDescription',
      'helperDescription',
      'settingsHint',
      'disableOption',
      'disableHelper',
      'disableFailed',
      'elevated',
      'unselected',
      'operation',
      'timeout',
      'failed',
      'useUac',
      'useHelper'
    ]) {
      assert.equal(typeof setup.windowsPrivilege?.[key], 'string', `${locale.name}/${key}`)
      baseCompile(setup.windowsPrivilege[key], {
        onError: (error) => {
          throw error
        }
      })
    }
    assert.ok(setup.windowsPrivilege.description.includes('{operation}'), locale.name)
  }
  // 注入可控 IPC、计时器和弹窗，既不依赖真实窗口，也不发出系统授权请求。
  const requests: Array<{ command: string; args: unknown[] }> = []
  const listeners = new Map<string, (key: string, result: any) => void>()
  const timers = new Set<() => void>()
  const warnings: string[] = []
  const setup: Record<string, unknown> = {}
  const server: Record<string, unknown> = {}
  let repairs = 0
  const dialogs: Array<(result?: unknown) => void> = []
  const dependencies: Record<string, any> = {
    '@/util/IPC': {
      default: {
        send(command: string, ...args: unknown[]) {
          requests.push({ command, args })
          const key = String(requests.length)
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
    },
    '@/util/Index': { reactiveBind: (value: unknown) => value },
    '@/util/AsyncComponent': {
      AsyncComponentShow: () => new Promise((resolve) => dialogs.push(resolve))
    },
    '@/store/app': { AppStore: () => ({ config: { setup } }) },
    '@/store/helper': {
      default: {
        repair: async () => {
          repairs++
        }
      }
    },
    '@/util/Element': {
      MessageError() {},
      // 设置操作现在自行发送就绪通知；提供现有控制器用例所需的通知替身。
      MessageSuccess() {},
      MessageWarning: (value: string) => warnings.push(value)
    },
    '@lang/index': { I18nT: (key: string) => key }
  }
  const module = { exports: {} as any }
  const code = transformSync(
    readFileSync(
      'src/render/components/Setup/WindowsElevationMethod/Controller.ts',
      'utf8'
    ).replace("import('./Choice.vue')", "Promise.resolve({ default: 'Choice' })"),
    { loader: 'ts', format: 'cjs' }
  ).code
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id: string) => {
      assert.ok(dependencies[id], id)
      return { __esModule: true, ...dependencies[id] }
    },
    window: { Server: server },
    setTimeout: (callback: () => void) => {
      timers.add(callback)
      return callback
    },
    clearTimeout: (callback: () => void) => {
      timers.delete(callback)
    }
  })
  const controller = module.exports.default
  const respond = (id: number, result: any) => {
    const key = String(id)
    assert.ok(listeners.has(key), `Listener ${key}`)
    listeners.get(key)!(key, result)
  }
  const snapshot = (revision: number, method = 'uac') => ({
    revision,
    method,
    choiceVersion: 1,
    elevated: false
  })
  // 首次选择保存后业务请求拥有 Helper 安装；控制器不再并行 repair 导致取消后重弹。
  const first = controller.select('helper', false, 'first-choice')
  assert.equal(first, controller.select('helper', false, 'first-choice'))
  // 相同点击共享 Promise；不同目标不能“借用成功”误以为已切换/已停用。
  await assert.rejects(controller.select('uac'), /loading/)
  await assert.rejects(controller.disableHelper(), /loading/)
  assert.equal(requests.length, 1)
  respond(1, { code: 200 })
  assert.equal(controller.busy, true)
  respond(1, { code: 0, data: snapshot(1, 'helper') })
  await first
  assert.equal(repairs, 0, 'Business request owns first-use helper preparation')
  assert.equal(controller.busy, false)

  assert.equal(setup.windowsElevationMethod, 'helper')
  controller.apply(snapshot(0))
  assert.equal(setup.windowsElevationMethod, 'helper', 'Ignore stale broadcasts')
  // 停用失败只警告，保留 UAC；保存失败才保持旧偏好，设置修复与首次安装分开验证。
  const switched = controller.select('uac', true)
  respond(2, { code: 0, data: snapshot(2) })
  await Promise.resolve()
  respond(3, { code: 1, msg: 'Disable denied' })
  await switched
  assert.equal(setup.windowsElevationMethod, 'uac')
  assert.equal(warnings.length, 1)
  const failed = controller.select('helper')
  respond(4, { code: 1, msg: 'Save failed' })
  await assert.rejects(failed, /Save failed/)
  assert.equal(setup.windowsElevationMethod, 'uac')
  const repaired = controller.repair()
  respond(5, { code: 0, data: snapshot(3, 'helper') })
  await repaired
  assert.equal(repairs, 1)
  // 终态超时移除监听、恢复 busy；下一次进入页面不能承接过期 IPC。
  const timeout = controller.disableHelper()
  for (const callback of [...timers]) callback()
  await assert.rejects(timeout, /timeout/)
  assert.equal(listeners.size, 0)
  // The fake timer must remove its own fired handle, as the browser does.
  timers.clear()
  assert.equal(controller.busy, false)

  const flush = async () => {
    for (let index = 0; index < 10; index++) await Promise.resolve()
  }
  // 重发同一 choice 不重复 mount；新 choice 先卸载旧窗口，主进程取消能结束控件 Promise。
  controller.showChoice({ id: 'choice-a', operation: 'tools/rm' })
  controller.showChoice({ id: 'choice-a', operation: 'tools/rm' })
  await flush()
  assert.equal(dialogs.length, 1, 'Repeated presentations share one dialog')
  controller.showChoice({ id: 'choice-b', operation: 'tools/rm' })
  assert.equal(controller.choiceActive, false, 'A new request closes the stale dialog')
  dialogs[0]()
  await flush()
  respond(requests.length, { code: 0 })
  await flush()
  assert.equal(dialogs.length, 2, 'Re-entry presents the new request after cleanup')
  controller.dismissChoice('choice-b')
  assert.equal(controller.choiceActive, false)
  dialogs[1]()
  await flush()
  respond(requests.length, { code: 0 })
  await flush()
  assert.equal(listeners.size, 0)
  assert.equal(timers.size, 0)

  // 两个页面同时编译 script/template，覆盖控制器化后的 Vue 绑定及模板语法。
  for (const name of ['Choice.vue', 'index.vue']) {
    const filename = `src/render/components/Setup/WindowsElevationMethod/${name}`
    const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
    assert.equal(errors.length, 0)
    const script = compileScript(descriptor, { id: name })
    const result = compileTemplate({
      id: name,
      filename,
      source: descriptor.template!.content,
      compilerOptions: { bindingMetadata: script.bindings }
    })
    assert.equal(result.errors.length, 0)
  }
  console.log('Windows privilege renderer tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
