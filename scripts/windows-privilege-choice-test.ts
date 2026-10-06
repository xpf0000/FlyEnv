import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { WindowsPrivilegeCoordinator } from '../src/main/core/WindowsPrivilegeCoordinator'
import { WindowsPrivilegeBridge } from '../src/main/core/WindowsPrivilegeBridge'
import { WindowsPrivilegeClient } from '../src/fork/WindowsPrivilegeClient'
import {
  setWindowsPrivilegeProvider,
  resolveWindowsPrivilege,
  withWindowsPrivilegeInteraction,
  type WindowsPrivilegeSnapshot
} from '../src/shared/WindowsPrivilege'
import { buildWindowsPrivilegeAction } from '../src/shared/WindowsHelperFallback'
import { buildWindowsHelperDisableScript } from '../src/main/core/WindowsHelperDisable'
import { windowsHelperInstancePaths } from "../src/shared/WindowsHelperIdentity"
import { windowsPowerShellPath } from '../src/shared/WindowsSystemPaths'
import { runWindowsAction } from '../src/shared/WindowsElevation'
import { executeWindowsPrivilegeOperation } from '../src/shared/WindowsPrivilegeOperation'
import { StartupGroupRunner } from '../src/render/components/StartupGroup/class/StartupGroupRunner'
import { createHelper } from '../src/fork/Helper'

