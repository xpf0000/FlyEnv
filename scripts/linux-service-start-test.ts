import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const calls: unknown[][] = []
;(globalThis as any).__linuxHelperTest = {
  send: async (...args: unknown[]) => {
    calls.push(args)
    return 12345
  }
}
const mocks: Record<string, string> = {
  helper: 'export default globalThis.__linuxHelperTest',
  utils: 'export const isLinux=()=>true,isMacOS=()=>false,isWindows=()=>false',
  env: 'export default {sync:async()=>process.env}',
  lang: 'export const I18nT=(key)=>key',
  process: 'export const ProcessListFetch=async()=>[]',
  windows:
    'export const resolveWindowsPowerShellPath=()=>{throw Error("unexpected Windows launcher")}',
  fn: `import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';
    export const existsSync=fs.existsSync,writeFile=fsp.writeFile;
    export const readFile=(p,...args)=>p==='/proc/sys/net/ipv4/ip_unprivileged_port_start' ? Promise.resolve(String(globalThis.__linuxHelperTest.threshold ?? 1024)) : fsp.readFile(p,...args);
    export const mkdirp=(p)=>fsp.mkdir(p,{recursive:true}),remove=(p)=>fsp.rm(p,{force:true,recursive:true});
    export const AppLog=(...args)=>args;
    export const execPromise=async()=>{throw Error('unexpected command')};
    export const execPromiseSudo=execPromise,removeByRoot=execPromise,spawnPromiseWithEnv=execPromise,waitPidFile=execPromise,waitTime=execPromise;`
}
const directory = await mkdtemp(join(tmpdir(), 'flyenv-linux-start-test-'))
try {
  const result = await build({
    stdin: {
      contents:
        "export * from './src/fork/util/ServiceStart'; export * from './src/fork/module/Host/LinuxHosts'; export * from './src/fork/util/ListenPorts'; export * from './src/fork/module/Caddy/Ports'",
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    packages: 'external',
    plugins: [
      {
        name: 'linux-start-fixtures',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            const name =
              path === '../Helper' || path === '../../Helper'
                ? 'helper'
                : path === '../Fn' || path === '../../Fn'
                  ? 'fn'
                  : path === '@shared/utils'
                    ? 'utils'
                    : path === '@shared/EnvSync'
                      ? 'env'
                      : path === '@lang/runtime'
                        ? 'lang'
                        : path === '@shared/Process'
                          ? 'process'
                          : path === '@shared/WindowsSystemPaths'
                            ? 'windows'
                            : ''
            return name ? { path: name, namespace: 'fixtures' } : undefined
          })
          builder.onLoad({ filter: /./, namespace: 'fixtures' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const bundle = join(directory, 'start.mjs')
  await writeFile(bundle, result.outputFiles[0].text)
  const {
    serviceStartSpawn,
    serviceStartExec,
    customerServiceStartExec,
    syncLinuxHosts,
    replaceLinuxHosts,
    finishLinuxHostsEditing,
    portsFromListenConfig,
    portsFromCaddyConfig
  } = await import(pathToFileURL(bundle).href)
  assert.deepEqual(
    portsFromListenConfig(
      '# listen 1;\n listen [::]:443 ssl;\n Listen "127.0.0.1:8080"\nlisten unix:/tmp/http.sock;'
    ),
    [443, 8080]
  )
  assert.deepEqual(
    portsFromListenConfig('http { server { listen 80; listen "[::]:443" ssl; } } # listen 21;'),
    [80, 443]
  )
  assert.deepEqual(
    portsFromListenConfig('http { server { listen\n80; set $x "listen 21;"; } }'),
    [80]
  )
  assert.deepEqual(
    portsFromCaddyConfig({
      admin: { listen: ':81' },
      apps: { http: { servers: { main: { listen: [':8443'], tls_connection_policies: [{}] } } } }
    }),
    [81, 8443, 80]
  )
  assert.deepEqual(
    portsFromCaddyConfig({
      apps: {
        http: {
          http_port: 8080,
          https_port: 8443,
          servers: { main: { listen: ['[::]:8443'], automatic_https: { disable_redirects: true } } }
        }
      }
    }),
    [8443]
  )
  const common = {
    version: { typeFlag: 'nginx', version: 'test' },
    baseDir: directory,
    bin: process.execPath,
    on: () => {},
    waitTime: 80,
    lowPortService: true
  }
  const direct = await serviceStartSpawn({
    ...common,
    listenPorts: [21, 443],
    execArgs: ['-e', 'throw Error("known low ports must not execute ordinary startup")']
  })
  assert.equal(direct['APP-Service-Start-PID'], '12345')
  assert.equal(calls.length, 1, 'known low ports must use helper before executing the service')
  calls.length = 0
  const ordinary = await serviceStartSpawn({
    ...common,
    listenPorts: [8080, 8443],
    execArgs: ['-e', 'setInterval(()=>{},1000)']
  })
  assert.equal(calls.length, 0, 'ordinary startup must not use helper')
  process.kill(Number(ordinary['APP-Service-Start-PID']))
  ;(globalThis as any).__linuxHelperTest.threshold = 0
  const unrestricted = await serviceStartSpawn({
    ...common,
    listenPorts: [80],
    execArgs: ['-e', 'setInterval(()=>{},1000)']
  })
  assert.equal(calls.length, 0, 'lowered system port threshold allows direct ordinary startup')
  process.kill(Number(unrestricted['APP-Service-Start-PID']))
  delete (globalThis as any).__linuxHelperTest.threshold

  const pidPath = join(directory, 'service.pid')
  const lowPort = await serviceStartSpawn({
    ...common,
    pidPath,
    execArgs: ['-e', 'process.stderr.write("bind() failed: permission denied\\n");process.exit(1)']
  })
  assert.equal(lowPort['APP-Service-Start-PID'], '12345')
  assert.equal(await readFile(pidPath, 'utf8'), '12345')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 2), ['service', 'launchLowPort'])
  assert.ok(Array.isArray((calls[0][2] as any).args), 'helper receives argv, never a shell script')

  await assert.rejects(
    serviceStartSpawn({
      ...common,
      execArgs: ['-e', 'process.stderr.write("invalid config\\n");process.exit(1)']
    }),
    /invalid config/
  )
  assert.equal(calls.length, 1, 'old bind errors in logs must not trigger a privileged retry')
  await assert.rejects(serviceStartExec({ ...common, root: true }), /does not execute root scripts/)
  await assert.rejects(customerServiceStartExec({ isSudo: true }, true), /must run in XTerm/)
  const lines = ['203.0.113.10     arbitrary.example']
  ;(globalThis as any).__linuxHelperTest.send = async (...args: unknown[]) => {
    calls.push(args)
    if (args[1] === 'readHosts')
      return {
        content: `custom\n#X-HOSTS-BEGIN#\n${lines[0]}\n#X-HOSTS-END#\n`,
        digest: 'a'.repeat(64)
      }
    if (args[1] === 'syncManagedEntries')
      return (args[2] as any).entries[0]?.domain !== 'arbitrary.example'
    return true
  }
  assert.equal(await syncLinuxHosts(lines), false, 'matching managed block must not be rewritten')
  assert.equal(calls.length, 3, 'helper owns the no-change decision')
  assert.equal(await syncLinuxHosts(['198.51.100.200     another.domain']), true)
  assert.deepEqual(calls.at(-1), [
    'host',
    'syncManagedEntries',
    { entries: [{ ip: '198.51.100.200', domain: 'another.domain' }], digest: 'a'.repeat(64) }
  ])
  let release!: (value: boolean) => void
  ;(globalThis as any).__linuxHelperTest.send = () =>
    new Promise<boolean>((resolve) => {
      release = resolve
    })
  const edit = replaceLinuxHosts('draft', 'b'.repeat(64))
  await new Promise((resolve) => setImmediate(resolve))
  let drained = false
  const finish = finishLinuxHostsEditing().then(() => {
    drained = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(drained, false, 'quit cleanup must wait for a pending full-text save')
  await assert.rejects(replaceLinuxHosts('late edit', 'c'.repeat(64)), /closing/)
  release(true)
  assert.equal(await edit, true)
  await finish
  assert.equal(drained, true)
  console.log(
    'Linux service start: ordinary launch, low-port retry, fresh diagnostics and root-script rejection passed'
  )
} finally {
  delete (globalThis as any).__linuxHelperTest
  await rm(directory, { recursive: true, force: true })
}
