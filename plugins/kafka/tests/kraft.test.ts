import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection, createServer } from 'node:net'
import { patchKafkaWindowsRunClass } from '../fork/Kafka/WindowsRunClass'
import { kafkaClusterUuidFromOutput, kafkaPropertiesValue } from '../fork/Kafka/kraft'

const uuid = 'abcdefghijklmnopqrstuw'
const source = [
  '@echo off',
  'for %%i in ("%BASE_DIR%\\libs\\*") do (',
  '  call :concat "%%i"',
  ')',
  'set COMMAND=%JAVA% -cp "%CLASSPATH%" %*',
  '%COMMAND%',
  '',
  'goto :eof',
  ':concat',
  'IF not defined CLASSPATH (',
  '  set CLASSPATH="%~1"',
  ') ELSE (',
  '  set CLASSPATH=%CLASSPATH%;"%~1"',
  ')',
  ''
].join('\r\n')

test('quotes the complete classpath once and propagates the Java exit code', () => {
  const patched = patchKafkaWindowsRunClass(source)
  assert.ok(patched.includes('call :concat "%BASE_DIR%\\libs\\*"'))
  assert.ok(patched.includes('set "CLASSPATH=%~1"\r\n'))
  assert.ok(patched.includes('set "CLASSPATH=%CLASSPATH%;%~1"\r\n'))
  assert.ok(patched.includes('%COMMAND%\r\nexit /b %ERRORLEVEL%\r\n'))
  assert.ok(patched.includes('-cp "%CLASSPATH%"'))
  assert.equal(patchKafkaWindowsRunClass(patched), patched, 'patching is idempotent')
})

test('upgrades the previously patched wildcard script instead of returning early', () => {
  const oldFix = source.replace(
    /for %%i[^\r]+\r\n[^\r]+\r\n\)/,
    'call :concat "%BASE_DIR%\\libs\\*"'
  )
  const patched = patchKafkaWindowsRunClass(oldFix)
  assert.ok(patched.includes('set "CLASSPATH=%~1"'))
  assert.ok(patched.includes('exit /b %ERRORLEVEL%'))
})

test('handles LF batch files and preserves unrelated custom options', () => {
  const custom = 'set KAFKA_OPTS=-Dcustom=true\n' + source.replaceAll('\r\n', '\n')
  const patched = patchKafkaWindowsRunClass(custom)
  assert.ok(patched.startsWith('set KAFKA_OPTS=-Dcustom=true\n'))
  assert.ok(patched.includes('%COMMAND%\nexit /b %ERRORLEVEL%\n'))
  assert.equal(patchKafkaWindowsRunClass(patched), patched)
})

test('extracts only Kafka UUID lines even when JVM/log messages follow them', () => {
  assert.equal(kafkaClusterUuidFromOutput(`WARN before\r\n${uuid}\r\nINFO after\r\n`), uuid)
  for (const output of ['', 'Could not find or load main class Files', 'garbage', 'a'.repeat(23)]) {
    assert.equal(kafkaClusterUuidFromOutput(output), '')
  }
})

test('escapes non-ASCII data directories for Java properties without changing ASCII paths', () => {
  assert.equal(kafkaPropertiesValue('D:/Program Files/Kafka/data'), 'D:/Program Files/Kafka/data')
  assert.equal(kafkaPropertiesValue('D:/测试/🚀'), 'D:/\\u6d4b\\u8bd5/\\ud83d\\ude80')
})

test(
  'reports a masked JVM error and does not format storage',
  { skip: process.platform !== 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'FlyEnv Kafka failure '))
    const previousServer = global.Server
    const { default: kafka } = await import('../fork/Kafka')
    const { default: EnvSync } = await import('../../../src/shared/EnvSync')
    const previousEnv = EnvSync.AppEnv
    const previousBaseDir = kafka.baseDir
    const previousPidPath = kafka.pidPath
    const runtime = kafka as unknown as {
      _initKRaft: (version: any, javaHome: string) => Promise<void>
      _fixRunClassBat: (bin: string) => Promise<void>
    }
    try {
      global.Server = { BaseDir: root } as typeof global.Server
      EnvSync.AppEnv = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
      kafka.init()
      const install = join(root, 'install')
      const binDir = join(install, 'bin/windows')
      await mkdir(binDir, { recursive: true })
      const storage = join(binDir, 'kafka-storage.bat')
      await writeFile(
        storage,
        '@echo off\r\necho Could not find or load main class Files >&2\r\nexit /b 0\r\n'
      )
      await assert.rejects(
        runtime._initKRaft({ path: install, version: 'fixture' }, root),
        /KRaft random-uuid failed: Could not find or load main class Files/
      )
      // A required script read failure must not be swallowed before UUID generation.
      await mkdir(join(binDir, 'kafka-run-class.bat'))
      await assert.rejects(runtime._fixRunClassBat(join(binDir, 'kafka-server-start.bat')))
    } finally {
      kafka.baseDir = previousBaseDir
      kafka.pidPath = previousPidPath
      EnvSync.AppEnv = previousEnv
      global.Server = previousServer
      assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv Kafka failure ')))
      await rm(root, { recursive: true, force: true })
    }
  }
)

