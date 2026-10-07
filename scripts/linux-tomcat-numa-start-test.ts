import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-tomcat-numa-'))
const starts: any[] = []
const files: Record<string, string> = {}
const fixture = { starts, files, linux: true, fail: false, unreadable: false }
;(globalThis as any).__lowPortModules = fixture
;(globalThis as any).Server = { BaseDir: directory }
const fnNames = [
  'brewInfoJson',
  'brewSearch',
  'versionBinVersion',
  'versionFilterSame',
  'versionFixed',
  'versionLocalFetch',
  'versionSort',
  'chmod',
  'copyFile',
  'remove',
  'removeByRoot',
  'zipUnpack',
  'moveChildDirToParent',
  'execPromiseWithEnv',
  'binXattrFix',
  'serviceStartExecCMD'
]
const mocks: Record<string, string> = {
  fn: `const fixture=globalThis.__lowPortModules;
    export const AppLog=(...args)=>args,mkdirp=async()=>{},waitTime=async()=>{};
    export const readFile=async(path)=>{if(fixture.unreadable)throw Error('read failed');return fixture.files[path]??''};
    export const writeFile=async(path,content)=>{fixture.files[path]=content};
    export const ${fnNames.map((name) => `${name}=async()=>{throw Error('unexpected ${name}')}`).join(',')};`,
  base: 'export class Base {}',
  task: 'export default {}',
  xml: 'export const reconcileTomcatBase=async()=>{},restoreTomcatBase=async()=>{},snapshotTomcatBase=async()=>{}',
  site: 'export const tomcatAutoSSLDeletionId=()=>{}',
  host: 'export default {}',
  hostfile: 'export const fetchHostList=async()=>[],saveHostList=async()=>{}',
  start: `export const serviceStartSpawn=async(params)=>{
    const f=globalThis.__lowPortModules;f.starts.push(params);if(f.fail)throw Error('launch failed');
    return {'APP-Service-Start-PID':'12345'}
  }`,
  utils:
    'export const isLinux=()=>globalThis.__lowPortModules.linux,isMacOS=()=>!globalThis.__lowPortModules.linux,isWindows=()=>false',
  env: "export default {sync:async()=>({JAVA_HOME:'/opt/java'})}",
  lang: 'export const I18nT=(key)=>key',
  process:
    'export const ProcessListFetch=async()=>[],ProcessSearch=()=>globalThis.__lowPortModules.fail?[]:[{PID:"12345"}]',
  win: 'export const ProcessListSearch=async()=>[]'
}
try {
  const result = await build({
    stdin: {
      contents:
        "export {default as tomcat} from './src/fork/module/Tomcat';export {default as numa} from './src/fork/module/Numa'",
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'low-port-module-fixtures',
        setup(builder) {
          const paths: Record<string, string> = {
            '../../Fn': 'fn',
            '../Base': 'base',
            '../../TaskQueue': 'task',
            './ServerXML': 'xml',
            './Site': 'site',
            '../Host': 'host',
            '../Host/HostFile': 'hostfile',
            '../../util/ServiceStart': 'start',
            '@shared/utils': 'utils',
            '@shared/EnvSync': 'env',
            '@lang/runtime': 'lang',
            '@shared/Process': 'process',
            '@shared/Process.win': 'win'
          }
          builder.onResolve({ filter: /./ }, ({ path }) =>
            paths[path] ? { path: paths[path], namespace: 'fixture' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'fixture' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const bundle = join(directory, 'modules.mjs')
  await writeFile(bundle, result.outputFiles[0].text)
  const { tomcat, numa } = await import(pathToFileURL(bundle).href)
  tomcat.init()
  numa.init()
  const tomcatBase = join(directory, 'tomcat/custom base')
  const resolved = (value: string) =>
    Object.assign(Promise.resolve(value), { on: () => resolved(value) })
  tomcat._initDefaultDir = () => resolved(tomcatBase)
  const configFile = join(directory, 'numa/numa.toml')
  numa.initConfig = () => resolved(configFile)
  files[join(tomcatBase, 'conf/server.xml')] = `<Server port="8005"><Service><Connector port="80"/>
    <!-- <Connector port="21"/> --><Connector port="443"/></Service>
    <Service><Connector port="8080"/></Service></Server>`
  files[configFile] =
    `[server]\nbind_addr="[::]:53"\napi_port=5380\n[proxy]\nenabled=true\nport=80\ntls_port=443`
  const tomcatVersion = { typeFlag: 'tomcat', version: '11', bin: '/opt/tomcat/bin/startup.sh' }
  const numaVersion = { typeFlag: 'numa', version: '1', bin: '/opt/numa' }
  assert.equal((await tomcat._startServer(tomcatVersion))['APP-Service-Start-PID'], '12345')
  assert.equal(starts[0].lowPortService, true, 'Tomcat must opt into Linux low-port startup')
  assert.deepEqual(starts[0].listenPorts, [8005, 80, 443, 8080])
  assert.equal(starts[0].bin, '/opt/tomcat/bin/catalina.sh')
  assert.deepEqual(starts[0].execArgs, ['run'])
  assert.equal(starts[0].execEnv.CATALINA_BASE, tomcatBase)
  assert.equal(starts[0].execEnv.JAVA_HOME, '/opt/java')
  assert.equal((await numa._startServer(numaVersion))['APP-Service-Start-PID'], '12345')
  assert.equal(starts[1].lowPortService, true, 'NUMA must opt into Linux low-port startup')
  assert.deepEqual(starts[1].listenPorts, [53, 5380, 80, 443, 853])
  assert.deepEqual(starts[1].execArgs, [configFile])

  files[join(tomcatBase, 'conf/server.xml')] = `<Server port="-1" portOffset="10000"><Service>
    <Connector port="80"/><Connector port="0" redirectPort="443"/></Service></Server>`
  files[configFile] =
    `[server]\nbind_addr="127.0.0.1:5353"\napi_port=8080\n[proxy]\nenabled=false\nport=80\ntls_port=443`
  await tomcat._startServer(tomcatVersion)
  await numa._startServer(numaVersion)
  assert.deepEqual(
    starts[2].listenPorts,
    [10080],
    'Tomcat portOffset and disabled listeners matter'
  )
  assert.deepEqual(
    starts[3].listenPorts,
    [5353, 8080, 853],
    'disabled NUMA proxy still leaves the default DoT listener enabled'
  )
  const numaCases: Array<[string, number[]]> = [
    ['', [53, 5380, 80, 443, 853]],
    [
      '[server]\nbind_addr="127.0.0.1:5353"\napi_port=8080\n[dot]\nenabled=false',
      [5353, 8080, 80, 443]
    ],
    [
      '[server]\nbind_addr=["[::]:5353", "127.0.0.1:53"]\napi_port=8080\n[proxy]\nenabled=false',
      [5353, 53, 8080, 853]
    ],
    [
      '[server]\nbind_addr="[::]:5353"\napi_port=8080\n[proxy]\nenabled=false\n[dot]\nenabled=false',
      [5353, 8080]
    ],
    [
      '[server]\nbind_addr="[::]:5353"\napi_port=8080\n[proxy]\nenabled=false\n[dot]\nport=8853',
      [5353, 8080, 8853]
    ],
    [
      '[server]\nbind_addr="[::]:5353"\napi_port=8080\n[proxy]\nenabled=false\n[dot]\nenabled=false\n[mobile]\nenabled=true\nport=81',
      [5353, 8080, 81]
    ],
    ['[mobile]\nenabled=true', [53, 5380, 80, 443, 853, 8765]]
  ]
  for (const [content, expectedPorts] of numaCases) {
    files[configFile] = content
    await numa._startServer(numaVersion)
    assert.deepEqual(starts.at(-1).listenPorts, expectedPorts, `NUMA listeners: ${content}`)
  }
  fixture.unreadable = true
  await tomcat._startServer(tomcatVersion)
  await numa._startServer(numaVersion)
  assert.deepEqual(
    starts.at(-2).listenPorts,
    [],
    'port discovery failure must allow actual startup'
  )
  assert.deepEqual(starts.at(-1).listenPorts, [])
  fixture.unreadable = false
  fixture.fail = true
  await assert.rejects(tomcat._startServer(tomcatVersion), /launch failed/)
  await assert.rejects(numa._startServer(numaVersion), /launch failed/)
  fixture.fail = false
  fixture.linux = false
  await tomcat._startServer(tomcatVersion)
  await numa._startServer(numaVersion)
  assert.equal(starts.at(-2).lowPortService, false)
  assert.equal(starts.at(-1).lowPortService, false)
  console.log(
    'Tomcat / NUMA: Linux low-port startup, config ports, failure boundaries and macOS routing passed'
  )
} finally {
  delete (globalThis as any).__lowPortModules
  delete (globalThis as any).Server
  await rm(directory, { recursive: true, force: true })
}
