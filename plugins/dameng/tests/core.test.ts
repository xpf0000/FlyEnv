import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await realpath(await mkdtemp('/tmp/dm_core_'))
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const harness = {
  list: [] as any[],
  stopped: [] as string[],
  initCount: 0,
  disqlCalls: [] as string[],
  disqlInstance: '',
  disqlAuthFail: false,
  registrationFails: false,
  initFails: false,
  initControlRejects: false,
  installFails: false,
  installHandoff: false,
  uninstallPreflight: false,
  failExitWait: false,
  failUnixStop: false,
  missingBirth: false,
  state: 'Stopped',
  failSavePid: false
}
;(globalThis as any).__damengCore = harness
;(globalThis as any).Server = {
  BaseDir: join(directory, 'server'),
  AppDir: join(directory, 'app'),
  Cache: join(directory, 'cache')
}
const sources: Record<string, string> = {
  axios: 'export default { get(){throw Error("Unexpected network request in regression")}}',
  '@fork/module/Base': `const h=globalThis.__damengCore; export class Base {
    constructor(){ this.type=''; this.pidPath='' } async ensureAppPidDirWritable(){} async saveAppPid(){if(h.failSavePid)throw Error('disk write failed')}
    async removeStoppedAppPid(){} async readPidFromFile(){return ''} async waitWindowsServiceExit(){if(h.failExitWait)throw Error('child still alive');return []}
    _stopServer(v){const p=Promise.resolve().then(()=>{h.stopped.push(v.pid);h.list=[];if(h.failUnixStop)throw Error('engine child still alive');return {'APP-Service-Stop-PID':[v.pid]}});p.on=()=>p;return p}
  }`,
  '@fork/util/ServiceStart': `export const serviceStartSpawn=async o=>{const h=globalThis.__damengCore;h.list=[{PID:'42',COMMAND:o.bin+' '+o.execArgs.join(' '),CREATED:h.missingBirth?undefined:'2026-10-16T01:00:00Z'}];await globalThis.__dmFs.writeFile(o.outFile,'SYSTEM IS READY');return {'APP-Service-Start-PID':'42'}}`,
  '@shared/StopProcessList':
    'export const StopProcessListFetch=async()=>globalThis.__damengCore.list',
  '@shared/Process':
    'export const ProcessListFetch=async()=>globalThis.__damengCore.list;export const ProcessListByExactPid=pid=>globalThis.__damengCore.list.filter(p=>p.PID===pid)',
  './policy': `export * from "/Users/x/Desktop/WorkSpace/GitHub/FlyEnv/plugins/dameng/fork/policy.ts"; import {assertDataPath as data} from "/Users/x/Desktop/WorkSpace/GitHub/FlyEnv/plugins/dameng/fork/policy.ts";
    export const assertDataPath=root=>data(root,false);`,
  'node:os': "export const arch=()=> 'x64';export const freemem=()=>32*1024**3",
  './linux': `export const linuxInstall=async(_iso,dir)=>{const h=globalThis.__damengCore;if(h.installFails)throw Error('external config preflight');{const fs=globalThis.__dmFs;await fs.mkdir(dir+'/bin',{recursive:true});for(const f of ['dmserver','dminit','disql'])await fs.writeFile(dir+'/bin/'+f,'engine');}return {installed:true,handoffError:h.installHandoff?'companion handoff failed':undefined}};export const linuxUninstall=async()=>{if(globalThis.__damengCore.uninstallPreflight)throw Object.assign(Error('missing uninstaller'),{noSideEffects:true});return {uninstalled:true}}`,
  './windows': `const h=globalThis.__damengCore;export const windowsInstall=async()=>{throw Error('UAC canceled')};export const windowsRegisterService=async()=>{if(h.registrationFails)throw Error('ACL handoff failed')};export const windowsServiceStatus=async()=>({state:h.state,pid:h.state==='Running'?'42':''});export const windowsStartService=async()=>{h.state='Running';h.list=[{PID:'42',COMMAND:'dmsvc.exe database FLYENV',CREATED:'2026-10-16T01:00:00Z'}];return {pid:'42'}};export const windowsStopService=async()=>{h.state='Stopped';h.list=[]};export const windowsUninstall=async()=>({uninstalled:true})`
}
const actualFs = await import('node:fs/promises')
;(globalThis as any).__dmFs = actualFs
const runtimePath = resolve('plugins/dameng/fork/runtime.ts')
sources['./runtime'] =
  String.raw`export * from ${JSON.stringify(runtimePath)};const h=globalThis.__damengCore;const fs=globalThis.__dmFs;
  export const downloadPackage=async()=>{};export const extractPinnedIso=async()=>{};
  export const runCommand=async(bin,args,options)=>{if(bin.endsWith('dminit')||bin.endsWith('dminit.exe')){h.initCount++;if(h.initControlRejects)throw Error('[SYSTEM_PATH] value error; invalid control file');const control=await fs.readFile(args[0].slice(8),'utf8');const root=control.match(/SYSTEM_PATH = '(.*)'/)[1].replaceAll("''","'");const instance=control.match(/INSTANCE_NAME = (.*)/)[1];await fs.mkdir(root+'/DAMENG',{recursive:true});await fs.writeFile(root+'/DAMENG/dm.ini','INSTANCE_NAME = '+instance+'\nPORT_NUM = 5236');for(const f of ['SYSTEM.DBF','MAIN.DBF','ROLL.DBF','dm.ctl'])await fs.writeFile(root+'/DAMENG/'+f,'data');if(h.initFails)throw Error('dminit failed after writing files');}if(bin.endsWith('disql')||bin.endsWith('disql.exe')){h.disqlCalls.push(options.input);if(h.disqlAuthFail)throw Error('DM command disql.exe exited 1: [-2501]:Invalid username or password.');return 'FLYENV_DM_READY='+h.disqlInstance+':OPEN';}return 'FLYENV_DM_READY\nFLYENV_DM_LICENSE=2027-01-01';}`
