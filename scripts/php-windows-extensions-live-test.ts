import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { WindowsExtensionInstaller } from '../src/fork/module/Php.win/WindowsExtensions'
import { configuredExtensions } from '../src/fork/module/Php.win/ExtensionConfig'
import type { SoftInstalled } from '../src/shared/app'

// Explicit integration test: downloads official Redis/Xdebug archives into an isolated PHP copy.
const source = process.argv[2] || process.env.FLYENV_PHP_TEST_BIN
assert.ok(source, 'Pass the path to a real Windows PHP executable')
assert.equal(process.platform, 'win32')
const root = await mkdtemp(join(tmpdir(), 'FlyEnv PHP live [路径] & $ '))
const previousServer = global.Server
try {
  const path = join(root, 'PHP with spaces')
  const extensions = join(path, 'extensions with spaces')
  await mkdir(extensions, { recursive: true })
  const runtimeFiles = (await readdir(dirname(source))).filter(
    (name) => name.toLowerCase().endsWith('.dll') || name.toLowerCase() === 'php.exe'
  )
  for (const file of runtimeFiles) await copyFile(join(dirname(source), file), join(path, file))
  const ini = join(path, 'php.ini')
  await writeFile(
    ini,
    '[PHP]\nextension_dir="extensions with spaces"\nxdebug.start_with_request=no\n'
  )
  global.Server = { ...previousServer, Cache: join(root, 'cache'), PhpDir: root, Proxy: {} }
  const installer = new WindowsExtensionInstaller()
  const version = {
    path,
    bin: join(path, 'php-cgi.exe'),
    phpBin: join(path, 'php.exe')
  } as SoftInstalled
  const before = await installer.profile(version)
  assert.ok(!before.loaded.includes('redis'))
  const install = async (name: string) => {
    const result = await installer.install(version, name)
    assert.equal(result.verified, true, result.warning)
    return result
  }
  await install('phpredis/phpredis')
  const oldDirectory = join(root, 'old PHP with spaces')
  await mkdir(oldDirectory)
  const oldDll = join(oldDirectory, 'php_redis.dll')
  await copyFile(join(extensions, 'php_redis.dll'), oldDll)
  const content = await readFile(ini, 'utf8')
  await writeFile(ini, `extension="${oldDll.replaceAll('\\', '/')}"\n${content}`)
  await install('phpredis/phpredis')
  const refreshedIni = await readFile(ini, 'utf8')
  assert.ok(!refreshedIni.includes('old PHP with spaces'))
  assert.equal(
    configuredExtensions(refreshedIni, ['redis']).filter((item) => item.name === 'redis').length,
    1
  )
  const verification = spawnSync(version.phpBin!, ['-c', ini, '-r', 'echo "loaded";'], {
    cwd: path,
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  assert.equal(verification.status, 0)
  assert.equal(verification.stdout.trim(), 'loaded')
  assert.doesNotMatch(
    verification.stderr,
    /already loaded/i,
    'no duplicate-module warning may remain'
  )
  const xdebug = await install('xdebug/xdebug')
  assert.ok(xdebug.profile.loaded.some((name) => name.toLowerCase() === 'xdebug'))
  const debugIni = await readFile(ini, 'utf8')
  assert.match(debugIni, /xdebug.mode = debug/)
  assert.match(debugIni, /xdebug.client_port = 9003/)
  assert.match(debugIni, /xdebug.start_with_request=no/)
  const phpModule = (await import('../src/fork/module/Php.win/index')).default
  const local = (await phpModule.fetchLocalExtend(version)) as {
    local: { name: string; iniStr: string }[]
    used: { name: string }[]
  }
  const redisRow = local.local.find((item) => item.name === 'php_redis')!
  assert.ok(local.used.some((item) => item.name === redisRow.name))
  await phpModule.localExec({ ...redisRow, installed: true }, version)
  assert.ok(!(await installer.profile(version)).loaded.includes('redis'))
  await phpModule.localExec({ ...redisRow, installed: false }, version)
  assert.ok((await installer.profile(version)).loaded.includes('redis'))
  const versionedName = 'php_xdebug-3.5.3-8.3-ts-vs16-x64'
  await copyFile(join(extensions, 'php_xdebug.dll'), join(extensions, `${versionedName}.dll`))
  await phpModule.localExec(
    { name: versionedName, iniStr: `zend_extension=${versionedName}`, installed: true },
    version
  )
  await phpModule.localExec(
    { name: versionedName, iniStr: `zend_extension=${versionedName}`, installed: false },
    version
  )
  assert.ok(
    (await installer.profile(version)).loaded.some((name) => name.toLowerCase() === 'xdebug')
  )
  const disabledRedis = await installer.disable(version, 'redis')
  assert.ok(!disabledRedis.loaded.some((name) => name.toLowerCase() === 'redis'))
  const disabledXdebug = await installer.disable(version, 'xdebug')
  assert.ok(!disabledXdebug.loaded.some((name) => name.toLowerCase() === 'xdebug'))
  assert.doesNotMatch(await readFile(ini, 'utf8'), /FlyEnv-xdebug-ini-begin/)
  console.log(
    `Real PHP ${before.version}: Redis install/reinstall with old full path, Xdebug defaults and disable passed`
  )
} finally {
  global.Server = previousServer
  assert.ok(
    resolve(root).startsWith(resolve(tmpdir()) + sep) &&
      root.includes('FlyEnv PHP live [路径] & $ ')
  )
  await rm(root, { recursive: true, force: true })
}
