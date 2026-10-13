import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-apache-start-')))
const starts: any[] = []
const fixture = {
  linux: true,
  env: { ...process.env },
  start: async (params: any) => {
    starts.push(params)
    if (fixture.linux && !['httpd', 'apache2'].includes(basename(params.bin))) {
      throw new Error('unapproved service executable name')
    }
    return JSON.parse(
      execFileSync(params.bin, params.execArgs, {
        env: { ...fixture.env, ...params.execEnv },
        encoding: 'utf8'
      })
    )
  }
}
;(globalThis as any).__apacheStartTest = fixture
;(globalThis as any).Server = {
  ApacheDir: join(directory, 'data/server/apache'),
  BaseDir: join(directory, 'data')
}
const mocks: Record<string, string> = {
  fn: `import * as fs from 'node:fs/promises';import {createHash} from 'node:crypto';
    import {exec} from 'node:child_process';import {promisify} from 'node:util';
    export const readFile=fs.readFile,writeFile=fs.writeFile,mkdirp=(p)=>fs.mkdir(p,{recursive:true});
    export const md5=(p)=>createHash('md5').update(p).digest('hex'),AppLog=(...args)=>args;
    export const execPromise=promisify(exec);
    export const brewInfoJson=()=>{},getAllFileAsync=()=>{},portSearch=()=>{},versionBinVersion=()=>{},versionFilterSame=()=>{},versionFixed=()=>{},versionLocalFetch=()=>{},versionSort=()=>{};`,
  base: 'export class Base {}',
  task: 'export default {}',
  host: 'export const fetchHostList=async()=>[]',
  start: `export const serviceStartSpawn=(p)=>globalThis.__apacheStartTest.start(p);
    export const prepareUnixLogDirectory=async()=>{}`,
  utils: `export const isLinux=()=>globalThis.__apacheStartTest.linux,isWindows=()=>false,pathFixedToUnix=(p)=>p`,
  lang: 'export const I18nT=(key)=>key',
  env: 'export default {sync:async()=>globalThis.__apacheStartTest.env}'
}

async function executable(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  await chmod(path, 0o755)
}

async function version(bin: string) {
  const conf = join(
    directory,
    'data/server/apache/common/conf',
    `${createHash('md5').update(bin).digest('hex')}.conf`
  )
  await mkdir(dirname(conf), { recursive: true })
  await writeFile(conf, 'Listen 80\n')
  return { bin, path: dirname(dirname(bin)), typeFlag: 'apache', version: '2.4.65', conf }
}