const output = join(directory, 'core.mjs')
try {
  await build({
    entryPoints: ['plugins/dameng/fork/index.ts'],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    plugins: [
      {
        name: 'core-edges',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === '@shared/ForkPromise')
              return { path: resolve('src/shared/ForkPromise.ts') }
            if (
              args.path === './runtime' &&
              args.importer !== resolve('plugins/dameng/fork/index.ts')
            )
              return
            if (args.path in sources) return { path: args.path, namespace: 'edge' }
            return undefined
          })
          builder.onLoad({ filter: /.*/, namespace: 'edge' }, (args) => ({
            contents: sources[args.path],
            resolveDir: process.cwd()
          }))
        }
      }
    ]
  })
  const { default: dm } = await import(pathToFileURL(output).href)
  const { defaultDamengSettings } = await import('../shared')
  const { DAMENG_PACKAGES } = await import('../fork/catalog')
  const setup = async (platform: string, phase: string, active?: any) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    const item = DAMENG_PACKAGES.find((p) => p.platform === platform)!,
      paths = dm.paths(item)
    await mkdir(join(paths.programDir, 'bin'), { recursive: true })
    for (const binary of [
      'dmserver',
      'dminit',
      'disql',
      ...(platform === 'win32' ? ['dmsvc'] : [])
    ])
      await writeFile(
        join(paths.programDir, 'bin', binary + (platform === 'win32' ? '.exe' : '')),
        'fixture'
      )
    await mkdir(join(paths.dataDir, 'DAMENG'), { recursive: true })
    if (phase === 'initialized')
      await writeFile(paths.ini, `INSTANCE_NAME = ${paths.instance}\nPORT_NUM = 5236`)
    await mkdir(join(directory, 'server/dameng/installations'), { recursive: true })
    const m = {
      schema: 1,
      owner: 'flyenv-dameng',
      installId: item.id,
      version: item.version,
      isoSha256: item.isoSha256,
      programDir: paths.programDir,
      dataDir: paths.dataDir,
      instance: paths.instance,
      phase,
      port: 5236,
      active
    }
    await writeFile(paths.manifest, JSON.stringify(m))
    harness.list = []
    harness.stopped = []
    harness.state = 'Stopped'
    harness.disqlCalls = []
    harness.disqlAuthFail = false
    harness.disqlInstance = paths.instance
    harness.failSavePid = false
    harness.failExitWait = false
    harness.failUnixStop = false
    harness.missingBirth = false
    return {
      item,
      paths,
      m,
      row: {
        version: item.version,
        bin: paths.bin,
        path: paths.programDir,
        damengRuntime: { installId: item.id },
        typeFlag: 'dameng'
      }
    }
  }
  dm.platform = async () => {}
  dm.portAvailable = async () => {}
  dm.diskSpace = async (path: string) => {
    await mkdir(path, { recursive: true })
  }
  const realConnection = dm.connection.bind(dm)
  dm.connection = async () => 'FLYENV_DM_READY'

  const params = {
    ...defaultDamengSettings(),
    sysdbaPassword: 'Dm_Secret123!',
    auditorPassword: 'Dm_Audit123!'
  }
  const win = await setup('win32', 'installed')
  assert.equal((await dm.getInitializationState(win.row)).initialized, false)
  // Remove precreated empty database directory so initialization starts from an empty root.
  await rm(win.paths.dataDir, { recursive: true })
  harness.registrationFails = true
  await assert.rejects(
    Promise.resolve(dm.initializeDatabase(win.row, params)),
    /ACL handoff failed/
  )
  assert.equal(harness.initCount, 1)
  assert.equal((await dm.getInitializationState(win.row)).initializationCompleted, true)
  assert.equal((await dm.getInitializationState(win.row)).initialized, false)

  harness.registrationFails = false
  assert.deepEqual(
    await dm.initializeDatabase(win.row),
    { initialized: true, resumed: true },
    'registration recovery must not replay dminit'
  )
  assert.equal((await dm.getInitializationState(win.row)).initialized, true)
  assert.equal(harness.initCount, 1)

  const incomplete = await setup('linux', 'installed')
  await rm(incomplete.paths.dataDir, { recursive: true })
  harness.initFails = true
  await assert.rejects(
    Promise.resolve(dm.initializeDatabase(incomplete.row, params)),
    /dminit failed/
  )
  harness.initFails = false
  const initCount = harness.initCount
  await assert.rejects(
    Promise.resolve(dm.initializeDatabase(incomplete.row, params)),
    /completion.*not confirmed|requires inspection/i,
    'plausible files from failed dminit must not authorize registration recovery'
  )
  assert.equal(harness.initCount, initCount, 'partial initialization must not rerun dminit')

  const parserFailure = await setup('linux', 'installed')
  await rm(parserFailure.paths.dataDir, { recursive: true })
  harness.initControlRejects = true
  await assert.rejects(
    Promise.resolve(dm.initializeDatabase(parserFailure.row, params)),
    /SYSTEM_PATH.*value error/
  )
  harness.initControlRejects = false
  assert.equal((await dm.getInitializationState(parserFailure.row)).initialized, false)
  assert.deepEqual(
    await (await import('node:fs/promises')).readdir(parserFailure.paths.dataDir),
    [],
    'known parser refusal leaves no database files'
  )
  assert.deepEqual(
    await dm.initializeDatabase(parserFailure.row, params),
    { initialized: true, resumed: false },
    'empty-directory retry after parser refusal creates the database without clearing or overwriting files'
  )

  const authFailure = await setup('win32', 'initialized')
  const authIni = await readFile(authFailure.paths.ini, 'utf8')
  const priorInitCount = harness.initCount
  dm.connection = realConnection
  harness.disqlAuthFail = true
  await assert.rejects(
    Promise.resolve(dm.startService(authFailure.row, { sysdbaPassword: 'Strong&Name9!' })),
    /DM authentication failed/
  )
  assert.equal(
    harness.disqlCalls.length,
    1,
    'authentication refusal is not retried with changed passwords'
  )
  assert.ok(
    harness.disqlCalls[0].indexOf('SET DEFINE OFF\n') <
      harness.disqlCalls[0].indexOf('CONNECT SYSDBA/')
  )
  assert.equal(
    harness.state,
    'Stopped',
    'failed required readiness check stops the owned process just started'
  )
  assert.equal(JSON.parse(await readFile(authFailure.paths.manifest, 'utf8')).phase, 'initialized')
  assert.equal(
    await readFile(authFailure.paths.ini, 'utf8'),
    authIni,
    'authentication failure never changes the database or credentials'
  )
  assert.equal(harness.initCount, priorInitCount)
  harness.disqlAuthFail = false
  assert.equal(
    (await dm.startService(authFailure.row, { sysdbaPassword: 'Strong&Name9!' }))[
      'APP-Service-Start-PID'
    ],
    '42',
    'known authentication failure releases admission for an explicit retry'
  )
  await dm._stopServer(authFailure.row)
  dm.connection = async () => 'FLYENV_DM_READY'

  const windowsReused = await setup('win32', 'initialized', { pid: '42', created: 'old' })
  harness.state = 'Running'
  harness.list = [{ PID: '42', CREATED: 'new', COMMAND: 'dmsvc.exe database FLYENV' }]
  await assert.rejects(Promise.resolve(dm._stopServer(windowsReused.row)), /birth identity/)
  assert.equal(harness.state, 'Running', 'SCM PID reuse must not stop the external restart')
  const windowsStale = await setup('win32', 'initialized', { pid: '41', created: 'old' })
  assert.equal(
    (await dm.startService(windowsStale.row, { sysdbaPassword: 'Dm_Secret123!' }))[
      'APP-Service-Start-PID'
    ],
    '42'
  )
  await dm._stopServer(windowsStale.row)
  const windowsExit = await setup('win32', 'initialized', {
    pid: '42',
    created: '2026-10-16T01:00:00Z'
  })
  harness.state = 'Running'
  harness.list = [
    { PID: '42', CREATED: '2026-10-16T01:00:00Z', COMMAND: 'dmsvc.exe database FLYENV' }
  ]
  harness.failExitWait = true
  await assert.rejects(Promise.resolve(dm._stopServer(windowsExit.row)), /DAMENG_OUTCOME_UNKNOWN/)
  assert.equal(harness.state, 'Stopped')
  await assert.rejects(Promise.resolve(dm._stopServer(windowsExit.row)), /outcome is unknown/)
  await rm(join(directory, 'server/dameng/locks', windowsExit.item.id + '.lock'), {
    recursive: true
  })
  const windowsStopped = await setup('win32', 'initialized', {
    pid: '42',
    created: '2026-10-16T01:00:00Z'
  })
  harness.state = 'Stopped'
  harness.list = [{ PID: '42', CREATED: '2026-10-16T01:00:00Z', COMMAND: 'dmsvc.exe' }]
  harness.failExitWait = true
  await assert.rejects(
    Promise.resolve(dm._stopServer(windowsStopped.row)),
    /DAMENG_OUTCOME_UNKNOWN/,
    'SCM Stopped does not prove that a recorded live service process exited'
  )
  assert.equal(JSON.parse(await readFile(windowsStopped.paths.manifest, 'utf8')).active.pid, '42')

  const linux = await setup('linux', 'initialized', { pid: '41', created: 'old' })
  assert.equal(
    (await dm.startService(linux.row, { sysdbaPassword: 'Dm_Secret123!' }))[
      'APP-Service-Start-PID'
    ],
    '42',
    'stale exited PID record must permit a new start'
  )
  await dm._stopServer(linux.row)
  const stale = await setup('linux', 'initialized', { pid: '42', created: 'old' })
  harness.list = [{ PID: '42', CREATED: 'new', COMMAND: stale.paths.bin + ' ' + stale.paths.ini }]
  await assert.rejects(Promise.resolve(dm._stopServer(stale.row)), /outside|identity/)
  assert.equal(harness.stopped.length, 0, 'PID reuse must not stop the replacement')
  for (const evidence of [
    { COMMAND: '', CREATED: '2026-10-16T01:00:00Z' },
    { COMMAND: 'owned', CREATED: undefined }
  ]) {
    const unreadable = await setup('linux', 'initialized', {
      pid: '42',
      created: '2026-10-16T01:00:00Z'
    })
    harness.list = [
      {
        PID: '42',
        ...evidence,
        COMMAND:
          evidence.COMMAND === 'owned'
            ? unreadable.paths.bin + ' ' + unreadable.paths.ini
            : evidence.COMMAND
      }
    ]
    await assert.rejects(Promise.resolve(dm._stopServer(unreadable.row)), /identity.*unavailable/i)
    assert.equal(harness.stopped.length, 0)
    assert.equal(JSON.parse(await readFile(unreadable.paths.manifest, 'utf8')).active.pid, '42')
    await assert.rejects(
      Promise.resolve(dm.startService(unreadable.row, { sysdbaPassword: 'Dm_Secret123!' })),
      /identity.*unavailable/i,
      'unverifiable live PID must not be cleared before a new start'
    )
  }
  const suffix = await setup('linux', 'initialized')
  harness.list = [
    {
      PID: '99',
      CREATED: 'external',
      COMMAND: suffix.paths.bin + ' ' + suffix.paths.ini + '.backup'
    }
  ]
  await dm._stopServer(suffix.row)
  assert.equal(
    harness.stopped.length,
    0,
    'suffix-matching external config must not dispatch Base stop'
  )
  assert.equal(
    dm._stopSearchName(),
    undefined,
    'Base name search must never widen the approved DM PID set'
  )
  const linuxExit = await setup('linux', 'initialized', {
    pid: '42',
    created: '2026-10-16T01:00:00Z'
  })
  harness.list = [
    {
      PID: '42',
      CREATED: '2026-10-16T01:00:00Z',
      COMMAND: linuxExit.paths.bin + ' ' + linuxExit.paths.ini
    }
  ]
  harness.failUnixStop = true
  await assert.rejects(Promise.resolve(dm._stopServer(linuxExit.row)), /DAMENG_OUTCOME_UNKNOWN/)
  await assert.rejects(
    Promise.resolve(dm._stopServer(linuxExit.row)),
    /outcome is unknown/,
    'failed tree exit confirmation must not permit an empty-root retry to report stopped'
  )
  await rm(join(directory, 'server/dameng/locks', linuxExit.item.id + '.lock'), { recursive: true })

  const missingBirth = await setup('linux', 'initialized')
  harness.missingBirth = true
  await assert.rejects(
    Promise.resolve(dm.startService(missingBirth.row, { sysdbaPassword: 'Dm_Secret123!' })),
    /DAMENG_OUTCOME_UNKNOWN/,
    'startup cannot report success without the birth identity needed for normal shutdown'
  )
  assert.equal(JSON.parse(await readFile(missingBirth.paths.manifest, 'utf8')).active.pid, '42')
  assert.equal(harness.stopped.length, 0, 'missing identity must not authorize blind cleanup')
  await rm(join(directory, 'server/dameng/locks', missingBirth.item.id + '.lock'), {
    recursive: true
  })

  const save = await setup('linux', 'initialized')
  harness.failSavePid = true
  assert.equal(
    (await dm.startService(save.row, { sysdbaPassword: 'Dm_Secret123!' }))['APP-Service-Start-PID'],
    '42',
    'supplementary app PID save failure must preserve started fact'
  )
  harness.failSavePid = false
  await dm._stopServer(save.row)
  harness.uninstallPreflight = true
  await assert.rejects(
    Promise.resolve(dm.uninstallSoft({ id: save.item.id })),
    /missing uninstaller/
  )
  assert.equal(
    JSON.parse(await readFile(save.paths.manifest, 'utf8')).phase,
    'initialized',
    'known unattempted uninstall must preserve retryable phase'
  )
  harness.uninstallPreflight = false

  const install = await setup('linux', 'installed')
  await rm(install.paths.programDir, { recursive: true })
  await rm(install.paths.manifest)
  await rm(win.paths.programDir, { recursive: true })
  harness.installFails = true
  await assert.rejects(
    Promise.resolve(dm.installSoft({ id: install.item.id }, install.paths.programDir)),
    /preflight/
  )
  assert.equal(
    await readFile(install.paths.manifest, 'utf8')
      .then(() => true)
      .catch(() => false),
    false,
    'known preflight failure must not strand an installing manifest'
  )
  harness.installFails = false
  harness.installHandoff = true
  const partial = await dm.installSoft({ id: install.item.id }, install.paths.programDir)
  assert.equal(partial.installed, true)
  assert.match(partial.installError, /handoff/)
  assert.match(
    JSON.parse(await readFile(install.paths.manifest, 'utf8')).requiresInspection,
    /handoff/
  )
  assert.equal(
    (await dm.fetchAllOnlineVersion())[0].disabled,
    true,
    'required handoff gate must survive a new catalog scan/controller session'
  )
  await assert.rejects(
    Promise.resolve(dm.initializeDatabase(install.row, params)),
    /requires inspection/
  )
  await rm(join(directory, 'server/dameng/locks', install.item.id + '.lock'), {
    recursive: true,
    force: true
  })
  await rm(install.paths.programDir, { recursive: true, force: true })
  await rm(install.paths.manifest)
  harness.installHandoff = false
  const chosen = join(directory, 'user_choice')
  await mkdir(chosen)
  await assert.rejects(
    Promise.resolve(dm.validateInstallPath({ id: install.item.id }, chosen + '/../escape')),
    /absolute|traversal|canonical/i
  )
  const validation = await dm.validateInstallPath({ id: install.item.id }, chosen)
  assert.equal(validation.programDir, chosen)
  await assert.rejects(
    Promise.resolve(
      dm.validateInstallPath({ id: install.item.id }, join(chosen, 'missing', 'child'))
    ),
    /parent|create/i,
    'an absent immediate parent must fail before downloading Windows media'
  )
  const nonempty = join(directory, 'not_empty')
  await mkdir(nonempty)
  await writeFile(join(nonempty, 'keep'), 'user file')
  await assert.rejects(
    Promise.resolve(dm.validateInstallPath({ id: install.item.id }, nonempty)),
    /empty/i
  )
  await assert.rejects(
    Promise.resolve(
      dm.validateInstallPath({ id: install.item.id }, join(directory, 'cache', 'unsafe'))
    ),
    /overlap|cache|protected/i
  )
  harness.installFails = true
  await assert.rejects(
    Promise.resolve(dm.installSoft({ id: install.item.id }, chosen)),
    /preflight/
  )
  assert.equal(
    (await actualFs.readdir(chosen)).length,
    0,
    'known refusal preserves the selected empty folder'
  )
  await assert.rejects(readFile(install.paths.manifest, 'utf8'), { code: 'ENOENT' })
  harness.installFails = false
  const selected = await dm.installSoft({ id: install.item.id }, chosen)
  assert.equal(selected.programDir, chosen)
  assert.equal(JSON.parse(await readFile(install.paths.manifest, 'utf8')).programDir, chosen)
  assert.equal(dm.paths(install.item).programDir, chosen)
  const restarted = new dm.constructor()
  restarted.platform = async () => {}
  assert.equal(
    restarted.paths(install.item).programDir,
    chosen,
    'worker restart reads the recorded selected path'
  )
  assert.equal(
    (await restarted.allInstalledVersions({ dameng: { dirs: [chosen] } }))[0].path,
    chosen
  )
  assert.equal((await restarted.allInstalledVersions({ dameng: { dirs: [] } })).length, 0)
  const missingRegistration = (await restarted.fetchAllOnlineVersion({ dameng: { dirs: [] } }))[0]
  assert.equal(missingRegistration.installed, false)
  assert.equal(
    missingRegistration.registrationPending,
    true,
    'completed installation can retry registration without installer replay'
  )
  assert.equal(
    (await restarted.fetchAllOnlineVersion({ dameng: { dirs: [chosen] } }))[0].installed,
    true
  )
  assert.equal(await readFile(join(nonempty, 'keep'), 'utf8'), 'user file')
  const savedRecord = await readFile(install.paths.manifest, 'utf8')
  await writeFile(install.paths.manifest, '{bad JSON')
  assert.equal(
    (await restarted.fetchAllOnlineVersion({ dameng: { dirs: [chosen] } }))[0].disabled,
    true,
    'invalid installation candidate must stay disabled without aborting catalog'
  )
  assert.equal((await restarted.allInstalledVersions({ dameng: { dirs: [chosen] } })).length, 0)
  await writeFile(install.paths.manifest, savedRecord)
  console.log(
    'DM core: resumable initialization, stale PID restart, birth identity, supplementary PID write and preflight retry passed'
  )
} finally {
  Object.defineProperty(process, 'platform', realPlatform)
  await rm(directory, { recursive: true, force: true })
}
