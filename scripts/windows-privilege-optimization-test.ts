import * as performanceDiagnostics from '../src/shared/PerformanceDiagnostics'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { runInNewContext } from 'node:vm'
import { createWindowsNTFSProbe, buildWindowsVolumeQuery } from '../src/shared/WindowsVolume'
import { waitForWindowsBrokerLaunch } from '../src/shared/WindowsElevation'
import { isWindowsLaunchFailure } from '../src/shared/WindowsRunAs'
import * as runAs from '../src/shared/WindowsRunAs'
import { buildWindowsPipeClient } from '../src/shared/WindowsActionPipe'
import * as crypto from 'node:crypto'
import * as timing from '../src/shared/OperationTiming'
import { AppHelperError } from '../src/shared/WindowsHelperState'
import { testWindowsPrivilegeRouting } from './windows-privilege-routing-test'

/**
 * 无系统写入回归：真实生产算法配合注入的卷查询/子进程流，不启动 PowerShell 或 UAC。
 * 子进程替身只模拟 Node 的事件时序；原生 C# 另由 PowerShell 编译/AST 检查覆盖。
 */
export const testWindowsPrivilegeOptimizations = async () => {
  // 授权前路由与管道执行生命周期一起回归，防止省掉普通复核时绕过错误/未知写边界。
  await testWindowsPrivilegeRouting()
  console.log('Checking Windows volume query batching/cache/fallback')
  const queries: string[][] = []
  const probe = createWindowsNTFSProbe(async (drives) => {
    queries.push(drives)
    await Promise.resolve()
    return { C: 'NTFS', D: 'exFAT' }
  })
  const [batch, concurrent] = await Promise.all([
    probe(['c:\\env', 'C:/php', 'D:\\php', '\\\\server\\share', 'C:relative']),
    probe(['C:\\other'])
  ])
  assert.deepEqual(batch, [true, true, false, false, false])
  assert.deepEqual(concurrent, [true])
  assert.deepEqual(queries, [['C', 'D']])
  assert.deepEqual(await probe(['d:\\other', 'C:\\env']), [false, true])
  assert.equal(queries.length, 1, 'Known non-NTFS formats are cached too')
  let retries = 0
  const retryProbe = createWindowsNTFSProbe(async () => {
    if (++retries === 1) throw new Error('Volume unavailable')
    return { E: 'NTFS' }
  })
  assert.deepEqual(await retryProbe(['E:\\env']), [false])
  assert.deepEqual(await retryProbe(['E:\\env']), [true], 'Failures must not poison the cache')
  const missingProbe = createWindowsNTFSProbe(async () => ({}))
  assert.deepEqual(await missingProbe(['F:\\env']), [false])
  const clock = Date.now
  try {
    Date.now = () => clock() + 31_000
    await probe(['C:\\env'])
    assert.equal(queries.length, 2, 'Expired volume formats must be refreshed after remount')
  } finally { Date.now = clock }
  assert.throws(() => buildWindowsVolumeQuery(["C';exit"]), /local drive/)
  assert.doesNotMatch(buildWindowsVolumeQuery(['C', 'D']), /Get-Volume/)
  console.log('Checking Windows broker launch/result lifecycle')

  // 生产管道模块由 TypeScript 在进程内转换，避免 esbuild 编译服务的子进程。
  const ts = await import('typescript')
  let child: any
  let stdin = ''
  let spawnArgs: string[] = []
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(readFileSync('src/shared/WindowsActionPipe.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module, exports: module.exports, Buffer,
    setTimeout: (callback: () => void, duration: number) => setTimeout(callback, duration === 30_000 ? 20 : duration),
    clearTimeout,
    require: (name: string) => {
      if (name === './PerformanceDiagnostics') return performanceDiagnostics
      if (name === 'node:child_process') return { spawn: (_exe: string, args: string[]) => {
        spawnArgs = args; stdin = ''
        child = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
          killed: false, retained: false,
          kill() { this.killed = true }, unref() { this.retained = true }
        })
        child.stdin.on('data', (data: Buffer) => { stdin += data.toString('utf8') })
        return child
      } }
      if (name === './WindowsSystemPaths') return { windowsPowerShellEnv: () => ({}), resolveWindowsPowerShellPath: () => 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }
      if (name === './WindowsHelperState') return { AppHelperError }
      if (name === './OperationTiming') return timing
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })
  const create = module.exports.createWindowsActionPipe
  const options = {
    pipeName: 'FlyEnv.Test', nonce: 'test-nonce', elevated: true, maxBytes: 4096,
    payload: { script: 'PRIVATE_ACTION_CONTENT' },
    launch: { argumentsText: '-NoProfile -EncodedCommand FIXED_BOOTSTRAP' },
    onResult: () => {}
  }
  const pending = create(options)
  const broker = Buffer.from(stdin.split('\n')[0], 'base64').toString('utf8')
  const loader = Buffer.from(spawnArgs.at(-1)!, 'base64').toString('utf16le')
  assert(spawnArgs.join(' ').length < 4096, 'Broker source must not approach the Windows command-line limit')
  assert(!loader.includes('PRIVATE_ACTION_CONTENT'))
  assert(!broker.includes('PRIVATE_ACTION_CONTENT'), 'Private payload must only appear on stdin')
  assert(JSON.parse(stdin.split('\n')[1]).payload.script === 'PRIVATE_ACTION_CONTENT')
  assert.match(loader, /FlyEnvBrokerInput=\[IO.StreamReader\]::new/)
  assert.match(broker, /\$script:FlyEnvBrokerInput.ReadLine\(\)/)
  assert.match(broker, /WatchParent\(\$script:FlyEnvBrokerInput\)/)
  assert(broker.indexOf("ReadLine() -cne 'LAUNCH'") < broker.indexOf('[FlyEnvActionPipe]::Launch('),
    'The parent acknowledgement must precede client launch')
  assert.doesNotMatch(loader + broker, /\[Console\]::(?:InputEncoding|ReadLine)|Console.ReadLine\(/)
  assert.match(broker, /throw 'Invalid Windows action input frame'/)
  assert.match(broker, /RedirectStandardInput = true/)
  assert.match(broker, /RedirectStandardOutput = true/)
  assert.match(broker, /RedirectStandardError = true/)
  assert.match(broker, /WaitForConnectionAsync/)
  assert.match(broker, /FlyEnvActionPipe\]::Authenticate/)
  assert.match(broker, /TokenImpersonationLevel|GetTokenInformation/)
  child.stdout.write('READY\n')
  const pipe = await pending
  assert.equal(stdin.split('\n')[2], 'LAUNCH')
  child.stdout.write(JSON.stringify({ launch: { code: 1, diagnostic: {
    phase: 'launch', childStarted: false, nativeErrorCode: 1223
  } } }) + '\n')
  await assert.rejects(waitForWindowsBrokerLaunch(pipe.launchReady), (error: any) => {
    assert(isWindowsLaunchFailure(JSON.parse(error.stdout)))
    assert.equal(JSON.parse(error.stdout).nativeErrorCode, 1223)
    return true
  })
  // 首份退出诊断固定，后来的另一份不能覆盖取消/失败边界。
  child.stdout.write('{"launch":{"code":0,"diagnostic":{}}}\n')
  assert.equal((await pipe.launchReady).code, 1)
  pipe.close()
  assert(child.killed)

  const interrupted = create(options)
  child.stdout.write('READY\n')
  const interruptedPipe = await interrupted
  child.emit('exit', 1)
  await assert.rejects(waitForWindowsBrokerLaunch(interruptedPipe.launchReady), (error: any) =>
    error.code === 1 && !isWindowsLaunchFailure(JSON.parse(error.stdout))
  )
  interruptedPipe.close()

  let received = 0
  const late = create({ ...options, onResult: () => { received++ } })
  child.stdout.write('READY\n')
  const latePipe = await late
  await assert.rejects(waitForWindowsBrokerLaunch(latePipe.launchReady, 1), (error: any) => error.killed)
  assert(!child.killed, 'Waiting timeout must leave the authenticated late-result channel open')
  latePipe.retain()
  assert(child.retained)
  child.stdout.write('malformed\n')
  assert.equal(received, 0)
  child.stdout.write(JSON.stringify({ result: JSON.stringify({ nonce: 'test-nonce', ok: true }) }) + '\n')
  child.stdout.write('{"launch":{"code":0,"diagnostic":{"phase":"wait","childStarted":true}}}\n')
  await latePipe.resultReady
  await waitForWindowsBrokerLaunch(latePipe.launchReady)
  assert.equal(received, 1)
  latePipe.close()

  const notReady = create(options)
  const rejected = assert.rejects(notReady, (error: any) => error.code === 'elevation_pipe_connect_failed')
  child.emit('error', new Error('Spawn denied'))
  await rejected
  assert(child.killed)
  const timedOut = create(options)
  await assert.rejects(timedOut, (error: any) => error.code === 'elevation_pipe_connect_failed')
  // 直接投递 data 模拟定时器与 READY 交错，不能因迟到 READY 自动启动可能修改系统的动作。
  child.stdout.emit('data', 'READY\n')
  assert(!stdin.endsWith('LAUNCH\n'))

  // 再加载真实执行器，替换管道运输以验证“退出诊断”和“认证终态”的组合分类。
  // 所有业务结果依然经生产 onResult 的 nonce/字段校验，不复制执行器算法。
  let next: any = { status: { code: 0, diagnostic: {} }, result: { ok: true, data: 'done' } }
  let latest: any
  let launches = 0
  const elevation = { exports: {} as any }
  runInNewContext(ts.transpileModule(readFileSync('src/shared/WindowsElevation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module: elevation, exports: elevation.exports, Buffer, process: { platform: 'win32' },
    setTimeout: (callback: () => void, duration: number) => setTimeout(callback,
      duration === 180_000 || duration === 1000 ? 5 : duration), clearTimeout,
    require: (name: string) => {
      if (name === './PerformanceDiagnostics') return performanceDiagnostics
      if (name === 'node:crypto') return crypto
      if (name === './WindowsSystemPaths') return { windowsPowerShellEnv: () => ({}), resolveWindowsPowerShellPath: () => 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }
      if (name === './WindowsHelperState') return { AppHelperError }
      if (name === './OperationTiming') return timing
      if (name === './WindowsRunAs') return runAs
      if (name === './utils') return { appDebugLog: async () => {} }
      if (name === './WindowsActionPipe') return { buildWindowsPipeClient, createWindowsActionPipe: async (plan: any) => {
        launches++
        let finish!: () => void
        const pipe = {
          resultReady: new Promise<void>((resolve) => { finish = resolve }),
          launchReady: Promise.resolve(next.status),
          closed: 0, retained: 0,
          close: () => { pipe.closed++ }, retain: () => { pipe.retained++ },
          deliver(result: object) { plan.onResult({ nonce: plan.nonce, ...result }); finish() }
        }
        latest = pipe
        if (next.result) pipe.deliver(next.result)
        return pipe
      } }
      throw new Error(`Unexpected executor dependency: ${name}`)
    }
  })
  const run = elevation.exports.runWindowsAction
  assert.equal(await run('success', true), 'done')
  assert.equal(latest.closed, 1)
  for (const [diagnostic, expected] of [
    [{ phase: 'launch', childStarted: false, nativeErrorCode: 1223 }, 'elevation_uac_cancelled'],
    [{ phase: 'wait', childStarted: true, nativeErrorCode: 73, pipeConnectFailed: true }, 'elevation_pipe_connect_failed'],
    [{ phase: 'launch', childStarted: false, exceptionType: 'InvalidOperationException' }, 'elevation_launch_failed']
  ] as const) {
    next = { status: { code: 1, diagnostic } }
    await assert.rejects(run(`failure-${expected}`, true), (error: any) => error.code === expected)
    assert.equal(latest.closed, 1)
    assert.equal(latest.retained, 0)
  }
  next = { status: { code: 1, diagnostic: { phase: 'wait', childStarted: true } } }
  await assert.rejects(run('uncertain-write', true), (error: any) => error.code === 'elevation_status_timeout')
  const uncertainPipe = latest
  assert.equal(uncertainPipe.retained, 1)
  assert.equal(uncertainPipe.closed, 0)
  const previousLaunches = launches
  await assert.rejects(run('uncertain-write', true), (error: any) => error.code === 'elevation_status_timeout')
  assert.equal(launches, previousLaunches, 'Unknown writes must be blocked before another launch')
  uncertainPipe.deliver({ ok: false, error: 'Late known failure', permissionDenied: false })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  assert.equal(uncertainPipe.closed, 1)
  next = { status: { code: 0, diagnostic: {} }, result: { ok: true, data: 'retried' } }
  assert.equal(await run('uncertain-write', true), 'retried', 'An authenticated late terminal clears replay protection')
  for (const denied of [false, true]) {
    next = { status: { code: 0, diagnostic: {} }, result: { ok: false, error: 'Failure', permissionDenied: denied } }
    await assert.rejects(run(`business-${denied}`, false), (error: any) =>
      error.code === (denied ? 'windows_permission_denied' : 'helper_execution_failed')
    )
  }
  next = { status: { code: 0, diagnostic: {} } }
  for (let index = 0; index < 2; index++) {
    await assert.rejects(run('readonly-no-result', false, { readOnly: true }), (error: any) => error.code === 'elevation_status_timeout')
    latest.deliver({ ok: true })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  console.log('Windows privilege optimization regression checks passed')
}
