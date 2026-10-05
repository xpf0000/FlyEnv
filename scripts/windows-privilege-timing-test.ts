import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SoftInstalled, AppHost } from '../src/shared/app'
import {
  withOperationTiming,
  timeOperation,
  markOperationStage,
  acceptOperationTimingLine,
  hasOperationTiming,
  type OperationTimingEvent
} from '../src/shared/OperationTiming'
import {
  isWindowsProcessElevated,
  setWindowsPrivilegeProvider,
  withWindowsPrivilegeInteraction,
  withWindowsElevationLease
} from '../src/shared/WindowsPrivilege'
import { WindowsPrivilegeCoordinator } from '../src/main/core/WindowsPrivilegeCoordinator'
import { WindowsPrivilegeBridge } from '../src/main/core/WindowsPrivilegeBridge'
import { WindowsPrivilegeClient } from '../src/fork/WindowsPrivilegeClient'
import { buildWindowsPrivilegeAction, buildWindowsActionPathGuard } from '../src/shared/WindowsHelperFallback'
import { runWindowsAction } from '../src/shared/WindowsElevation'
import {
  windowsSystemDirectory,
  resolveWindowsPowerShellPath
} from '../src/shared/WindowsSystemPaths'
import { buildWindowsRunAsLauncher } from '../src/shared/WindowsRunAs'
import { buildWindowsActionBootstrap } from '../src/shared/WindowsElevation'
import { buildWindowsActionPipeBroker, windowsActionBrokerBootstrap } from '../src/shared/WindowsActionPipe'
import { buildWindowsVolumeQuery } from '../src/shared/WindowsVolume'

type TestOptions = { mode: 'probe' | 'apply'; phpBin?: string }
type Report = {
  case: 'hosts' | 'path'
  mode: TestOptions['mode']
  status: 'ok' | 'error'
  scope: string
  events: OperationTimingEvent[]
  /** 首次 RunAs 调用前的准备总耗时；未调用 RunAs 时缺省，不把 0 当成实测。 */
  beforeRunAsMs?: number
  backendMs?: number
  errorCode?: string
  error?: string
}
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportsRoot = join(workspace, 'tmp', 'windows-privilege-timing')

/**
 * 测试专用数据目录不会使用现有 FlyEnv host.json/env；保留原值备份便于人工核对。
 * 数据目录只在明确的 workspace/tmp 下创建，绝不递归删除系统目录或 PHP 安装目录。
 */
const createFixture = async () => {
  const root = join(reportsRoot, randomUUID())
  const inside = relative(reportsRoot, root)
  assert(inside && !inside.startsWith('..') && !isAbsolute(inside))
  await mkdir(join(root, 'server', 'vhost'), { recursive: true })
  await mkdir(join(root, 'app'), { recursive: true })
  global.Server = {
    BaseDir: join(root, 'server'), AppDir: join(root, 'app'),
    Cache: join(root, 'cache'), Static: join(workspace, 'static'),
    WindowsElevationMethod: 'uac', WindowsElevationChoiceVersion: 1,
    WindowsPrivilegeRevision: 0, WindowsPrivilegeInteractive: true,
    WindowsHostsFile: join(windowsSystemDirectory(), 'drivers', 'etc', 'hosts'),
    isWindows: true, isMacOS: false, isLinux: false
  } as typeof global.Server
  return root
}

/**
 * 使用真实 coordinator/client/bridge，保持方式解析、FIFO 租约和 owner 校验。
 * 连线在同进程里，不宣称已测 Electron IPC；模拟的是用户已经选择 UAC 的状态。
 */
const connectPrivilegeProvider = () => {
  const coordinator = new WindowsPrivilegeCoordinator({
    read: () => ({ method: 'uac', choiceVersion: 1 }),
    save: () => { throw new Error('Timing tests cannot change authorization preference') },
    publish: () => {}, prompt: () => false, elevated: isWindowsProcessElevated
  })
  const bridge = new WindowsPrivilegeBridge(coordinator)
  const owner = {}
  const client: WindowsPrivilegeClient = new WindowsPrivilegeClient((message) =>
    bridge.handle(message, owner, (response) => client.handleMessage(response))
  )
  setWindowsPrivilegeProvider(client)
  return () => { bridge.detach(owner); coordinator.dispose() }
}

