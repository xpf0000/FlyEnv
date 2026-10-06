import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { posix as unixPath } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import * as helperState from '../src/shared/WindowsHelperState'

const require = createRequire(import.meta.url)
const tick = () => new Promise((resolve) => setImmediate(resolve))
const failures: unknown[] = []

async function load(
  file: string,
  dependencies: Record<string, any>,
  extra: Record<string, any> = {}
) {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [
      {
        name: 'external-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, (args) => {
            if (args.kind === 'entry-point') return
            if (args.path.endsWith('/FlyEnvHelper/index.vue'))
              return { path: 'installer', namespace: 'fixture' }
            if (args.kind === 'dynamic-import' && args.path.endsWith('/FlyEnvHelper/setup'))
              return { path: 'setup', namespace: 'fixture' }
            return { path: args.path, external: true }
          })
          builder.onLoad({ filter: /./, namespace: 'fixture' }, ({ path }) => ({
            contents:
              path === 'setup'
                ? "export {FlyEnvHelperSetup} from '@/components/FlyEnvHelper/setup'"
                : 'export default {}'
          }))
        }
      }
    ]
  })
  const module = { exports: {} as any }
  runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (path: string) =>
      path === 'node:path' || path === 'path'
        ? unixPath
        : path in dependencies
          ? (dependencies[path].default ?? dependencies[path])
          : /^(node:|events$|path$|fs$)/.test(path)
            ? require(path)
            : {},
    process: { platform: 'linux', cwd: () => '/tmp', env: {}, title: 'FlyEnv' },
    window: { Server: { isLinux: true, isWindows: false }, removeEventListener() {} },
    global: {
      Server: {
        Static: '/opt/FlyEnv " $literal \'/static',
        AppDir: '/home/user/FlyEnv/data',
        BaseDir: '/home/user/FlyEnv/data'
      }
    },
    setTimeout,
    clearTimeout,
    console: { log() {}, error() {} },
    ...extra
  })
  return module.exports
}

async function check(name: string, test: () => Promise<void>) {
  try {
    await test()
    console.log(`PASS: ${name}`)
  } catch (error) {
    failures.push(error)
    console.error(`FAIL: ${name}`, error)
  }
}

