import * as performanceDiagnostics from '../src/shared/PerformanceDiagnostics'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { runInNewContext } from 'node:vm'
import * as fallback from '../src/shared/WindowsHelperFallback'
import * as state from '../src/shared/WindowsHelperState'
import * as reason from '../src/shared/WindowsPrivilegeReason'
import * as timing from '../src/shared/OperationTiming'

/**
 * 加载真实统一权限入口，只注入文件 IO、令牌和授权运输；动作/路径验证、原因快照和
 * 计时仍使用生产实现。所有文件 API 都是内存替身，不写 hosts/注册表、不启动 UAC。
 * 用调用顺序证明 Node 拒绝访问后没有普通 PowerShell 重写，而不是仅检查源码字符串。
 */
export const testWindowsPrivilegeRouting = async () => {
  const ts = await import('typescript')
  const module = { exports: {} as any }
  const calls: string[] = []
  let nodeError: unknown
  let actionError: unknown
  let validationError: unknown
  let tokenError: unknown
  let elevated = false
  let method: state.WindowsElevationMethod = 'uac'
  const target = path.resolve('tmp/windows-privilege-routing/中文 PHP/hosts')
  const payload = '127.0.0.1 中文.test'
  const denied = (code: string) => Object.assign(new Error(code), { code })
  const validate = (...args: Parameters<typeof fallback.buildWindowsPrivilegeAction>) => {
    calls.push('validate')
    if (validationError) throw validationError
    return fallback.buildWindowsPrivilegeAction(...args)
  }
  const fileIO = async (name: string, value: unknown) => {
    calls.push(name)
    if (nodeError) throw nodeError
    return value
  }
  runInNewContext(ts.transpileModule(readFileSync('src/shared/WindowsPrivilegeOperation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module, exports: module.exports, Buffer,
    // main 提供的业务目录派生可信根，允许本测试的虚拟目标，不改变实际 global.Server。
    global: { Server: { BaseDir: path.resolve('data'), AppDir: path.resolve('app') } },
    require: (name: string) => {
      if (name === './PerformanceDiagnostics') return performanceDiagnostics
      if (name === 'node:path') return path
      if (name === 'node:fs/promises') return {
        mkdir: async () => { calls.push('mkdir') },
        writeFile: async (_file: string, content: string | Buffer) => {
          assert.equal(Buffer.isBuffer(content) ? content.toString('utf8') : content, payload)
          return await fileIO('node.write', undefined)
        },
        readFile: async () => await fileIO('node.read', '\uFEFF' + payload),
        rm: async () => await fileIO('node.rm', undefined)
      }
      if (name === './WindowsHelperFallback') return {
        ...fallback, buildWindowsPrivilegeAction: validate
      }
      if (name === './WindowsHelperState') return state
      if (name === './WindowsPrivilegeReason') return reason
      if (name === './OperationTiming') return timing
      if (name === './WindowsHelperIdentity' || name === './WindowsProcessSafety') return {}
      if (name === './EnvSync') return { default: {
        clean: async () => { calls.push('env.clean') },
        sync: async () => { calls.push('env.sync') }
      } }
      if (name === './WindowsPrivilege') return {
        isWindowsProcessElevated: async () => {
          calls.push('token')
          if (tokenError) throw tokenError
          return elevated
        },
        resolveWindowsPrivilege: async () => { calls.push('method'); return method },
        withWindowsElevationLease: async (action: () => Promise<unknown>, selected: string) => {
          assert.equal(selected, 'uac')
          calls.push('lease')
          try { return await action() } finally { calls.push('release') }
        }
      }
      if (name === './WindowsElevation') return {
        runWindowsAction: async (_script: string, admin: boolean) => {
          calls.push(admin ? 'action.uac' : 'action.ordinary')
          if (actionError) throw actionError
          return true
        }
      }
      throw new Error(`Unexpected routing dependency: ${name}`)
    }
  })
  const execute = module.exports.executeWindowsPrivilegeOperation
  const helper = async () => { calls.push('helper'); return true }
  const run = (fn = 'writeFileByRoot', args: unknown[] = [target, payload]) =>
    execute('tools', fn, args, helper)
  const reset = () => {
    calls.length = 0
    nodeError = actionError = validationError = tokenError = undefined
    elevated = false
    method = 'uac'
  }
  // 删除纯验证调用后检查分流的完整顺序，仍验证普通执行前重复校验没有被优化掉。
  const route = () => calls.filter((call) => call !== 'validate')
  assert.equal(await run(), true)
  assert.deepEqual(route(), ['mkdir', 'node.write'])
  assert.equal(calls.filter((call) => call === 'validate').length, 3)

  // EPERM/EACCES 和已结构化的拒绝访问都直接路由；计时不得再出现复核阶段。
  for (const error of [denied('EPERM'), denied('EACCES'),
    new state.AppHelperError('windows_permission_denied', 'denied')]) {
    reset()
    nodeError = error
    const stages: string[] = []
    await timing.withOperationTiming((event) => stages.push(event.stage), async () => {
      assert.equal(await run(), true)
    })
    assert.deepEqual(route(), ['mkdir', 'node.write', 'token', 'method', 'lease', 'action.uac', 'release'])
    assert(!stages.includes('ordinary.permission-recheck'))
  }
  reset()
  nodeError = denied('EPERM')
  method = 'helper'
  assert.equal(await run(), true)
  assert.deepEqual(route(), ['mkdir', 'node.write', 'token', 'method', 'helper'])

  // 明确的非权限错误原样返回，连令牌探测都不执行；参数/路径验证失败先于 IO。
  for (const code of ['ENOENT', 'EBUSY', 'ENOSPC', 'EIO']) {
    reset()
    nodeError = denied(code)
    await assert.rejects(run(), (error) => error === nodeError)
    assert.deepEqual(route(), ['mkdir', 'node.write'])
  }
  reset()
  validationError = new Error('Invalid path')
  await assert.rejects(run(), (error) => error === validationError)
  assert.deepEqual(route(), [])
  reset()
  nodeError = denied('EPERM')
  elevated = true
  await assert.rejects(run(), (error) => error === nodeError)
  assert.deepEqual(route(), ['mkdir', 'node.write', 'token'])
  reset()
  nodeError = denied('EPERM')
  tokenError = new Error('Token probe blocked')
  await assert.rejects(run(), (error) => error === tokenError)
  assert.deepEqual(route(), ['mkdir', 'node.write', 'token'])

  // 取消、未知终态和授权后共享锁失败都不切 Helper 或重放；真实执行器的 uncertain
  // digest/迟到结果回归仍在 optimization-test 中，这里只证明入口不绕过它。
  for (const code of ['elevation_uac_cancelled', 'elevation_status_timeout', 'helper_execution_failed'] as const) {
    reset()
    nodeError = denied('EPERM')
    actionError = new state.AppHelperError(code, 'action failed')
    await assert.rejects(run(), (error) => error === actionError)
    assert.deepEqual(route(), ['mkdir', 'node.write', 'token', 'method', 'lease', 'action.uac', 'release'])
  }
  // 同一入口的 Buffer/读/删除遵循相同规则；读成功仍保留 BOM 清理。
  for (const [fn, args, operation] of [
    ['writeBufferBase64ByRoot', [target, Buffer.from(payload).toString('base64')], 'node.write'],
    ['readFileByRoot', [target], 'node.read'],
    ['rm', [target], 'node.rm']
  ] as const) {
    reset()
    nodeError = denied('EACCES')
    assert.equal(await run(fn, [...args]), true)
    assert.deepEqual(route(), [...(operation === 'node.write' ? ['mkdir'] : []),
      operation, 'token', 'method', 'lease', 'action.uac', 'release'])
  }
  reset()
  assert.equal(await run('readFileByRoot', [target]), payload)
  assert.deepEqual(route(), ['node.read'])

  // 系统 PATH 原本就跳过普通写入；管理员则使用已有令牌，且两种成功都刷新环境。
  for (const admin of [false, true]) {
    reset()
    elevated = admin
    assert.equal(await run('setSystemPath', [[path.dirname(target)], {}]), true)
    assert.deepEqual(route(), admin
      ? ['token', 'action.ordinary', 'env.clean', 'env.sync']
      : ['token', 'method', 'lease', 'action.uac', 'release', 'env.clean', 'env.sync'])
  }
  console.log('Windows privilege direct authorization routing checks passed')
}
