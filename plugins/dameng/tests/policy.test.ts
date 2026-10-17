import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultDamengSettings } from '../shared'
import {
  validateInit,
  installerXml,
  dminitControl,
  disqlInput,
  parseIni,
  assertPlatform,
  assertVendorPath,
  assertDataPath,
  registeredProgramPaths
} from '../fork/policy'

test('registered custom paths normalize exact Windows and Linux roots without inventing a location', () => {
  const chosen = String.raw`C:\dm8\release`
  assert.deepEqual(
    registeredProgramPaths(
      { dameng: { dirs: [chosen, chosen + '\\', chosen.toUpperCase(), null, 'relative'] } },
      true
    ),
    [chosen]
  )
  assert.deepEqual(registeredProgramPaths({ dameng: { dirs: ['/opt/dm8/', '/opt/dm8'] } }, false), [
    '/opt/dm8'
  ])
  assert.deepEqual(registeredProgramPaths(undefined), [])
  assert.doesNotThrow(() => assertVendorPath(chosen, true))
  assert.throws(() => assertVendorPath(String.raw`C:\FlyEnv-Data\app`, true), /unsupported/)
  assert.doesNotThrow(() => assertDataPath(String.raw`C:\FlyEnv-Data\server`, true))
  for (const path of [String.raw`C:\data\..\outside`, 'relative', 'C:\\bad"path', 'C:\\bad\npath'])
    assert.throws(() => assertDataPath(path, true))
})

test('initialization rejects overwrites, invalid resources and control-file injection', () => {
  const p = {
    ...defaultDamengSettings(),
    sysdbaPassword: 'Dm_Test123!',
    auditorPassword: 'Dm_Audit123!'
  }
  assert.equal(validateInit(p).charset, 1)
  assert.equal(
    validateInit({ ...p, sysdbaPassword: '123456_Xpf', auditorPassword: '123456_Xpf' })
      .sysdbaPassword,
    '123456_Xpf'
  )
  for (const changes of [
    { port: 65535 },
    { pageSize: 3 },
    { bufferMB: 0 },
    { sysdbaPassword: 'Dm_Test123!\nAUTO_OVERWRITE=2' }
  ]) {
    assert.throws(() => validateInit({ ...p, ...changes }))
  }
  const control = dminitControl('/tmp/data with space', 'FLYENV123', p)
  assert.match(control, /AUTO_OVERWRITE = 0/)
  assert.match(control, /LOG_SIZE = 256/)
  assert.match(control, /SYSDBA_PWD = 'Dm_Test123!'/)
  for (const file of [
    'MAIN.DBF',
    'SYSTEM.DBF',
    'ROLL.DBF',
    'dm.ctl',
    'DAMENG01.log',
    'DAMENG02.log'
  ])
    assert.ok(
      control.includes(`/tmp/data with space/DAMENG/${file}`),
      `${file} must be outside program/bin`
    )
  const windowsRoot = String.raw`C:\Users\x\AppData\Local\Programs\FlyEnv-Data\server\dameng\instances\win20260709`
  const windowsControl = dminitControl(windowsRoot, 'FLYENV123', p)
  assert.equal(windowsControl.split('\n')[1], `SYSTEM_PATH = '${windowsRoot}'`)
  for (const line of windowsControl.split('\n')) {
    if (/^(SYSTEM_PATH|MAIN|SYSTEM|ROLL|CTL_PATH|LOG_PATH) = /.test(line))
      assert.equal(
        line.includes('"'),
        false,
        'CONTROL paths use native single-quote INI escaping rather than double quotes'
      )
  }
  assert.equal(control.split('\n')[1], "SYSTEM_PATH = '/tmp/data with space'")
  const special = dminitControl("/tmp/O'Brien#one;two", 'FLYENV123', {
    ...p,
    sysdbaPassword: "Strong'Pwd9#;!",
    auditorPassword: 'Audit#Pwd9;!'
  })
  assert.equal(special.split('\n')[1], "SYSTEM_PATH = '/tmp/O''Brien#one;two'")
  assert.ok(special.includes("SYSDBA_PWD = 'Strong''Pwd9#;!'\n"))
  assert.ok(special.includes("SYSAUDITOR_PWD = 'Audit#Pwd9;!'\n"))
  const quotedEdges = dminitControl('/tmp/data', 'FLYENV123', {
    ...p,
    sysdbaPassword: "'Strong_Pwd9#;='",
    auditorPassword: "Audit'Pwd9=!"
  })
  assert.ok(quotedEdges.includes("SYSDBA_PWD = '''Strong_Pwd9#;='''\n"))
  assert.ok(quotedEdges.includes("SYSAUDITOR_PWD = 'Audit''Pwd9=!'\n"))
  assert.throws(() => dminitControl('/tmp/a\nPATH=/etc', 'FLYENV123', p))
})

test('silent XML disables initialization and service startup without passwords', () => {
  const xml = installerXml('/tmp/数据库 & folder')
  assert.match(xml, /&amp;/)
  assert.match(xml, /<INIT_DB>N<\/INIT_DB>/)
  assert.doesNotMatch(xml, /PWD|DB_PARAMS|<INIT_DB>Y/)
})

test('disql receives credentials over stdin with deterministic failure and readiness marker', () => {
  const input = disqlInput('Dm_Secret123!', 5236, false)
  assert.match(input, /CONNECT SYSDBA\/"Dm_Secret123!"@127\.0\.0\.1:5236/)
  assert.match(input, /WHENEVER SQLERROR EXIT 1/)
  assert.ok(input.indexOf('SET DEFINE OFF\n') >= 0)
  assert.ok(input.indexOf('SET DEFINE OFF\n') < input.indexOf('CONNECT SYSDBA/'))
  for (const password of ['Strong&Name9!', 'Strong&&Name9!', 'Strong#Name9!;', "Strong'Name9@!$"]) {
    const script = disqlInput(password, 5236, false)
    assert.ok(script.includes(`CONNECT SYSDBA/"${password}"@127.0.0.1:5236\n`))
    assert.ok(script.indexOf('SET DEFINE OFF\n') < script.indexOf('CONNECT SYSDBA/'))
  }
  assert.match(input, /FLYENV_DM_READY/)
  assert.match(input, /SET LINESHOW OFF/)
  assert.throws(() => disqlInput('bad"\nSTOP INSTANCE;', 5236, false))
})

test('platform gate accepts only exact native x64 targets', () => {
  assert.doesNotThrow(() => assertPlatform('linux', 'x64', 'ID=ubuntu\nVERSION_ID="22.04"', 'x64'))
  for (const [platform, arch, os, native] of [
    ['darwin', 'x64', '', 'x64'],
    ['linux', 'arm64', 'ID=ubuntu\nVERSION_ID=22.04', 'arm64'],
    ['linux', 'x64', 'ID=ubuntu\nVERSION_ID=24.04', 'x64'],
    ['win32', 'x64', '', 'arm64']
  ])
    assert.throws(() => assertPlatform(platform, arch, os, native))
  assert.equal(parseIni('PORT_NUM = 5237 # port\nINSTANCE_NAME = FLYENV123').PORT_NUM, '5237')
})