test(
  'real Kafka initializes, starts, lists topics and stops with space-containing paths',
  { skip: process.platform !== 'win32' || !process.env.FLYENV_KAFKA_TEST_ROOT },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'FlyEnv Kafka 测试 '))
    const previousServer = global.Server
    const previousCwd = process.cwd()
    const { default: kafka } = await import('../fork/Kafka')
    const { default: EnvSync } = await import('../../../src/shared/EnvSync')
    const { execPromiseWithEnv } = await import('../../../src/shared/child-process')
    const previousEnv = EnvSync.AppEnv
    const previousBaseDir = kafka.baseDir
    const previousPidPath = kafka.pidPath
    const runtime = kafka as unknown as {
      _initKRaft: (version: any, javaHome: string) => Promise<void>
      _fixRunClassBat: (bin: string) => Promise<void>
    }
    try {
      const installedRoot = process.env.FLYENV_KAFKA_TEST_ROOT!
      const javaHome = process.env.FLYENV_KAFKA_TEST_JAVA_HOME!
      assert.ok(javaHome, 'FLYENV_KAFKA_TEST_JAVA_HOME is required for live validation')
      const install = join(root, 'distribution')
      const binDir = join(install, 'bin/windows')
      await mkdir(binDir, { recursive: true })
      await symlink(join(installedRoot, 'libs'), join(install, 'libs'), 'junction')
      for (const name of [
        'kafka-storage.bat',
        'kafka-run-class.bat',
        'kafka-server-start.bat',
        'kafka-topics.bat'
      ]) {
        await copyFile(join(installedRoot, 'bin/windows', name), join(binDir, name))
      }
      await mkdir(join(install, 'config'))
      const logging = join(installedRoot, 'config/tools-log4j2.yaml')
      await copyFile(logging, join(install, 'config/tools-log4j2.yaml'))
      await copyFile(join(installedRoot, 'config/log4j2.yaml'), join(install, 'config/log4j2.yaml'))
      global.Server = { BaseDir: root } as typeof global.Server
      EnvSync.AppEnv = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
      kafka.init()
      const version = {
        version: '4.4.0',
        path: install,
        bin: join(binDir, 'kafka-server-start.bat'),
        typeFlag: 'kafka'
      }
      await runtime._fixRunClassBat(version.bin)
      await kafka.initConfig(version as any)
      const listeners = [createServer(), createServer()]
      const ports: number[] = []
      for (const listener of listeners) {
        await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
        ports.push((listener.address() as { port: number }).port)
      }
      await Promise.all(
        listeners.map((listener) => new Promise<void>((done) => listener.close(() => done())))
      )
      const configFile = join(kafka.baseDir, 'kafka-4.4.0/config/server.properties')
      await writeFile(
        configFile,
        (await readFile(configFile, 'utf8'))
          .replaceAll(':9092', `:${ports[0]}`)
          .replaceAll(':9093', `:${ports[1]}`)
      )
      await runtime._initKRaft(version, javaHome)
      const metaFile = join(kafka.baseDir, 'kafka-4.4.0/data/meta.properties')
      const meta = await readFile(metaFile, 'utf8')
      assert.match(meta, /^cluster\.id=[A-Za-z0-9_-]{22}\s*$/m)
      assert.match(meta, /^node\.id=1\s*$/m)
      await writeFile(join(binDir, 'kafka-storage.bat'), '@echo off\r\nexit /b 9\r\n')
      await runtime._initKRaft(version, javaHome)
      assert.equal(await readFile(metaFile, 'utf8'), meta, 'existing data is not reformatted')
      await assert.rejects(
        execPromiseWithEnv(`"${join(binDir, 'kafka-run-class.bat')}" flyenv.fixture.NoSuchClass`, {
          cwd: install,
          env: { JAVA_HOME: javaHome },
          timeout: 60_000
        }),
        (error: any) => error.code !== 0 && /ClassNotFoundException/.test(error.stderr)
      )
      const started: any = await kafka._startServer(version as any, { javaHome })
      const pid = `${started['APP-Service-Start-PID']}`
      const { fetchStopProcessListLocal } = await import('../../../src/shared/StopProcessList')
      try {
        assert.match(pid, /^[1-9]\d*$/)
        const deadline = Date.now() + 30_000
        while (true) {
          const reachable = await new Promise<boolean>((done) => {
            const socket = createConnection({ host: '127.0.0.1', port: ports[0] })
            const finish = (ready: boolean) => {
              socket.destroy()
              done(ready)
            }
            socket.setTimeout(500)
            socket.once('connect', () => finish(true))
            socket.once('error', () => finish(false))
            socket.once('timeout', () => finish(false))
          })
          if (reachable) break
          assert.ok(Date.now() < deadline, 'isolated Kafka broker must listen')
          await new Promise((done) => setTimeout(done, 250))
        }
        const topics = await kafka.fetchTopics(version as any, javaHome)
        assert.deepEqual(topics, [])
      } finally {
        const processList = await fetchStopProcessListLocal()
        const stopped: any = await kafka.stopService({ ...version, pid } as any, {
          processList,
          reason: 'stop'
        })
        assert.ok(stopped['APP-Service-Stop-PID'].map(String).includes(pid))
      }
    } finally {
      process.chdir(previousCwd)
      kafka.baseDir = previousBaseDir
      kafka.pidPath = previousPidPath
      EnvSync.AppEnv = previousEnv
      global.Server = previousServer
      assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv Kafka 测试 ')))
      await rm(root, { recursive: true, force: true })
    }
  }
)
