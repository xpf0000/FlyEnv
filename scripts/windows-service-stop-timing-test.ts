import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SoftInstalled } from '../src/shared/app'
import type { PItem } from '../src/shared/Process'
import {
  withOperationTiming,
  timeOperation,
  type OperationTimingEvent
} from '../src/shared/OperationTiming'
import {
  isWindowsProcessElevated,
  setWindowsPrivilegeProvider,
  withWindowsPrivilegeInteraction
} from '../src/shared/WindowsPrivilege'
import { WindowsPrivilegeCoordinator } from '../src/main/core/WindowsPrivilegeCoordinator'
import { WindowsPrivilegeBridge } from '../src/main/core/WindowsPrivilegeBridge'
import { WindowsPrivilegeClient } from '../src/fork/WindowsPrivilegeClient'

type Options = {
  mode: 'probe' | 'apply'
  dataDir: string
  bins: string[]
  nums: string[]
  pids: string[]
}
type Event = OperationTimingEvent & { serviceIndex?: number }
type ServiceReport = {
  index: number
  bin: string
  num: number
  pid?: string
  status: 'pending' | 'ok' | 'error'
  backendMs?: number
  queryCount?: number
  queryMs?: number
  stoppedPids?: string[]
  errorCode?: string
  error?: string
}
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const round = (value: number) => Math.round(value * 1000) / 1000
const normalize = (value: string) => win32.normalize(value).replace(/\\/g, '/').toLowerCase()

/** 重复参数按出现顺序配对；先校验整批，防止第二个参数错误时第一个服务已被停止。 */
const parseOptions = (args: string[]): Options => {
  const values = new Map<string, string[]>()
  const allowed = new Set(['--mode', '--data-dir', '--php-bin', '--php-num', '--pid'])
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    assert(allowed.has(flag), `Unknown argument: ${flag}`)
    assert(value && !value.startsWith('--'), `Missing value for ${flag}`)
    const list = values.get(flag) ?? []
    list.push(value)
    values.set(flag, list)
  }
  for (const flag of ['--mode', '--data-dir']) {
    assert((values.get(flag)?.length ?? 0) <= 1, `${flag} must appear once`)
  }
  const mode = values.get('--mode')?.[0] ?? 'probe'
  assert(mode === 'probe' || mode === 'apply', '--mode must be probe or apply')
  const dataDir = values.get('--data-dir')?.[0]
  // 禁止默默使用 workspace/data，安装版和开发版可能有各自的数据目录和 PID 文件。
  assert(dataDir && isAbsolute(dataDir), '--data-dir must be the absolute FlyEnv data directory')
  const bins = values.get('--php-bin') ?? []
  assert(bins.length > 0 && bins.length <= 16, 'Provide 1..16 --php-bin values')
  for (const bin of bins) {
    assert(isAbsolute(bin), '--php-bin must be an absolute file path')
    assert(/^php(?:-cgi)?\.exe$/i.test(basename(bin)), '--php-bin must point to php.exe or php-cgi.exe')
  }
  const nums = values.get('--php-num') ?? []
  const pids = values.get('--pid') ?? []
  assert(nums.length === 0 || nums.length === bins.length, 'Repeat --php-num for every --php-bin')
  assert(pids.length === 0 || pids.length === bins.length, 'Repeat --pid for every --php-bin')
  assert(nums.every((value) => /^[1-9]\d{1,2}$/.test(value)), 'Invalid PHP version num (for example 83)')
  assert(pids.every((value) => /^[1-9]\d*$/.test(value) && Number(value) > 4 && Number(value) <= 0x7fffffff), 'Invalid PID')
  assert(new Set(bins.map((bin) => normalize(dirname(bin)))).size === bins.length, 'Duplicate PHP installation directory')
  return { mode, dataDir: resolve(dataDir), bins: bins.map((bin) => resolve(bin)), nums, pids }
}

/**
 * 与其他权限耗时脚本相同，连接真实 coordinator/bridge/client，使用已选 UAC 的偏好。
 * 不模拟访问拒绝；普通权限成功无需 UAC，失败才由生产执行器请求提升。
 * 脚本不安装 Helper，也不更改用户设置；连线在同一 Node 进程，不计 Electron IPC。
 */
const connectPrivilegeProvider = () => {
  const coordinator = new WindowsPrivilegeCoordinator({
    read: () => ({ method: 'uac', choiceVersion: 1 }),
    save: () => { throw new Error('Timing diagnostic cannot change authorization preference') },
    publish: () => {},
    prompt: () => false,
    elevated: isWindowsProcessElevated
  })
  const bridge = new WindowsPrivilegeBridge(coordinator)
  const owner = {}
  const client: WindowsPrivilegeClient = new WindowsPrivilegeClient((message) =>
    bridge.handle(message, owner, (response) => client.handleMessage(response))
  )
  setWindowsPrivilegeProvider(client)
  return () => { bridge.detach(owner); coordinator.dispose() }
}