async function chain() {
  let installed = false
  let confirmCount = 0
  let confirmCancelled = false
  let elevationFails = false
  let elevationCancelled = false
  let elevatedProgramFails = false
  let hostsFail = false
  let terminalRuns = 0
  let terminalStops = 0
  let terminalDestroyed = 0
  let terminalMountFails = false
  let terminalExecutionFails = false
  let releaseTerminal: (() => void) | undefined
  let pkexecCalls = 0
  let hostWrites = 0
  const notices: any[] = []
  const messages: string[] = []
  const listeners = new Map<string, (...args: any[]) => void>()
  const timers = new Set<() => void>()
  let sent = 0
  const ipc = {
    send(command: string, ...args: any[]) {
      const key = `request-${++sent}`
      queueMicrotask(() => route.handleCommand(command, key, ...args))
      return { key, then: (callback: any) => listeners.set(key, callback) }
    },
    on: (key: string) => ({ then: (callback: any) => listeners.set(key, callback) }),
    off: (key: string) => listeners.delete(key)
  }
  const utils = {
    isLinux: () => true,
    isWindows: () => false,
    isMacOS: () => false,
    uuid: () => 'fixture',
    appDebugLog: async () => {},
    waitTime: async () => {}
  }
  const sudo = await load('src/shared/Sudo.ts', {
    './utils': utils,
    'node:fs/promises': {
      stat: async (path: string) => {
        if (path.includes('kdesudo')) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      }
    },
    'node:child_process': {
      exec: (_command: string, _options: any, callback: any) =>
        callback(new Error('must use argv')),
      execFile: (binary: string, args: string[], _options: any, callback: any) => {
        pkexecCalls++
        assert.equal(binary, '/usr/bin/pkexec')
        assert.equal(args[0], '--disable-internal-agent')
        assert.equal(args[1], '/bin/bash')
        assert.equal(args[2], '-c')
        assert.ok(args[3].includes('/bin/bash'))
        if (elevationCancelled)
          callback(Object.assign(new Error('authorization dismissed'), { code: 126, stdout: '' }))
        else if (elevatedProgramFails)
          callback(
            Object.assign(new Error('installer cannot execute'), {
              code: 126,
              stdout: 'SUDOPROMPT\n'
            })
          )
        else if (elevationFails) callback(new Error('no authentication agent'))
        else {
          installed = true
          callback(null, { stdout: 'SUDOPROMPT\ninstalled', stderr: '' })
        }
      }
    }
  })
  const health = async () => {
    if (!installed) throw new helperState.AppHelperError('helper_key_missing', 'not installed')
    return true
  }
  const appHelperModule = await load('src/main/core/AppHelper.ts', {
    'electron-is': { production: () => false },
    '@shared/utils': utils,
    '@shared/WindowsHelperState': helperState,
    '@shared/AppHelperCheck': { AppHelperCheck: health },
    '@shared/Sudo': sudo,
    '@shared/fs-extra': { existsSync: () => false },
    'node:os': { userInfo: () => ({ uid: 1000, gid: 1000 }) }
  })
  const backend = appHelperModule.createAppHelper({ appHelperCheck: health, sudo: sudo.exec })
  let directoryReady = 0
  backend.onSuduExecSuccess(async () => {
    directoryReady++
  })
  const baseDeps: Record<string, any> = {
    '@shared/utils': utils,
    '@shared/WindowsHelperState': helperState,
    '@lang/index': { I18nT: (key: string) => key },
    '@lang/runtime': { I18nT: (key: string) => key },
    '@/util/IPC': { default: ipc },
    '@/util/Index': { reactiveBind: (value: any) => value },
    '@/util/Element': {
      MessageError: (msg: string) => messages.push(`error:${msg}`),
      MessageSuccess: (msg: string) => messages.push(`success:${msg}`),
      MessageWarning: () => {}
    },
    'element-plus': {
      ElMessageBox: {
        confirm: async () => {
          confirmCount++
          if (confirmCancelled) throw new Error('cancelled')
        }
      }
    },
    '@/util/NodeFn': { dialog: { showMessageBox: async () => {} } },
    '@/util/Host': {
      handleWriteHosts: async () => {
        hostWrites++
        if (hostsFail) throw new Error('hosts write denied')
      }
    },
    '@/util/AsyncComponent': { AsyncComponentShow: () => new Promise(() => {}) },
    vue: { reactive: (value: any) => value, markRaw: (value: any) => value },
    '@/util/XTerm': {
      default: class {
        mount = async () => {
          if (terminalMountFails) throw new Error('PTY initialization failed')
        }
        send = (_commands: string[], _oneFile: boolean, reportExitCode = false) => {
          terminalRuns++
          return new Promise<void>((resolve, reject) => {
            releaseTerminal = () =>
              terminalExecutionFails && reportExitCode
                ? reject(new Error('Installer exited with code 1'))
                : resolve()
          })
        }
        stop = async () => {
          terminalStops++
        }
        unmounted() {}
        destroy() {
          terminalDestroyed++
        }
      }
    }
  }
  const helper = (
    await load('src/render/store/helper.ts', baseDeps, {
      setTimeout: (callback: () => void) => {
        timers.add(callback)
        return callback
      },
      clearTimeout: (callback: () => void) => timers.delete(callback)
    })
  ).default
  baseDeps['@/store/helper'] = { default: helper }
  const terminal = (await load('src/render/components/FlyEnvHelper/setup.ts', baseDeps))
    .FlyEnvHelperSetup
  baseDeps['@/components/FlyEnvHelper/setup'] = { FlyEnvHelperSetup: terminal }
  const notifications = (
    await load('src/render/util/GlobalIPCOn.ts', {
      ...baseDeps,
      '@/util/MCP': { setupMcpIpc() {} }
    })
  ).default
  notifications.inited = true
  notifications.init()
  const windowManager = {
    sendCommandTo(_win: any, command: string, key: string, res: any) {
      if (command === 'APP-FlyEnv-Helper-Notice') notices.push(res)
      ;(listeners.get(key) ?? listeners.get(command))?.(key, res)
    }
  }
  const application = (await load('src/main/Application.ts', baseDeps)).default
  backend.onStatusMessage((status: any) =>
    application.prototype.handleHelperStatusMessage.call({ mainWindow: {}, windowManager }, status)
  )
  const handler = (
    await load('src/main/core/IPCHandler.ts', {
      ...baseDeps,
      './AppHelper': { ...appHelperModule, default: backend },
      '@shared/AppHelperCheck': { AppHelperCheck: health }
    })
  ).default
  const route = new handler({ mainWindow: {}, windowManager })
  return {
    backend,
    helper,
    terminal,
    ipc,
    listeners,
    timers,
    notices,
    messages,
    setInstalled: (value: boolean) => {
      installed = value
    },
    cancelConfirm: () => {
      confirmCancelled = true
    },
    failElevation: () => {
      elevationFails = true
    },
    cancelElevation: () => {
      elevationCancelled = true
    },
    failElevatedProgram: () => {
      elevatedProgramFails = true
    },
    failHosts: () => {
      hostsFail = true
    },
    failMount: () => {
      terminalMountFails = true
    },
    failTerminalExecution: () => {
      terminalExecutionFails = true
    },
    finishTerminal: () => {
      installed = true
      releaseTerminal!()
    },
    counts: () => ({
      confirmCount,
      pkexecCalls,
      hostWrites,
      terminalRuns,
      terminalStops,
      terminalDestroyed,
      directoryReady
    })
  }
}

