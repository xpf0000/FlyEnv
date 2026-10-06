import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAppHelperChecker } from '../src/shared/AppHelperCheck'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-helper-chain-'))
try {
  const mocks: Record<string, string> = {
    '@shared/utils': `import {randomUUID} from 'node:crypto';export const uuid=randomUUID,isLinux=()=>true,isWindows=()=>false,appDebugLog=async()=>{};`,
    '@shared/AppHelperCheck': `export const AppHelperCheck=async()=>true,AppHelperSocketPathGet=async()=>'',getHelperKey=async()=>null,helperResponseErrorCode=()=>'',helperTaskAuthFields=()=>({}),signTaskItem=()=>'',windowsHelperBinaryExists=()=>true;`,
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
    ['helper_pipe_unreachable', true],
    ['helper_version_mismatch', true],
    ['helper_key_missing', true],
    ['helper_key_invalid', true],
    ['helper_execution_failed', false],
    ['helper_signature_invalid', false]
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
    await assert.rejects(helper.send('host', 'readHosts'), (got: any) =>
      keyFailure ? got.code === code : got === error
    )
    assert.equal(notices, shouldNotify ? 1 : 0, code)
    assert.equal(connects, 0, 'failed prerequisite must not dispatch a business request')
    assert.equal(fallback, 0, 'maintenance hint must not select an elevation fallback')
  }
  console.log('Linux helper chain: maintenance hints preserve errors and do not elevate')
} finally {
  await rm(directory, { recursive: true, force: true })
}