/** 阶段按时间排列；嵌套阶段是包含耗时，不能将所有行求和当作总耗时。 */
const recordTest = async (
  name: Report['case'], options: TestOptions,
  action: (root: string) => Promise<void>
): Promise<Report> => {
  assert.equal(process.platform, 'win32', 'These timing tests require Windows')
  const root = await createFixture()
  const disconnect = connectPrivilegeProvider()
  const report: Report = {
    case: name, mode: options.mode, status: 'ok', events: [],
    scope: options.mode === 'apply'
      ? 'Real production backend, system write and guarded restore; in-process IPC transport'
      : 'Real read-only preparation and pipe execution; no system write or UAC dialog'
  }
  try {
    await withOperationTiming((event) => report.events.push(event), () =>
      withWindowsPrivilegeInteraction(true, () => action(root))
    )
  } catch (error) {
    report.status = 'error'
    report.errorCode = (error as { code?: string }).code
    report.error = error instanceof Error ? error.message : String(error)
  } finally {
    disconnect()
    const backendStart = report.events.find((event) => event.stage === 'test.backend' && event.kind === 'start')
    const backendEnd = report.events.find((event) => event.stage === 'test.backend' && event.kind === 'end')
    const runas = report.events.find((event) => event.stage === 'launcher.runas-requested')
    report.backendMs = backendEnd?.durationMs
    if (backendStart && runas) report.beforeRunAsMs = Math.round((runas.atMs - backendStart.atMs) * 1000) / 1000
    // 只记录统计事件；系统原文备份在忽略的 tmp 内，不进入阶段报告。
    await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
    console.table(report.events.filter((event) => event.kind !== 'start'))
    console.log(`Report: ${join(root, 'report.json')} (${report.mode}, ${report.status})`)
  }
  return report
}

/**
 * 测试一：真实 Host.writeHosts(true, true)，覆盖站点列表、迁移、hosts 合并、
 * 普通权限失败/复核、UAC、写入及 DNS；实际成功后核对目标，再恢复原文件。
 * probe 使用真实系统 hosts 只读脚本和生产普通权限管道，绝不制造权限拒绝或写系统文件。
 */