await check(
  'confirmation reaches Linux elevation, helper readiness, and one hosts synchronization',
  async () => {
    const flow = await chain()
    flow.backend.needInstall()
    flow.backend.needInstall()
    await tick()
    assert.equal(flow.counts().confirmCount, 1)
    assert.equal(flow.counts().pkexecCalls, 1, 'graphical installation must reach pkexec')
    assert.equal(flow.counts().directoryReady, 1)
    assert.equal(flow.counts().hostWrites, 1)
    assert.equal(flow.helper.isInstallResultPending(), false)
    assert.equal(flow.timers.size, 0)
    assert.equal([...flow.listeners.keys()].filter((k) => k.startsWith('request-')).length, 0)
    assert.ok(flow.notices.some((n) => n.status === 'checkSuccess'))
  }
)

await check(
  'installer command distinguishes graphical elevation from interactive terminal sudo',
  async () => {
    const flow = await chain()
    const raw = await flow.backend.command()
    assert.ok(raw.command.startsWith('/bin/bash '), 'elevation executor rejects a sudo prefix')
    const response = await new Promise<any>((resolve) =>
      flow.ipc.send('APP:FlyEnv-Helper-Command').then((_key: string, res: any) => resolve(res))
    )
    assert.equal(response.command, `sudo ${raw.command}`)
  }
)

await check('cancelled confirmation does not install or reopen the dialog', async () => {
  const flow = await chain()
  flow.cancelConfirm()
  flow.backend.needInstall()
  await tick()
  assert.equal(flow.counts().pkexecCalls, 0)
  assert.equal(flow.helper.show, false)
  assert.equal(flow.terminal.show, false)
})

await check(
  'Linux command quoting preserves spaces, quotes and dollar signs in installer paths',
  async () => {
    const flow = await chain()
    const { command } = await flow.backend.command()
    const script = `/bin/bash() { printf '%s\\0' "$@"; }; ${command}`
    const executable = process.platform === 'win32' ? 'wsl' : '/bin/bash'
    const args =
      process.platform === 'win32'
        ? ['-d', 'Ubuntu-24.04', '--exec', '/bin/bash', '-c', script]
        : ['-c', script]
    const result = spawnSync(executable, args, { encoding: 'utf8' })
    if (result.error) throw result.error
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.split('\0').slice(0, -1), [
      '/opt/FlyEnv " $literal \'/static/sh/flyenv-helper-init.sh',
      '/src/helper-go/dist/flyenv-helper-linux-amd64-v1',
      '1000:1000',
      '/home/user/FlyEnv',
      '/',
      '',
      ''
    ])
  }
)

await check(
  'an elevated program exit 126 is reported as failure rather than cancelled authorization',
  async () => {
    const flow = await chain()
    flow.failElevatedProgram()
    assert.equal(await flow.helper.repair(), false)
    await tick()
    assert.ok(flow.notices.some((notice) => notice.reason === 'helper_execution_failed'))
    assert.equal(flow.terminal.show, true)
  }
)

await check(
  'dismissed Linux authentication clears pending state without opening terminal authentication',
  async () => {
    const flow = await chain()
    flow.cancelElevation()
    assert.equal(await flow.helper.repair(), false)
    await tick()
    assert.equal(flow.helper.isInstallResultPending(), false)
    assert.equal(flow.terminal.show, false)
    assert.equal(flow.counts().pkexecCalls, 1)
    assert.equal(flow.counts().hostWrites, 0)
    assert.ok(flow.notices.some((notice) => notice.reason === 'elevation_cancelled'))
  }
)

await check(
  'failed elevation opens one manual installer and suppresses duplicate installation prompts',
  async () => {
    const flow = await chain()
    flow.failElevation()
    assert.equal(await flow.helper.repair(), false)
    flow.backend.needInstall()
    await tick()
    assert.equal(flow.terminal.show, true)
    flow.backend.needInstall()
    await tick()
    assert.equal(
      flow.counts().confirmCount,
      0,
      'manual installer suppresses another install prompt'
    )
  }
)

