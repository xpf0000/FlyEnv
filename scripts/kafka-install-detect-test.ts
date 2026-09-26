import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Sandboxed layout: <sandbox>/app is the fake AppDir with one legacy install
// (static-kafka-X) and one new-layout install (kafka/Y).
const sandbox = join(process.cwd(), 'tmp', 'kafka-install-detect-test')
const appDir = join(sandbox, 'app')
rmSync(sandbox, { recursive: true, force: true })

const isWin = process.platform === 'win32'
const binRel = isWin ? 'bin/windows/kafka-server-start.bat' : 'bin/kafka-server-start.sh'
const runClassRel = isWin ? 'bin/windows/kafka-run-class.bat' : 'bin/kafka-run-class.sh'

const makeInstall = (dir: string, version: string, withRunClass = false) => {
  mkdirSync(join(dir, 'libs'), { recursive: true })
  mkdirSync(join(dir, isWin ? 'bin/windows' : 'bin'), { recursive: true })
  writeFileSync(join(dir, 'libs', `kafka_2.13-${version}.jar`), '')
  writeFileSync(join(dir, 'libs', `kafka-clients-${version}.jar`), '')
  writeFileSync(join(dir, binRel), '')
  if (withRunClass && isWin) {
    writeFileSync(
      join(dir, runClassRel),
      [
        '@echo off',
        'rem Classpath addition for release',
        'for %%i in ("%BASE_DIR%\\libs\\*") do (',
        '\tcall :concat "%%i"',
        ')',
        ''
      ].join('\r\n')
    )
  }
}

const legacyDir = join(appDir, 'static-kafka-4.3.1')
const newDir = join(appDir, 'kafka', '4.2.1')
makeInstall(legacyDir, '4.3.1', true)
makeInstall(newDir, '4.2.1')

;(globalThis as any).Server = {
  AppDir: appDir,
  BaseDir: join(sandbox, 'server'),
  Cache: join(sandbox, 'cache'),
  Arch: 'x86_64'
}

const run = async () => {
  const mod = await import('../plugins/kafka/fork/Kafka/index')
  const kafka: any = mod.default
  kafka.init()

  // 1. Installed detection: both layouts found, version parsed from libs jars.
  const installed: any[] = await kafka.allInstalledVersions({ kafka: { dirs: [] } })
  const byVersion = new Map(installed.map((item) => [item.version, item]))
  assert.ok(byVersion.has('4.3.1'), 'legacy static-kafka-4.3.1 install should be detected')
  assert.ok(byVersion.has('4.2.1'), 'new kafka/4.2.1 install should be detected')
  for (const item of installed) {
    assert.equal(item.enable, true, `${item.version} should be enabled`)
    assert.ok(item.num, `${item.version} should have num`)
  }

  // 2. Version command fallback never needed when libs jars exist: no error field.
  for (const item of installed) {
    assert.equal(item.error, undefined, `${item.version} should not carry a command error`)
  }

  // 3. _fixRunClassBat: patches the per-jar loop into a wildcard classpath, idempotent.
  if (isWin) {
    const target = join(legacyDir, runClassRel)
    await kafka._fixRunClassBat(join(legacyDir, binRel))
    const patched = readFileSync(target, 'utf-8')
    assert.ok(
      patched.includes('call :concat "%BASE_DIR%\\libs\\*"'),
      'patched bat should use wildcard classpath'
    )
    assert.ok(
      !patched.includes('for %%i in ("%BASE_DIR%\\libs\\*") do ('),
      'per-jar concat loop should be gone'
    )
    await kafka._fixRunClassBat(join(legacyDir, binRel))
    assert.equal(readFileSync(target, 'utf-8'), patched, 'second run must not change the file')
  }

  // 4. fetchAllOnlineVersion mapping is network-bound; only check the pure
  // path helpers here.
  assert.equal(kafka._appDirOf('9.9.9'), join(appDir, 'kafka', '9.9.9'))
  assert.equal(kafka._legacyAppDirOf('9.9.9'), join(appDir, 'static-kafka-9.9.9'))

  rmSync(sandbox, { recursive: true, force: true })
  console.log('kafka-install-detect-test: all assertions passed')
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
  })