export const testWindowsHostsWriteTiming = (options: TestOptions) => recordTest('hosts', options, async (root) => {
  const { Host } = await timeOperation('test.import-host-backend', () => import('../src/fork/module/Host'))
  const { saveHostList, fetchHostList } = await import('../src/fork/module/Host/HostFile')
  const { reconcileSystemHostsBlock } = await import('../src/fork/module/Host/SystemHostsBlock')
  const host = new Host()
  const domain = `flyenv-timing-${randomUUID()}.test`
  // node 类型不会生成 PHP/Web 服务配置；hosts 生成与 IPv6 写入依然走同一生产入口。
  await saveHostList([{ id: 1, type: 'node', name: domain, alias: '' } as AppHost])
  const originalBytes = await readFile(host.hostsFile)
  const original = originalBytes.toString('utf8')
  await writeFile(join(root, 'hosts-original.txt'), originalBytes)
  if (options.mode === 'probe') {
    await timeOperation('test.backend', async () => {
      const list = await timeOperation('hosts.load-site-list', () => fetchHostList())
      await timeOperation('hosts.migrate-vhosts', () => host.migrateVhostToId(list))
      await timeOperation('hosts.read-system-file', () => readFile(host.hostsFile, 'utf8'))
      await isWindowsProcessElevated()
      const context = { roots: [root], userDocuments: '' }
      const script = buildWindowsActionPathGuard([host.hostsFile]) +
        buildWindowsPrivilegeAction('tools', 'readFileByRoot', [host.hostsFile], context)
      await timeOperation('hosts.readonly-pipe', () => runWindowsAction(script, false, { readOnly: true }))
      markOperationStage('test.probe-complete-no-system-write')
    })
    return
  }
  const desired = `#X-HOSTS-BEGIN#\n127.0.0.1     ${domain}\n::1     ${domain}\n#X-HOSTS-END#`
  const expected = reconcileSystemHostsBlock(original, desired).content
  let completed = false
  try {
    await timeOperation('test.backend', () => host.writeHosts(true, true))
    completed = true
    assert.equal(await readFile(host.hostsFile, 'utf8'), expected, 'Hosts write must match the production merge')
  } finally {
    // 未知/失败终态不证明写入已结束；禁止清理动作与可能仍运行的管理员进程互相覆盖。
    if (completed) {
      await timeOperation('cleanup.hosts-restore', async () => {
        assert.equal(await readFile(host.hostsFile, 'utf8'), expected, 'External hosts change: restore skipped')
        const Helper = (await import('../src/fork/Helper')).default
        // 清理也经过同一执行器/租约/路径策略，但必须在批准后再次核对内容。
        // 打开期间禁止其他写入/删除，再用原始字节恢复，保护 BOM/非 UTF-8 原文。
        buildWindowsPrivilegeAction('tools', 'writeFileByRoot', [host.hostsFile, original], {
          roots: [root], userDocuments: ''
        })
        const target = `'${host.hostsFile.replace(/'/g, "''")}'`
        const script = buildWindowsActionPathGuard([host.hostsFile]) + `
$stream=[IO.File]::Open(${target}, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
try {
  $expected=[Convert]::FromBase64String('${Buffer.from(expected, 'utf8').toString('base64')}')
  if ($stream.Length -ne $expected.Length) { throw 'External hosts change: restore skipped' }
  $current=New-Object byte[] $expected.Length
  $offset=0
  while ($offset -lt $current.Length) {
    $count=$stream.Read($current, $offset, $current.Length-$offset)
    if ($count -eq 0) { throw 'Could not verify hosts before restore' }
    $offset += $count
  }
  if ([Convert]::ToBase64String($current) -cne [Convert]::ToBase64String($expected)) { throw 'External hosts change: restore skipped' }
  $original=[Convert]::FromBase64String('${originalBytes.toString('base64')}')
  $stream.Position=0
  $stream.SetLength(0)
  $stream.Write($original, 0, $original.Length)
  $stream.Flush()
  $global:FlyEnvActionResult=$true
} finally { $stream.Dispose() }
`
        const requireElevation = !(await isWindowsProcessElevated())
        await withWindowsElevationLease(() => runWindowsAction(script, requireElevation), 'uac')
        await Helper.send('host', 'dnsRefresh')
        assert.deepEqual(await readFile(host.hostsFile), originalBytes)
      })
    } else markOperationStage('cleanup.skipped-unconfirmed-hosts-write')
  }
})

/**
 * 测试二：真实 updatePATH(item, 'php')，覆盖 junction/卷探测、环境同步、原始
 * PATH 快照、优先级重建、冲突校验、提权写入、刷新与 PHP ini 处理。
 * apply 必须给出真实 PHP.exe；probe 只测卷/快照/令牌及普通权限管道查询。
 */