await check(
  'terminal installation survives page removal and verifies helper before synchronizing hosts',
  async () => {
    const flow = await chain()
    flow.terminal.show = true
    const first = flow.terminal.install({})
    const second = flow.terminal.install({})
    await tick()
    assert.equal(flow.counts().terminalRuns, 1)
    flow.terminal.detach()
    flow.finishTerminal()
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(flow.counts().pkexecCalls, 0, 'health verification must not install again')
    assert.equal(flow.counts().directoryReady, 1)
    assert.equal(flow.counts().hostWrites, 1)
    assert.equal(flow.terminal.loading, false)
    assert.equal(flow.terminal.execXTerm, undefined)
    assert.equal(flow.counts().terminalDestroyed, 1)
  }
)

await check('terminal setup failure releases loading and terminates its own PTY', async () => {
  const flow = await chain()
  flow.terminal.show = true
  flow.failMount()
  assert.equal(await flow.terminal.install({}), false)
  assert.equal(flow.terminal.loading, false)
  assert.equal(flow.counts().terminalStops, 1)
  assert.equal(flow.counts().hostWrites, 0)
  assert.ok(flow.messages.some((msg) => msg.includes('PTY initialization failed')))
})

await check('failed repair of a healthy helper does not report installation success', async () => {
  const flow = await chain()
  flow.setInstalled(true)
  flow.terminal.show = true
  flow.failTerminalExecution()
  const result = flow.terminal.install({})
  await tick()
  flow.finishTerminal()
  assert.equal(await result, false)
  assert.equal(flow.counts().hostWrites, 0)
  assert.ok(!flow.messages.some((message) => message.startsWith('success:')))
})

await check(
  'NodePTY reports requested Unix exit codes and preserves legacy completion responses',
  async () => {
    for (const trackExit of [true, false]) {
      let exited: (event: any) => void = () => {}
      const replies: any[] = []
      const pty = {
        onData() {},
        onExit: (fn: any) => {
          exited = fn
        },
        write() {},
        kill() {}
      }
      const module = await load(
        'src/main/core/NodePTY.ts',
        {
          'node-pty': { spawn: () => pty },
          '@shared/utils': {
            isLinux: () => true,
            isWindows: () => false,
            isMacOS: () => false,
            uuid: () => 'pty-fixture'
          },
          '../utils': {
            uuid: () => 'pty-fixture',
            writeFile: async () => {},
            chmod: async () => {},
            remove: async () => {}
          },
          '@shared/EnvSync': { default: { sync: async () => ({}) } },
          '@shared/fs-extra': {
            writeFile: async () => {},
            chmod: async () => {},
            existsSync: () => false
          }
        },
        { global: { Server: { Cache: '/tmp/flyenv-test' } } }
      )
      const owner = module.default
      owner.onSendCommand((_command: string, _key: string, response: any) => replies.push(response))
      await owner.initNodePty()
      await owner.exec('pty-fixture', ['false'], true, 'NodePty:exec', 'request', trackExit)
      exited({ exitCode: 1 })
      assert.equal(replies.length, 1)
      if (trackExit) assert.equal(replies[0].code, 1, 'installer must receive a failed exit status')
      else assert.equal(replies[0], true, 'existing terminal tasks keep their completion contract')
    }
  }
)

await check(
  'XTerm installation scripts preserve real Linux success and failure exit codes',
  async () => {
    for (const [command, success] of [
      ['true', true],
      ['false', false]
    ] as const) {
      const module = await load('src/render/util/XTerm.ts', {
        './IPC': {
          default: {
            off() {},
            send(
              _name: string,
              _pty: string,
              lines: string[],
              _oneFile: boolean,
              trackExit: boolean
            ) {
              assert.equal(trackExit, true)
              return {
                then(callback: any) {
                  const executable = process.platform === 'win32' ? 'wsl' : '/bin/bash'
                  const args =
                    process.platform === 'win32'
                      ? ['-d', 'Ubuntu-24.04', '--exec', '/bin/bash', '-c', lines.join('\n')]
                      : ['-c', lines.join('\n')]
                  const result = spawnSync(executable, args, { encoding: 'utf8' })
                  if (result.error) throw result.error
                  callback('request', {
                    code: result.status === 0 ? 0 : 1,
                    msg: 'installer failed'
                  })
                }
              }
            }
          }
        }
      })
      const terminal = new module.XTerm()
      terminal.ptyKey = 'fixture'
      if (success) assert.equal(await terminal.send([command], true, true), true)
      else await assert.rejects(terminal.send([command], true, true), /installer failed/)
    }
  }
)