/** 协调器/队列回归加普通权限 PowerShell 实跑；不修改 SYSTEM 任务、不弹真实 UAC。 */
async function main() {
  // 伪造上一条全局 interactive=true；无上下文仍必须后台，并验证并发 await 不串意图。
  const interactionFlags: boolean[] = []
  global.Server = { WindowsPrivilegeInteractive: true } as any
  setWindowsPrivilegeProvider({
    resolve: async (request) => {
      interactionFlags.push(request.interactive)
      return 'uac'
    },
    acquire: async () => 'test',
    release: () => {}
  })
  await resolveWindowsPrivilege('test/background')
  await Promise.all(
    [true, false].map((interactive) =>
      withWindowsPrivilegeInteraction(interactive, async () => {
        await Promise.resolve()
        await resolveWindowsPrivilege('test/context')
      })
    )
  )
  assert.deepEqual(
    interactionFlags,
    [false, true, false],
    'Async request intent cannot leak from a prior Server snapshot'
  )
  // 启动组使用既有 adapter：后台 start/stop 必须原样传 false，不建立第二套启停。
  const interactions: boolean[] = []
  let serviceRunning = false
  const runner = new StartupGroupRunner(() => ({
    exists: async () => true,
    getState: async () => (serviceRunning ? 'running' : 'stopped'),
    start: async (_item, interactive = true) => {
      interactions.push(interactive)
      serviceRunning = true
    },
    stop: async (_item, interactive = true) => {
      interactions.push(interactive)
      serviceRunning = false
    }
  }))
  const group = {
    id: 'background',
    name: 'Background',
    createdAt: 0,
    updatedAt: 0,
    items: [
      {
        id: 'mysql',
        type: 'service-version' as const,
        module: 'mysql' as const,
        versionBin: 'mysql.exe',
        versionPath: 'C:\\FlyEnvData\\mysql'
      }
    ]
  }
  await runner.run(group, 'start', false)
  await runner.run(group, 'stop', false)
  assert.deepEqual(
    interactions,
    [false, false],
    'Background intent follows existing service lifecycle'
  )
  // 旧默认 helper 无确认版本；五个并发请求仍需要唯一首次选择，保存失败不放行业务。
  let saved: { method?: 'helper' | 'uac'; choiceVersion?: number } = { method: 'helper' }
  let prompts = 0
  let choiceId = ''
  let published: WindowsPrivilegeSnapshot | undefined
  let failSave = false
  const coordinator = new WindowsPrivilegeCoordinator({
    read: () => saved,
    save: (method, choiceVersion) => {
      if (failSave) throw new Error('disk full')
      saved = { method, choiceVersion }
    },
    publish: (snapshot) => {
      published = snapshot
    },
    prompt: (choice) => {
      prompts += 1
      choiceId = choice.id
      return true
    },
    elevated: async () => false
  })
  const request = { operation: 'tools/setSystemEnv', interactive: true }
  const waiting = Array.from({ length: 5 }, () => coordinator.resolve(request))
  assert.equal(prompts, 1, 'five concurrent operations share one choice')
  failSave = true
  await assert.rejects(coordinator.select('uac', choiceId), /disk full/)
  assert.equal(saved.choiceVersion, undefined)
  failSave = false
  await coordinator.select('uac', choiceId)
  assert.deepEqual(await Promise.all(waiting), ['uac', 'uac', 'uac', 'uac', 'uac'])
  assert.equal(published?.method, 'uac')
  assert.equal(saved.choiceVersion, 1)
  assert.equal(await coordinator.resolve(request), 'uac')
  assert.equal(prompts, 1)
  await assert.rejects(coordinator.resolve({ ...request, interactive: false }), /interactive/)
  await assert.rejects(coordinator.select('helper', choiceId), /expired/)
  assert.equal(saved.method, 'uac')

  saved = {}
  const cancelled = coordinator.resolve(request)
  const cancellation = assert.rejects(
    cancelled,
    (error: any) => error.code === 'windows_choice_cancelled'
  )
  coordinator.cancel(choiceId)
  await cancellation
  assert.equal(saved.choiceVersion, undefined)
  const next = coordinator.resolve(request)
  assert.equal(prompts, 3)
  await coordinator.select('helper', choiceId)
  assert.equal(await next, 'helper')
  assert.equal(await coordinator.resolve({ ...request, interactive: false }), 'helper')

  // 全局队列除了 UUID，还核对真实请求 owner，其他进程不能替人释放执行资格。
  const owner1 = {},
    owner2 = {}
  const first = await coordinator.acquire(owner1)
  let granted = false
  const second = coordinator.acquire(owner2).then((id) => {
    granted = true
    return id
  })
  coordinator.release(first, owner2)
  await Promise.resolve()
  assert.equal(granted, false, 'another requester cannot release an active action')
  coordinator.release(first, owner1)
  const secondId = await second
  coordinator.release(secondId, owner2)

  // 用真实 client/bridge 往返验证去重，重复 helper/ready 不能重复安装/恢复。
  let preparations = 0
  const bridge = new WindowsPrivilegeBridge(coordinator, async () => {
    preparations += 1
  })
  const owner = {}
  const client: WindowsPrivilegeClient = new WindowsPrivilegeClient((message) =>
    bridge.handle(message, owner, (reply) => client.handleMessage(reply))
  )
  assert.equal(await client.resolve({ operation: 'helper/ready', interactive: false }), 'helper')
  assert.equal(preparations, 1)
  const lease = await client.acquire()
  client.release(lease)
  const replayMessage = {
    type: 'windows-privilege-request',
    requestId: 'repeat-ready',
    action: 'resolve',
    data: { operation: 'helper/ready', interactive: false }
  }
  const replies: unknown[] = []
  const firstReply = new Promise<void>((resolve) => {
    bridge.handle(replayMessage, owner, (reply) => {
      replies.push(reply)
      resolve()
    })
    bridge.handle(replayMessage, owner, () => {
      throw new Error('Duplicate pending request')
    })
  })
  await firstReply
  assert.equal(preparations, 2)
  bridge.handle(replayMessage, owner, (reply) => replies.push(reply))
  assert.equal(preparations, 2, 'A repeated terminal request cannot prepare Helper again')
  assert.deepEqual(replies[0], replies[1])
  bridge.detach(owner)
  coordinator.dispose()

  // 动作 fixture 含原 SID/Documents；敏感根目录、越界路径和系统 PID 必须在启动前拒绝。
  const context = {
    roots: ['C:\\FlyEnvData'],
    userDocuments: 'C:\\Users\\Employee\\Documents',
    userSid: 'S-1-5-21-100-200-300-400'
  }
  const actions = [
    buildWindowsPrivilegeAction('tools', 'readFileByRoot', ['C:\\FlyEnvData\\a.txt'], context),
    buildWindowsPrivilegeAction(
      'tools',
      'writeFileByRoot',
      ["C:\\FlyEnvData\\中文 % ! ' name.txt", '你好\nworld'],
      context
    ),
    buildWindowsPrivilegeAction(
      'tools',
      'setSystemEnv',
      ['FLYENV_ALIAS', 'C:\\FlyEnvData\\alias'],
      context
    ),
    buildWindowsPrivilegeAction('tools', 'setSystemPath', [['C:\\FlyEnvData\\bin'], {}], context),
    buildWindowsPrivilegeAction(
      'tools',
      'setAutoStartWin',
      [true, 'FlyEnvStartup', 'C:\\FlyEnv\\FlyEnv.exe'],
      context
    ),
    buildWindowsPrivilegeAction('tools', 'ensureFlyEnvDataDirectory', ['C:\\FlyEnvData'], context),
    buildWindowsPrivilegeAction(
      'tools',
      'installFlyEnvPowerShellIntegration',
      [
        {
          scriptPath: 'C:\\FlyEnvData\\bin\\flyenv.ps1',
          scriptBase64: Buffer.from('Write-Output hello').toString('base64'),
          profiles: [
            { edition: 'pwsh', path: 'C:\\Users\\Employee\\Documents\\PowerShell\\Profile.ps1' }
          ]
        }
      ],
      context
    ),
    buildWindowsPrivilegeAction('tools', 'kill', ['-INT', ['12345']], {
      ...context,
      processes: [{ pid: 12345, created: '2026-09-30T00:00:00.0000000Z' }]
    }),
    buildWindowsPrivilegeAction('tools', 'killPorts', [['8080']], context),
    buildWindowsPrivilegeAction('tools', 'getPortPids', ['8080'], context),
    buildWindowsPrivilegeAction('tools', 'getSystemPath', [], context),
    buildWindowsPrivilegeAction('tools', 'processListWin', [], context),
    buildWindowsPrivilegeAction('host', 'dnsRefresh', [], context),
    buildWindowsPrivilegeAction('host', 'sslFindCertificate', ['C:\\FlyEnvData\\CA'], context),
    buildWindowsPrivilegeAction(
      'host',
      'sslAddTrustedCert',
      ['C:\\FlyEnvData\\CA', 'FlyEnv-Root-CA.crt'],
      context
    ),
    buildWindowsHelperDisableScript({
      ...windowsHelperInstancePaths(context.userSid),
      account: 'employee',
      sid: context.userSid,
      localAppData: 'C:\\Users\\Employee\\AppData\\Local'
    })
  ]
  assert.throws(
    () => buildWindowsPrivilegeAction('tools', 'rm', ['C:\\Windows\\System32'], context),
    /sensitive|scope/
  )
  assert.throws(
    () =>
      buildWindowsPrivilegeAction('tools', 'writeFileByRoot', ['C:\\Outside\\a.txt', 'x'], context),
    /scope/
  )
  assert.throws(
    () => buildWindowsPrivilegeAction('tools', 'kill', ['-INT', ['4']], context),
    /target/
  )
  assert.throws(
    () =>
      buildWindowsPrivilegeAction('tools', 'ensureFlyEnvDataDirectory', ['C:\\Outside'], context),
    /roots/
  )

  assert.throws(
    () =>
      buildWindowsPrivilegeAction(
        'tools',
        'ensureFlyEnvDataDirectory',
        ['C:\\ProgramData\\FlyEnv'],
        { ...context, roots: ['C:\\ProgramData\\FlyEnv'] }
      ),
    /helper installation/
  )
  assert.throws(
    () =>
      buildWindowsPrivilegeAction('tools', 'ensureFlyEnvDataDirectory', ['C:\\Windows'], {
        ...context,
        roots: ['C:\\Windows']
      }),
    /system directories/
  )

  // PowerShell AST 只做解析，不执行这些包含机器级修改的 fixture。后续实跑均普通权限。
  if (process.platform === 'win32') {
    const payload = Buffer.from(JSON.stringify(actions), 'utf8').toString('base64')
    const validate = `$scripts = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json; foreach ($script in $scripts) { $tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseInput($script,[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count -gt 0) { throw ($errors | Out-String) } }`
    const base = resolve('.codex/tmp')
    const root = join(base, 'windows-privilege-' + randomUUID())
    assert.equal(resolve(root).startsWith(base + '\\'), true)
    await mkdir(root, { recursive: true })
    const validationPath = join(root, 'validate.ps1')
    await writeFile(validationPath, validate)
    try {
      await promisify(execFile)(
        windowsPowerShellPath(),
        ['-NoProfile', '-NonInteractive', '-File', validationPath],
        { windowsHide: true, timeout: 20_000 }
      )
      assert.deepEqual(
        await runWindowsAction(
          '$global:FlyEnvActionResult = @{ text="你好 % !"; values=@(1,2) }',
          false
        ),
        { text: '你好 % !', values: [1, 2] }
      )
      const large = '你好\n'.repeat(10_000)
      assert.equal(
        await runWindowsAction(
          `$global:FlyEnvActionResult = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(large).toString('base64')}'))`,
          false
        ),
        large
      )
      await assert.rejects(
        runWindowsAction("throw [UnauthorizedAccessException]::new('denied')", false),
        (error: any) => error.code === 'windows_permission_denied'
      )
      await assert.rejects(
        runWindowsAction("throw [IO.IOException]::new('file locked', -2147024864)", false),
        (error: any) => error.code === 'helper_execution_failed'
      )
      global.Server = { BaseDir: join(root, 'server'), AppDir: join(root, 'app') } as any
      let requests = 0
      setWindowsPrivilegeProvider({
        resolve: async () => {
          requests += 1
          throw new Error('unexpected authorization')
        },
        acquire: async () => {
          throw new Error('unexpected UAC')
        },
        release: () => {}
      })
      const file = join(root, "中文 % ! ' .txt")
      const helper = async (): Promise<any> => {
        throw new Error('unexpected Helper access')
      }
      // 安装相关依赖全部设成抛错：成功文件读写证明路由在检查 key/二进制前已经分流。
      const unexpectedHelperAccess = () => {
        throw new Error('Unexpected Helper inspection or RPC')
      }
      const routedHelper = createHelper({
        isWindows: () => true,
        helperBinaryExists: unexpectedHelperAccess,
        appHelperCheck: unexpectedHelperAccess,
        getHelperKey: unexpectedHelperAccess,
        createConnection: unexpectedHelperAccess,
        runWindowsHelperFallback: unexpectedHelperAccess
      })
      await withWindowsPrivilegeInteraction(true, () =>
        executeWindowsPrivilegeOperation('tools', 'writeFileByRoot', [file, large], helper)
      )
      assert.equal(await readFile(file, 'utf8'), large)
      assert.equal(await routedHelper.send('tools', 'writeFileByRoot', file, large), true)
      assert.equal(await routedHelper.send('tools', 'readFileByRoot', file), large)
      assert.equal(
        await executeWindowsPrivilegeOperation('tools', 'readFileByRoot', [file], helper),
        large
      )
      await assert.rejects(
        executeWindowsPrivilegeOperation(
          'tools',
          'readFileByRoot',
          [join(root, 'missing.txt')],
          helper
        ),
        (error: any) => error.code === 'ENOENT'
      )
      // 复制系统 Root 的公开证书到临时目录做 DER/PEM 查询，只读系统证书存储、不导入。
      const certificate = await runWindowsAction<string>(
        "$cert = Get-ChildItem Cert:\\LocalMachine\\Root | Select-Object -First 1; $global:FlyEnvActionResult = if ($null -eq $cert) { '' } else { [Convert]::ToBase64String($cert.RawData) }",
        false
      )
      if (certificate) {
        const certificateFile = join(root, 'FlyEnv-Root-CA.crt')
        for (const content of [
          Buffer.from(certificate, 'base64'),
          `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----\n`
        ]) {
          await writeFile(certificateFile, content)
          const result = await executeWindowsPrivilegeOperation<{ stdout: string }>(
            'host',
            'sslFindCertificate',
            [root],
            helper
          )
          assert.equal(
            typeof result.stdout,
            'string',
            'DER and PEM trust checks only read the certificate store'
          )
        }
      }
      // 只终止本测试创建的普通 Node 子进程，验证严格 kill 无需 Helper/UAC 即可完成。
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
        windowsHide: true,
        stdio: 'ignore'
      })
      try {
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
        await routedHelper.send('tools', 'kill', '-INT', [String(child.pid)])
        await exited
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill()
      }
      assert.equal(requests, 0, 'ordinary actions neither prompt nor inspect Helper')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
  console.log(
    'Windows privilege choice, queue, independent action builders and local execution passed'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