export const testWindowsSystemPathAddTiming = (options: TestOptions) => recordTest('path', options, async (root) => {
  const { isNTFS } = await timeOperation('test.import-path-backend', () => import('../src/fork/Fn'))
  const { readSystemPathDirect, mergeWindowsPathPriority } = await import('../src/fork/util/PATH.win')
  const { updatePATH } = await import('../src/fork/module/Tool.win/path')
  const Helper = (await import('../src/fork/Helper')).default
  const installDir = options.phpBin ? dirname(resolve(options.phpBin)) : join(root, 'app')
  if (options.mode === 'probe') {
    await timeOperation('test.backend', async () => {
      // 保持生产代码的串行和短路语义；同盘第二次探测应命中同一 isNTFS 缓存。
      const envVolume = await timeOperation('path.env-volume', () => isNTFS(root))
      if (envVolume) await timeOperation('path.install-volume', () => isNTFS(installDir))
      const raw = await timeOperation('path.read-snapshot', () => readSystemPathDirect())
      await timeOperation('path.rebuild-entries', () => mergeWindowsPathPriority(raw.split(';'), [installDir]))
      await isWindowsProcessElevated()
      const script = buildWindowsPrivilegeAction('tools', 'getSystemPath', [], { roots: [root], userDocuments: '' })
      await timeOperation('path.readonly-pipe', () => runWindowsAction(script, false, { readOnly: true }))
      markOperationStage('test.probe-complete-no-system-write')
    })
    return
  }
  assert(options.phpBin && isAbsolute(options.phpBin), '--php-bin requires a full path to an installed PHP.exe')
  assert((await stat(options.phpBin)).isFile(), 'PHP executable must exist')
  const original = await readSystemPathDirect()
  await writeFile(join(root, 'path-original.txt'), original, 'utf8')
  // 备份读取会同步环境；清除测试本地缓存，避免完整测试把这部分冷启动成本漏掉。
  const EnvSync = (await import('../src/shared/EnvSync')).default
  EnvSync.clearLocal()
  let committed: string | undefined
  // 只观察生产 send 的成功返回，不替换结果或参数；记录实际已提交的目标用于安全恢复。
  const originalSend = Helper.send
  Helper.send = async function<T>(module: any, fn: any, ...args: any[]): Promise<T> {
    const result = await originalSend.call(this, module, fn, ...args)
    if (module === 'tools' && fn === 'setSystemPath' && result === true)
      committed = (args[0] as string[]).join(';')
    return result as T
  }
  const item: SoftInstalled = {
    typeFlag: 'php', version: null, num: null, bin: resolve(options.phpBin), path: installDir,
    enable: true, run: false, running: false
  }
  try {
    await timeOperation('test.backend', () => updatePATH(item, 'php'))
    assert(committed !== undefined, 'Production PATH write must have completed')
    assert.equal(await readSystemPathDirect(), committed)
  } finally {
    Helper.send = originalSend
    if (committed !== undefined) {
      await timeOperation('cleanup.path-restore', async () => {
        assert.equal(await readSystemPathDirect(), committed, 'External PATH change: restore skipped')
        // 携带精确原始快照，使提权等待中的外部修改也被生产冲突检查拒绝。
        await Helper.send('tools', 'setSystemPath', original.split(';'), {}, committed)
        assert.equal(await readSystemPathDirect(), original)
      })
    } else markOperationStage('cleanup.skipped-unconfirmed-path-write')
  }
})