/**
 * 只用文件名恢复版本编号，不启动 php.exe 查询版本。实际停止仍由 PHP 模块重新确认。
 * probe 无活进程也可采样查询耗时；apply 要求显式版本存在活 spawner，避免测到空停止。
 */
const prepareVersion = async (options: Options, index: number, list: PItem[]): Promise<SoftInstalled> => {
  const bin = options.bins[index]
  assert((await stat(bin)).isFile(), `PHP executable is not a file: ${bin}`)
  const path = dirname(bin)
  const files = await readdir(path)
  const available = files.flatMap((name) => {
    const match = /^php\.phpwebstudy\.90([1-9]\d{1,2})\.ini$/i.exec(name)
    return match ? [Number(match[1])] : []
  })
  assert(options.nums[index] || available.length === 1, `Cannot infer PHP num for ${bin}; supply --php-num`)
  const num = Number(options.nums[index] ?? available[0])
  assert(available.includes(num), `Missing FlyEnv runtime ini for PHP num ${num}: ${path}`)
  const marker = new RegExp(`(?:^|[\\\\/\\s"'])php\\.phpwebstudy\\.90${num}\\.ini(?:$|[\\s"'])`, 'i')
  const parents = list.filter((item) =>
    item.EXECUTABLE && normalize(item.EXECUTABLE) === normalize(join(path, 'php-cgi-spawner.exe')) && marker.test(item.COMMAND)
  )
  if (options.mode === 'apply') assert(parents.length > 0, `No active FlyEnv PHP spawner for ${bin}`)
  const pid = options.pids[index] ?? (parents.length === 1 ? parents[0].PID : undefined)
  if (options.pids[index]) assert(parents.some((item) => item.PID === pid), 'Explicit PID does not match the PHP installation and ini')
  return {
    typeFlag: 'php', bin, path, num, pid, version: String(num),
    enable: true, run: parents.length > 0, running: false
  }
}

/**
 * 单次命令只诊断一批实例：所有实际停止调用串行共享模块和权限缓存。
 * 报告保留原始 start/end 事件与实例编号；嵌套行不得求和为总时间。
 */