const server = `#!${process.execPath}
process.stdout.write(JSON.stringify({args:process.argv.slice(2),library:process.env.APACHE_TEST_LIBRARY,run:process.env.APACHE_RUN_DIR}));`
try {
  const result = await build({
    entryPoints: ['src/fork/module/Apache/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'apache-start-fixtures',
        setup(builder) {
          const paths: Record<string, string> = {
            '../../Fn': 'fn',
            '../Base': 'base',
            '../../TaskQueue': 'task',
            '../Host/HostFile': 'host',
            '../../util/ServiceStart': 'start',
            '@shared/utils': 'utils',
            '@lang/runtime': 'lang',
            '@shared/EnvSync': 'env'
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
  const bundle = join(directory, 'apache.mjs')
  await writeFile(bundle, result.outputFiles[0].text)
  const { default: apache } = await import(pathToFileURL(bundle).href)
  apache.init()

  // The existing-install failure happens before a wrapper that rejects startup arguments runs.
  const wrapper = join(directory, 'fedora/usr/sbin/apachectl')
  await executable(
    wrapper,
    '#!/bin/sh\necho "apachectl cannot pass startup arguments" >&2\nexit 1\n'
  )
  const httpd = join(dirname(wrapper), 'httpd')
  await executable(httpd, server)
  const installed = await version(wrapper)
  const launched = await apache._startServer(installed)
  assert.equal(starts.at(-1).bin, httpd)
  assert.equal(starts.at(-1).lowPortService, true)
  assert.deepEqual(starts.at(-1).listenPorts, [80])
  assert.deepEqual(launched.args, [
    '-f',
    installed.conf,
    '-c',
    `PidFile "${directory}/data/server/apache/httpd.pid"`,
    '-c',
    `CustomLog "${directory}/data/server/apache/common/logs/access_log" common`,
    '-D',
    'FOREGROUND'
  ])
  assert.equal(
    installed.bin,
    wrapper,
    'existing version identity and config hash must remain stable'
  )
  assert.equal(await readFile(installed.conf, 'utf8'), 'Listen 80\n')

  // Upstream installs can put apachectl in bin and httpd in sbin; source their envvars.
  const custom = join(directory, 'custom install/bin/apachectl')
  const customHttpd = join(directory, 'custom install/sbin/httpd')
  await executable(custom, '#!/bin/sh\nexit 1\n')
  await executable(customHttpd, server)
  await writeFile(
    join(dirname(custom), 'envvars'),
    'export APACHE_TEST_LIBRARY="custom library path"\n'
  )
  assert.equal((await apache._startServer(await version(custom))).library, 'custom library path')
  assert.equal(starts.at(-1).bin, customHttpd)

  // Debian's apachectl is a symlink to apache2ctl; its binary needs envvars.
  const debian = join(directory, 'debian/sbin/apache2ctl')
  await executable(debian, '#!/bin/sh\nexit 1\n')
  const alias = join(dirname(debian), 'apachectl')
  await symlink(debian, alias)
  await executable(join(dirname(debian), 'apache2'), server)
  await executable(join(dirname(debian), 'httpd'), server)
  fixture.env.APACHE_CONFDIR = join(directory, 'debian/etc/apache2')
  await mkdir(fixture.env.APACHE_CONFDIR, { recursive: true })
  await writeFile(
    join(fixture.env.APACHE_CONFDIR, 'envvars'),
    'export APACHE_RUN_DIR="/tmp/apache run"\n'
  )
  assert.equal((await apache._startServer(await version(alias))).run, '/tmp/apache run')
  assert.equal(starts.at(-1).bin, join(dirname(debian), 'apache2'))

  const alternate = join(directory, 'alternate install/sbin/apache2')
  await executable(alternate, server)
  fixture.env.APACHE_ENVVARS = join(directory, 'alternate envvars')
  await writeFile(
    fixture.env.APACHE_ENVVARS,
    `export APACHE_HTTPD='${alternate}'\nexport APACHE_RUN_DIR='custom run dir'\n`
  )
  assert.equal((await apache._startServer(await version(alias))).run, 'custom run dir')
  assert.equal(starts.at(-1).bin, alternate, 'envvars can select a different daemon')
  await writeFile(fixture.env.APACHE_ENVVARS, 'export APACHE_RUN_DIR="custom run dir"\n')
  fixture.env.APACHE_HTTPD = alternate
  await apache._startServer(await version(alias))
  assert.equal(starts.at(-1).bin, alternate, 'explicit daemon selection must be preserved')
  fixture.env.APACHE_HTTPD = join(directory, 'missing daemon/apache2')
  const beforeInvalidOverride = starts.length
  await assert.rejects(apache._startServer(await version(alias)), /Apache.*executable/i)
  assert.equal(starts.length, beforeInvalidOverride, 'invalid explicit targets must not use a peer')
  delete fixture.env.APACHE_ENVVARS
  delete fixture.env.APACHE_HTTPD
  delete fixture.env.APACHE_CONFDIR

  const alternateHttpd = join(directory, 'alternate install/sbin/httpd')
  await executable(alternateHttpd, server)
  await executable(custom, `#!/bin/sh\nHTTPD='${alternateHttpd}'\nexit 1\n`)
  await apache._startServer(await version(custom))
  assert.equal(starts.at(-1).bin, alternateHttpd, 'literal HTTPD targets beat sibling guesses')

  const loopWrapper = join(directory, 'loop/sbin/apachectl')
  await executable(loopWrapper, '#!/bin/sh\nexit 1\n')
  await symlink('httpd', join(dirname(loopWrapper), 'httpd'))
  const validPeer = join(dirname(loopWrapper), 'apache2')
  await executable(validPeer, server)
  await apache._startServer(await version(loopWrapper))
  assert.equal(starts.at(-1).bin, validPeer, 'a broken candidate must not hide a valid peer')

  // First startup still probes the selected wrapper and initializes its managed config.
  const freshWrapper = join(directory, 'fresh/sbin/apachectl')
  const freshDefault = join(directory, 'fresh/conf/httpd.conf')
  await mkdir(dirname(freshDefault), { recursive: true })
  await writeFile(freshDefault, 'Listen 80\nErrorLog "/var/log/httpd/error_log"\n')
  await executable(
    freshWrapper,
    `#!/bin/sh\nif [ "$1" = "-V" ]; then\n printf '%s\\n' ' -D SERVER_CONFIG_FILE="${freshDefault}"'\nelse\n exit 1\nfi\n`
  )
  await executable(join(dirname(freshWrapper), 'httpd'), server)
  const fresh = await version(freshWrapper)
  await rm(fresh.conf)
  await apache._startServer(fresh)
  assert.equal(starts.at(-1).bin, join(dirname(freshWrapper), 'httpd'))
  assert.equal(starts.at(-1).execArgs[1], fresh.conf)
  assert.match(await readFile(fresh.conf, 'utf8'), /Listen 80/)

  const missing = join(directory, 'missing/bin/apachectl')
  await executable(missing, '#!/bin/sh\nexit 1\n')
  const before = starts.length
  await assert.rejects(apache._startServer(await version(missing)), /Apache.*executable/i)
  assert.equal(starts.length, before, 'resolution failure must not start another installation')

  await writeFile(join(dirname(custom), 'envvars'), 'echo "envvars failed" >&2\nreturn 1\n')
  await assert.rejects(apache._startServer(await version(custom)), /envvars failed/)
  assert.equal(starts.length, before, 'required environment failure must stop this startup')

  await apache._startServer(await version(httpd))
  assert.equal(starts.at(-1).bin, httpd, 'direct binary installations still work')
  fixture.linux = false
  const mac = join(directory, 'mac/bin/apachectl')
  await executable(mac, server)
  await apache._startServer(await version(mac))
  assert.equal(starts.at(-1).bin, mac, 'macOS keeps its wrapper startup')
  console.log(
    'Apache startup: Fedora wrapper, existing config, envvars, symlink, failures and macOS passed'
  )
} finally {
  delete (globalThis as any).__apacheStartTest
  await rm(directory, { recursive: true, force: true })
}