/** 无系统写入自检：上下文隔离、错误终态、诊断解析及观察器失败均保留业务行为。 */
const selfCheck = async () => {
  const { testWindowsPrivilegeOptimizations } = await import('./windows-privilege-optimization-test')
  await testWindowsPrivilegeOptimizations()
  const first: OperationTimingEvent[] = [], second: OperationTimingEvent[] = []
  await Promise.all([first, second].map((events, index) => withOperationTiming(
    (event) => events.push(event),
    () => timeOperation(`check.${index}`, async () => {
      await Promise.resolve()
      assert(acceptOperationTimingLine('FLYENV_TIMING|broker.compile|12.5'))
      assert(!acceptOperationTimingLine('FLYENV_TIMING|untrusted|12.5'))
    })
  )))
  assert(!hasOperationTiming())
  assert(first.some((event) => event.stage === 'check.0'))
  assert(!first.some((event) => event.stage === 'check.1'))
  assert(second.every((event) => event.atMs >= 0 && (event.durationMs === undefined || event.durationMs >= 0)))
  await withOperationTiming(() => { throw new Error('broken observer') }, () =>
    assert.rejects(timeOperation('check.error', () => { throw new Error('original error') }), /original error/)
  )
  const failures: OperationTimingEvent[] = []
  await withOperationTiming((event) => failures.push(event), async () => {
    await assert.rejects(timeOperation('check.failed', () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }) }))
    assert(acceptOperationTimingLine('FLYENV_TIMING|launcher.runas-requested'))
    assert(!acceptOperationTimingLine('FLYENV_TIMING|broker.compile|NaN'))
    assert(!acceptOperationTimingLine('FLYENV_TIMING|broker.compile|999999999'))
  })
  assert.equal(failures.find((event) => event.stage === 'check.failed' && event.kind === 'end')?.errorCode, 'EPERM')
  assert(failures.some((event) => event.stage === 'launcher.runas-requested' && event.kind === 'mark'))
  const unusual: OperationTimingEvent[] = []
  const originalError = Object.defineProperty(new Error('original'), 'code', { get: () => { throw new Error('getter failed') } })
  await withOperationTiming((event) => unusual.push(event), async () => {
    await assert.rejects(timeOperation('check.getter', () => { throw originalError }), (error) => error === originalError)
    try { await timeOperation('check.undefined', () => { throw undefined }) } catch {}
  })
  assert.equal(unusual.filter((event) => event.kind === 'end' && event.status === 'error').length, 2)
  // 保存纯脚本计划供 PowerShell AST 解析；测试 nonce 是常量，不执行任何提权或业务脚本。
  await mkdir(reportsRoot, { recursive: true })
  await writeFile(join(reportsRoot, 'timing-powershell-fixtures.json'), JSON.stringify([
    buildWindowsRunAsLauncher('D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', false),
    buildWindowsRunAsLauncher('D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', true),
    buildWindowsActionBootstrap('FlyEnv.Test', 'test-nonce', '0'.repeat(64), false),
    buildWindowsActionBootstrap('FlyEnv.Test', 'test-nonce', '0'.repeat(64), true),
    buildWindowsVolumeQuery(['C', 'D']),
    windowsActionBrokerBootstrap,
    ...[false, true].flatMap((elevated) => [false, true].map((reportTiming) =>
      buildWindowsActionPipeBroker({
        pipeName: 'FlyEnv.Test', nonce: 'test-nonce', elevated, maxBytes: 8192,
        launch: { argumentsText: '-NoProfile -EncodedCommand TEST' }, onResult: () => {}
      }, reportTiming)
    ))
  ]), 'utf8')
  // 原生普通权限检查使用完整生产 broker/bootstrap，只返回内存标记，不访问/修改系统文件。
  // 大注释使 JSON 超过 reader 缓冲，配合 Unicode 结果检查实际 stdin/管道 UTF-8 运输。
  const nativePipeName = `FlyEnv.StdinTest.${randomUUID()}`
  const nativeNonce = randomUUID()
  const nativeMarker = 'FlyEnv stdin 中文🙂 verified'
  const nativeScript = '# ' + 'x'.repeat(100_000) + `\n$global:FlyEnvActionResult='${nativeMarker}'`
  const nativeBootstrap = buildWindowsActionBootstrap(nativePipeName, nativeNonce,
    createHash('sha256').update(nativeScript).digest('hex'))
  await writeFile(join(reportsRoot, 'stdin-native-fixture.json'), JSON.stringify({
    executable: resolveWindowsPowerShellPath(), loader: windowsActionBrokerBootstrap,
    broker: buildWindowsActionPipeBroker({
      pipeName: nativePipeName, nonce: nativeNonce, elevated: false, maxBytes: 8192,
      launch: { argumentsText: '-NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(nativeBootstrap, 'utf16le').toString('base64') },
      onResult: () => {}
    }, false),
    // 不启动客户端的真实 broker 用于验证 READY 和父 EOF；受限沙箱也可覆盖输入全流程。
    unlaunchedBroker: buildWindowsActionPipeBroker({
      pipeName: nativePipeName, nonce: nativeNonce, elevated: false, maxBytes: 8192,
      onResult: () => {}
    }, false),
    payload: { script: nativeScript },
    launchArguments: '-NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(nativeBootstrap, 'utf16le').toString('base64'),
    nonce: nativeNonce, expected: nativeMarker
  }), 'utf8')
  console.log('Windows privilege timing self-check passed')
}

const main = async () => {
  const args = process.argv.slice(2)
  const get = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
  if (args.includes('--self-check')) return await selfCheck()
  const name = get('--case'), mode = get('--mode') ?? 'probe'
  assert(name === 'hosts' || name === 'path', '--case must be hosts or path')
  assert(mode === 'probe' || mode === 'apply', '--mode must be probe or apply')
  const options: TestOptions = { mode, phpBin: get('--php-bin') }
  const report = await (name === 'hosts' ? testWindowsHostsWriteTiming(options) : testWindowsSystemPathAddTiming(options))
  if (report.status === 'error') process.exitCode = 1
}

// 导入两个测试方法时不启动测试；命令行独立运行可保留真实冷缓存成本。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch((error) => { console.error(error); process.exitCode = 1 })