const runTiming = async (options: Options) => {
  assert.equal(process.platform, 'win32', 'This diagnostic requires Windows')
  const root = join(workspace, 'tmp', 'windows-service-stop-timing', randomUUID())
  await mkdir(root, { recursive: true })
  const report = {
    mode: options.mode, status: 'ok', dataDir: options.dataDir,
    scope: options.mode === 'apply'
      ? 'Production PHP stopService backend; in-process authorization IPC; no main exit drain/renderer IPC'
      : 'Read-only process/file preparation; no stopService, authorization IPC, or UAC',
    events: [] as Event[], services: [] as ServiceReport[], error: undefined as string | undefined
  }
  // 路径与 ServerPath.ts 一致：数据根下 server/php、server/pid 与 app。
  // 仅读取现有目录，禁止为诊断自动恢复 ACL 或创建 PHP 配置。
  global.Server = {
    BaseDir: join(options.dataDir, 'server'), PhpDir: join(options.dataDir, 'server', 'php'),
    AppDir: join(options.dataDir, 'app'), Static: join(workspace, 'static'),
    Cache: join(options.dataDir, 'cache'), WindowsElevationMethod: 'uac',
    WindowsElevationChoiceVersion: 1, WindowsPrivilegeRevision: 0,
    WindowsPrivilegeInteractive: true, isWindows: true, isMacOS: false, isLinux: false
  } as typeof global.Server
  let disconnect: (() => void) | undefined
  let serviceIndex: number | undefined
  try {
    await withOperationTiming((event) => report.events.push({ ...event, serviceIndex }), async () => {
      const { default: php } = await timeOperation('test.import-php-backend', () => import('../src/fork/module/Php.win'))
      const { ProcessPidListStrict } = await import('../src/shared/Process.win')
      php.init()
      assert((await stat(global.Server.PhpDir!)).isDirectory(), 'FlyEnv server/php directory is missing')
      const list = await timeOperation('test.preflight-process-list', () => ProcessPidListStrict())
      const versions: SoftInstalled[] = []
      for (let index = 0; index < options.bins.length; index++) {
        versions.push(await timeOperation('test.prepare-version', () => prepareVersion(options, index, list)))
      }
      // 仅 apply 安装权限 provider；probe 不调用任何停止/提权链路。
      if (options.mode === 'apply') disconnect = connectPrivilegeProvider()
      await timeOperation('test.serial-batch', async () => {
        for (const [index, version] of versions.entries()) {
          serviceIndex = index + 1
          const entry: ServiceReport = { index: serviceIndex, bin: version.bin, num: version.num!, pid: version.pid, status: 'pending' }
          report.services.push(entry)
          try {
            if (options.mode === 'apply') {
              console.log(`Stopping PHP ${version.num}, PID=${version.pid ?? 'module discovery'} (${index + 1}/${versions.length})`)
              const result = await timeOperation('test.stop-service', () =>
                withWindowsPrivilegeInteraction(true, () => php.stopService(version).on(() => {}))
              )
              assert(Array.isArray(result?.['APP-Service-Stop-PID']), 'Missing production stop result')
              entry.stoppedPids = result['APP-Service-Stop-PID']
              assert(entry.stoppedPids.length > 0, 'No process was stopped; this is not a live-service timing sample')
            } else {
              await timeOperation('test.probe-fresh-process-list', () => ProcessPidListStrict())
            }
            entry.status = 'ok'
          } catch (error) {
            entry.status = 'error'
            entry.error = error instanceof Error ? error.message : String(error)
            const code = (error as { code?: unknown })?.code
            if (typeof code === 'string') entry.errorCode = code
            report.status = 'error'
            // 与退出实例循环一致：保留失败，不盲目补杀，继续其他版本。
          }
        }
        serviceIndex = undefined
      })
    })
  } catch (error) {
    report.status = 'error'
    report.error = error instanceof Error ? error.message : String(error)
  } finally {
    disconnect?.()
    for (const entry of report.services) {
      const events = report.events.filter((event) => event.serviceIndex === entry.index && event.kind === 'end')
      entry.backendMs = events.find((event) => event.stage === 'test.stop-service')?.durationMs
      const queries = events.filter((event) => event.stage === 'process-list.powershell-query')
      entry.queryCount = queries.length
      entry.queryMs = round(queries.reduce((sum, event) => sum + (event.durationMs ?? 0), 0))
    }
    const reportPath = join(root, 'report.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.table(report.services)
    console.table(report.events.filter((event) => event.kind !== 'start'))
    console.log(`Report: ${reportPath} (${report.mode}, ${report.status})`)
    if (report.error) console.error(report.error)
  }
  if (report.status === 'error') process.exitCode = 1
}

/**
 * self-check 不查询/结束进程、不弹 UAC，只校验 CLI、计时隔离和本次改动源码语法。
 * 使用 TypeScript 的语法诊断，不运行全仓类型检查或产物构建。
 */
const selfCheck = async () => {
  const parsed = parseOptions(['--data-dir', 'D:\\数据目录', '--php-bin', 'D:\\PHP 8.3\\php.exe', '--mode', 'probe'])
  assert.equal(parsed.mode, 'probe')
  const paired = parseOptions([
    '--mode', 'apply', '--data-dir', 'D:\\数据目录',
    '--php-bin', 'D:\\PHP 8.3\\php.exe', '--php-bin', 'D:\\PHP 8.2\\php-cgi.exe',
    '--php-num', '83', '--php-num', '82', '--pid', '100', '--pid', '200'
  ])
  assert.deepEqual(paired.nums, ['83', '82'])
  assert.deepEqual(paired.pids, ['100', '200'])
  assert.equal(paired.bins.length, 2)
  assert.throws(() => parseOptions(['--data-dir', 'relative', '--php-bin', 'D:\\PHP\\php.exe']))
  assert.throws(() => parseOptions(['--data-dir', 'D:\\数据', '--php-bin', 'D:\\PHP\\php.exe', '--php-bin', 'D:\\PHP2\\php.exe', '--pid', '100']))
  const events: Event[] = []
  await withOperationTiming((event) => events.push(event), () => timeOperation('check.stage', async () => {}))
  assert(events.some((event) => event.kind === 'end' && event.status === 'ok'))
  await timeOperation('check.disabled', async () => {})
  assert(!events.some((event) => event.stage === 'check.disabled'))
  const ts = await import('typescript')
  for (const file of [
    'scripts/windows-service-stop-timing-test.ts', 'src/shared/WindowsHelperFallback.ts',
    'src/shared/Process.win.ts', 'src/shared/WindowsPrivilegeOperation.ts',
    'src/fork/module/Php.win/index.ts', 'src/fork/module/Base/index.ts'
  ]) {
    const source = ts.createSourceFile(file, await readFile(join(workspace, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const diagnostics = (source as typeof source & { parseDiagnostics: readonly import('typescript').Diagnostic[] }).parseDiagnostics
    assert.equal(diagnostics.length, 0, `${file}: ${diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n')}`)
  }
  console.log('Windows service stop timing self-check passed (no process queries or stops)')
}

// 独立 CLI 入口；导入文件不会自动停止任何服务。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  void (args.includes('--self-check') ? selfCheck() : runTiming(parseOptions(args))).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