await check(
  'a hosts synchronization failure preserves a completed helper installation',
  async () => {
    const flow = await chain()
    flow.failHosts()
    assert.equal(await flow.helper.repair(), true)
    await tick()
    assert.equal(flow.counts().pkexecCalls, 1)
    assert.ok(flow.messages.some((msg) => msg.includes('hosts write denied')))
  }
)

await check(
  'installation timeout reports an unknown result without opening another installation',
  async () => {
    const flow = await chain()
    // Hold the first prerequisite to model authorization still running in main.
    flow.backend.command = () => new Promise(() => {})
    const pending = flow.helper.repair()
    await tick()
    for (const timeout of flow.timers) timeout()
    assert.equal(await pending, false)
    await tick()
    assert.equal(flow.terminal.show, false)
    assert.equal(flow.counts().terminalRuns, 0)
  }
)

await check(
  'pending graphical installation blocks terminal repair, including after renderer timeout',
  async () => {
    const flow = await chain()
    flow.backend.command = () => new Promise(() => {})
    const pending = flow.helper.repair()
    await tick()
    await flow.terminal.open()
    assert.equal(
      flow.terminal.show,
      false,
      'pending graphical installation must block a manual installer'
    )
    for (const timeout of flow.timers) timeout()
    assert.equal(await pending, false)
    const response = await new Promise<any>((resolve) =>
      flow.ipc.send('APP:FlyEnv-Helper-Command').then((_key: string, res: any) => resolve(res))
    )
    assert.equal(
      response.code,
      1,
      'main must retain the pending installation guard after renderer timeout'
    )
    assert.equal(flow.counts().terminalRuns, 0)
  }
)

await check(
  'XTerm rejects failed PTY initialization and failed execution acknowledgements',
  async () => {
    const response: any = { code: 1, msg: 'PTY spawn failed' }
    const callbacks = new Map<string, any>()
    let count = 0
    const ipc = {
      send(command: string) {
        const key = `pty-${++count}`
        if (command === 'NodePty:init' || command === 'NodePty:exec')
          queueMicrotask(() => callbacks.get(key)?.(key, response))
        return { key, then: (fn: any) => callbacks.set(key, fn) }
      },
      on: (key: string) => ({ then: (fn: any) => callbacks.set(key, fn) }),
      off: (key: string) => callbacks.delete(key)
    }
    const module = await load('src/render/util/XTerm.ts', {
      './IPC': { default: ipc },
      '@/store/app': { AppStore: () => ({ config: { setup: { theme: 'dark' } } }) },
      '@xterm/xterm': {
        Terminal: class {
          cols = 80
          rows = 24
          loadAddon() {}
          open() {}
          focus() {}
          write() {}
        }
      },
      '@xterm/addon-fit': {
        FitAddon: class {
          fit() {}
        }
      },
      '@xterm/addon-webgl': { WebglAddon: class {} }
    })
    const terminal = new module.XTerm()
    terminal.initEvent = () => {}
    terminal.initLog = () => {}
    let result = 'pending'
    terminal.mount({}).then(
      () => {
        result = 'resolved'
      },
      () => {
        result = 'rejected'
      }
    )
    await tick()
    assert.equal(
      result,
      'rejected',
      'failed initialization must not start a terminal with an empty PTY key'
    )
    terminal.ptyKey = 'valid-pty'
    await assert.rejects(terminal.send(['true']), /PTY spawn failed/)
    assert.equal([...callbacks.keys()].filter((key) => key.startsWith('pty-')).length, 0)
  }
)

await check(
  'NodePTY initialization rejects environment or spawn failures instead of hanging main IPC',
  async () => {
    for (const failEnvironment of [true, false]) {
      const module = await load('src/main/core/NodePTY.ts', {
        '../utils': { uuid: () => 'failed-pty' },
        '@shared/utils': { isMacOS: () => false, isWindows: () => false, isLinux: () => true },
        '@shared/EnvSync': {
          default: {
            sync: async () => {
              if (failEnvironment) throw new Error('environment unavailable')
              return {}
            }
          }
        },
        'node-pty': {
          spawn: () => {
            throw new Error('spawn failed')
          }
        }
      })
      await assert.rejects(
        module.default.initNodePty(),
        failEnvironment ? /environment unavailable/ : /spawn failed/
      )
    }
  }
)

if (failures.length) throw new AggregateError(failures, 'Linux helper installation flow failures')
