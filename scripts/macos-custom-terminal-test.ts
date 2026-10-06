import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-macos-custom-terminal-'))
const cacheDirectory = join(directory, `cache 'quote' \\ "terminal"`)
await mkdir(cacheDirectory)
const state = {
  files: new Map<string, string>(),
  scripts: [] as string[],
  launches: [] as string[],
  modes: [] as string[],
  failLaunch: false,
  failCleanup: false,
  pidWaits: 0,
  windows: false,
  helperCalls: [] as unknown[][]
}
;(globalThis as any).__macCustomTerminal = state
;(globalThis as any).Server = { Cache: cacheDirectory, FTPDir: directory, Static: directory }
try {
  const fnMock = `import {existsSync as exists} from 'node:fs';
    const state=globalThis.__macCustomTerminal;
    export const uuid=()=>String(state.scripts.length);
    export const writeFile=async(path,content)=>state.files.set(path,content);
    export const chmod=async(_,mode)=>state.modes.push(mode);
    export const remove=async(path)=>{if(state.failCleanup)throw Error('cleanup failed');state.files.delete(path)};
    export const existsSync=exists;
    export const execPromise=async(command)=>{
      state.launches.push(command);
      state.scripts.push([...state.files.values()].at(-1));
      if(state.failLaunch)throw Error('terminal launch failed');
    };
    export const waitPidFile=async()=>{state.pidWaits++;return {pid:'32123'}};
    export const readFile=async()=>'';
    export const copyFile=async()=>{},spawnPromiseWithEnv=async()=>{};
    export const mkdirp=async()=>{},spawnPromiseWithStdin=async()=>{};
    export const brewInfoJson=()=>{},portSearch=()=>{},versionFilterSame=()=>{},versionFixed=()=>{},versionLocalFetch=()=>{},versionSort=()=>{};
    export const execPromiseSudo=execPromise;
    export const customerServiceStartExec=async()=>{throw Error('unexpected background launch')};
    export const customerServiceStartExecWin=customerServiceStartExec;`
  const mocks: Record<string, string> = {
    '@shared/utils': `export const isMacOS=()=>true,isLinux=()=>false,isWindows=()=>globalThis.__macCustomTerminal.windows,appDebugLog=async()=>{};`,
    '@lang/runtime': `export const I18nT=(key)=>key;`,
    '@shared/ServiceProcessIdentity': `export const captureServiceProcessIdentity=async()=>({createdAt:1}),stopRegisteredServiceProcesses=async()=>[];`,
    '@shared/ServiceStopContext': `export const withServiceStopContext=(_,fn)=>fn();`,
    '@shared/EnvSync': `export default {sync:async()=>{}};`,
    '../Base': `export class Base {};`,
    '../../TaskQueue': `export default class {};`,
    '../../util/BinVersionCache': `export const withBinVersionCache=async(_,fn)=>fn();`,
    '../../Helper': `export default {send:async(...args)=>{globalThis.__macCustomTerminal.helperCalls.push(args);return 32123}};`
  }
  const bundled = await build({
    stdin: {
      contents: `export {default as custom} from './src/fork/module/ModuleCustomer'; export {default as project} from './src/fork/module/LanguageProject'; export {default as ftp} from './src/fork/module/PureFtpd';`,
      resolveDir: process.cwd()
    },
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    plugins: [
      {
        name: 'macos-custom-terminal',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            if (/^(?:\.\.\/)+Fn$/.test(path)) return { path: 'Fn', namespace: 'mock' }
            if (mocks[path]) return { path, namespace: 'mock' }
            return undefined
          })
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: path === 'Fn' ? fnMock : mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const fixture = join(directory, 'fixture.mjs')
  await writeFile(fixture, bundled.outputFiles[0].text)
  const { custom, project, ftp } = await import(pathToFileURL(fixture).href)
  const runFile = join(cacheDirectory, `run 'quoted' \\ "file".sh`)
  await writeFile(runFile, '#!/bin/sh\nprintf "%s\\0" "$PWD" "$NOTE" "$PATH"\n')
  await chmod(runFile, 0o700)
  const note = `literal $HOME \\ slash "quote" 'apostrophe' \`backtick\``
  const command = `printf '%s\\n' "first line"\nprintf '%s\\n' 'second \\ line'`
  const getCommand = () => {
    const script = state.scripts.at(-1)!
    const match = script.match(/do script "((?:\\.|[^"\\])*)"/)
    assert.ok(match, 'Terminal command must remain one escaped AppleScript string')
    return JSON.parse(`"${match[1]}"`) as string
  }
  const getSudoPayload = () => {
    const words = execFileSync('/bin/sh', ['-c', `set -- ${getCommand()}; printf '%s\\0' "$@"`])
      .toString()
      .split('\0')
    assert.deepEqual(words.slice(0, 4), ['/usr/bin/sudo', '--', '/bin/zsh', '-lc'])
    assert.equal(words.length, 6, 'sudo shell receives exactly one command argument')
    return words[4]
  }

  await custom.startService(
    { commandType: 'command', command: 'echo terminal', isSudo: true },
    false,
    true
  )
  assert.equal(
    getSudoPayload(),
    'echo terminal',
    'custom sudo commands must authenticate in Terminal'
  )
  await custom.startService({ commandType: 'command', command, isSudo: true }, false, true)
  assert.equal(getSudoPayload(), command, 'custom sudo commands preserve multiline and backslashes')
  await custom.startService({ commandType: 'command', command, isSudo: false }, false, true)
  assert.equal(getCommand(), command, 'ordinary commands must not acquire sudo')
  await custom.startService(
    { commandType: 'file', commandFile: runFile, isSudo: true },
    false,
    true
  )
  assert.equal(
    execFileSync('/bin/zsh', ['-lc', getSudoPayload()]).toString().split('\0')[0].length > 0,
    true,
    'quoted command files remain executable without splitting their paths'
  )

  const item = {
    id: 'project',
    commandType: 'file',
    runFile,
    path: cacheDirectory,
    binBin: runFile,
    envVarType: 'specify',
    envVar: `NOTE=${note}`,
    pidPath: join(directory, 'project.pid'),
    isSudo: true
  }
  const result = await project.startService(item, 'node', undefined, true)
  assert.equal(result['APP-Service-Start-PID'], '32123')
  const output = execFileSync('/bin/zsh', ['-lc', getSudoPayload()]).toString().split('\0')
  assert.equal(
    output[0],
    cacheDirectory,
    'project terminal commands retain the configured working directory'
  )
  assert.equal(
    output[1],
    note,
    'environment values remain literal across shell and AppleScript quoting'
  )
  assert.ok(
    output[2].startsWith(`${cacheDirectory}:`),
    'the selected runtime stays first on PATH inside sudo'
  )
  await project.startService(
    { ...item, commandType: 'command', runCommand: command, isSudo: false },
    'node',
    undefined,
    true
  )
  assert.doesNotMatch(getCommand(), /\/usr\/bin\/sudo/)
  assert.ok(getCommand().endsWith(command), 'ordinary projects preserve the original command')
  assert.equal(state.files.size, 0, 'successful terminal launch removes its temporary AppleScript')
  assert.ok(
    state.modes.every((mode) => mode === '0600'),
    'temporary AppleScript must be private'
  )
  const launchWords = execFileSync('/bin/sh', [
    '-c',
    `set -- ${state.launches.at(-1)}; printf '%s\\0' "$@"`
  ])
    .toString()
    .split('\0')
  assert.equal(launchWords[0], '/usr/bin/osascript')
  assert.equal(launchWords.length, 3, 'the quoted cache path is one osascript argument')
  assert.ok(launchWords[1].startsWith(cacheDirectory))

  const waitsBeforeFailure = state.pidWaits
  state.failLaunch = true
  await assert.rejects(
    project.startService(item, 'node', undefined, true),
    /terminal launch failed/
  )
  assert.equal(state.files.size, 0, 'failed terminal launch removes its temporary AppleScript')
  assert.equal(
    state.pidWaits,
    waitsBeforeFailure,
    'launch failures do not continue to PID registration'
  )
  state.failCleanup = true
  await assert.rejects(
    project.startService(item, 'node', undefined, true),
    /terminal launch failed/
  )
  state.failLaunch = false
  assert.equal(
    await custom.startService({ commandType: 'command', command: 'true' }, false, true),
    true,
    'cleanup errors do not overwrite a successfully dispatched command'
  )
  state.failCleanup = false
  state.windows = true
  await assert.rejects(
    ftp._startServer({ bin: '/usr/local/bin/pure-ftpd' }),
    /Pure-FTPd is not supported on Windows/
  )
  assert.equal(state.helperCalls.length, 0, 'unsupported Windows FTP must not invoke the helper')
  state.windows = false
  assert.deepEqual(await ftp._startServer({ bin: '/usr/local/bin/pure-ftpd' }), {
    'APP-Service-Start-PID': '32123'
  })
  assert.deepEqual(
    state.helperCalls,
    [['ftp', 'start', { bin: '/usr/local/bin/pure-ftpd' }]],
    'Unix FTP retains the fixed helper lifecycle'
  )
  console.log(
    'macOS custom/project Terminal sudo, quoting, environment, cwd, cleanup and fixed Unix FTP lifecycle passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__macCustomTerminal
  delete (globalThis as any).Server
}
