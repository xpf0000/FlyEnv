import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { createAppHelperChecker } from '../src/shared/AppHelperCheck'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-helper-chain-'))
const diagnostics: string[] = []
;(globalThis as any).__flyenvHelperChainDiagnostics = diagnostics
try {
  const mocks: Record<string, string> = {
    '@shared/utils': `import {randomUUID} from 'node:crypto';export const uuid=randomUUID,isLinux=()=>true,isWindows=()=>false,appDebugLog=async(flag,info)=>{globalThis.__flyenvHelperChainDiagnostics.push(flag+': '+info);throw Error('debug file unavailable')};`,
    '@lang/runtime':
      "export const I18nT=(key)=>key==='menu.needInstallHelper'?'FlyEnv需要安装帮助程序':key;",
    '@shared/AppHelperCheck': `export const AppHelperCheck=async()=>true,AppHelperSocketPathGet=async()=>'',getHelperKey=async()=>null,helperResponseErrorCode=(msg)=>msg==='invalid signature'?'helper_signature_invalid':'helper_execution_failed',helperTaskAuthFields=()=>({}),signTaskItem=()=>'',windowsHelperBinaryExists=()=>true;`,
    '@shared/WindowsPrivilege': 'export const hasWindowsPrivilegeProvider=()=>false;',
    '@shared/WindowsPrivilegeOperation':
      'export const executeWindowsPrivilegeOperation=()=>{throw Error("unexpected Windows operation")};',
    '@shared/WindowsHelperFallback':
      'export const runWindowsHelperFallback=()=>{throw Error("unexpected Windows fallback")};',
    '@shared/OperationTiming': 'export const timeOperation=(_name,fn)=>fn();',
    '@shared/WindowsPathDiagnostics': 'export const bindWindowsPathLogger=()=>()=>{};'
  }
  const result = await build({
    stdin: {
      contents:
        "export {Helper} from './src/fork/Helper'; export {AppHelperError} from './src/shared/WindowsHelperState'",
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'linux-helper-boundaries',
        setup(builder) {
          // Use the same Error class as the real checker loaded by this script.
          builder.onResolve({ filter: /WindowsHelperState$/ }, () => ({
            path: pathToFileURL(join(process.cwd(), 'src/shared/WindowsHelperState.ts')).href,
            external: true
          }))
          builder.onResolve({ filter: /^@shared\// }, ({ path }) =>
            path in mocks ? { path, namespace: 'mock' } : undefined
          )
          builder.onResolve({ filter: /^@lang\/runtime$/ }, ({ path }) => ({
            path,
            namespace: 'mock'
          }))
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const file = join(directory, 'chain.mjs')
  await writeFile(file, result.outputFiles[0].text)
  const { Helper, AppHelperError } = await import(pathToFileURL(file).href)
  for (const [code, shouldNotify] of [
    ['helper_binary_missing', true],
    ['helper_unreachable', true],
    ['helper_pipe_unreachable', true],
    ['helper_version_mismatch', true],
    ['helper_key_missing', true],
    ['helper_key_invalid', true],
    ['helper_key_inaccessible', false],
    ['helper_execution_failed', false],
    ['helper_signature_invalid', true],
    ['elevation_cancelled', false]
  ] as const) {
    let notices = 0
    let fallback = 0
    let connects = 0
    const error = new AppHelperError(code, 'test failure')
    const keyFailure = code === 'helper_key_missing' || code === 'helper_key_invalid'
    const helper = new Helper({
      appHelperCheck: keyFailure
        ? createAppHelperChecker({
            isWindows: () => false,
            isLinux: () => true,
            getHelperKey: async () => (code === 'helper_key_missing' ? null : Buffer.alloc(31)),
            createConnection: (() => {
              connects++
              throw new Error('unexpected unsigned dispatch')
            }) as any
          })
        : async () => {
            throw error
          },
      createConnection: () => {
        connects++
        throw Error('unexpected dispatch')
      },
      isWindows: () => false,
      getHelperKey: async () => null,
      helperRequestTimeoutMs: 100,
      runWindowsHelperFallback: async () => {
        fallback++
        throw Error('unexpected elevation')
      }
    })
    helper.appHelper = {
      needInstall: () => {
        notices++
      },
      initHelper: () => {
        throw Error('daily operation must not install')
      }
    }
    await assert.rejects(helper.send('host', 'readHosts'), (got: any) => {
      assert.equal(got.code, code)
      if (shouldNotify) {
        assert.equal(got.message, 'FlyEnv需要安装帮助程序')
        assert.equal(got.toString(), got.message, 'IPC must not include internal error names')
        assert.equal(got.cause.code, code)
        assert.ok(diagnostics.some((info) => info.includes(got.cause.message)))
        if (!keyFailure) assert.equal(got.cause, error)
        return true
      }
      return got === error
    })
    assert.equal(error.message, 'test failure', 'diagnostic errors must remain unchanged')
    assert.equal(notices, shouldNotify ? 1 : 0, code)
    assert.equal(connects, 0, 'failed prerequisite must not dispatch a business request')
    assert.equal(fallback, 0, 'maintenance hint must not select an elevation fallback')
  }
  for (const persistent of [false, true]) {
    let notices = 0
    let keyReads = 0
    let connects = 0
    const helper = new Helper({
      appHelperCheck: async () => true,
      getHelperKey: async () => Buffer.alloc(32, ++keyReads),
      isWindows: () => false,
      helperRequestTimeoutMs: 100,
      createConnection: () => {
        const attempt = ++connects
        const socket = Object.assign(new EventEmitter(), {
          write(chunk: string) {
            const request = JSON.parse(chunk)
            queueMicrotask(() => {
              socket.emit(
                'data',
                Buffer.from(
                  JSON.stringify(
                    persistent || attempt === 1
                      ? { key: request.key, code: 1, msg: 'invalid signature' }
                      : { key: request.key, code: 0, data: true }
                  )
                )
              )
              socket.emit('end')
            })
          },
          end() {},
          destroy() {}
        })
        queueMicrotask(() => socket.emit('connect'))
        return socket as any
      },
      runWindowsHelperFallback: async () => {
        throw Error('signature repair must not execute a fallback')
      }
    })
    helper.appHelper = {
      needInstall: () => {
        notices++
      },
      initHelper: () => {
        throw Error('signature repair requires user installation confirmation')
      }
    }
    if (persistent) {
      await assert.rejects(helper.send('host', 'readHosts'), (error: any) => {
        assert.equal(error.code, 'helper_signature_invalid')
        assert.equal(error.toString(), 'FlyEnv需要安装帮助程序')
        assert.equal(error.cause.message, 'invalid signature')
        assert.ok(diagnostics.some((info) => info.includes('invalid signature')))
        return true
      })
    } else {
      assert.equal(await helper.send('host', 'readHosts'), true)
    }
    assert.equal(keyReads, 2, 'signature rejection must refresh the cached key once')
    assert.equal(connects, 2, 'signature rejection must not introduce extra retries')
    assert.equal(notices, persistent ? 1 : 0, 'only a persistent mismatch needs installation')
  }
  console.log('Linux helper chain: maintenance hints preserve errors and do not elevate')
} finally {
  delete (globalThis as any).__flyenvHelperChainDiagnostics
  await rm(directory, { recursive: true, force: true })
}
