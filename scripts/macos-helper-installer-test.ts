import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
  statSync
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { spawnSync, exec as systemExec } from 'node:child_process'
import * as helperState from '../src/shared/WindowsHelperState'
import { HelperVersion } from '../src/shared/AppHelperCheck'

const require = createRequire(import.meta.url)
const bundled = await build({
  entryPoints: ['src/main/core/AppHelper.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  supported: { 'dynamic-import': false },
  plugins: [
    {
      name: 'boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
let graphicalMac = false
let linuxInstaller = false
let validLinuxResources = true
let graphicalOutput = ''
let graphicalError: (Error & { stderr: string }) | undefined
let graphicalOptions: any
const sudoBundle = await build({
  entryPoints: ['src/shared/Sudo.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  packages: 'external',
  plugins: [
    {
      name: 'sudo-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /utils$/ }, () => ({ path: './utils', external: true }))
      }
    }
  ]
})
const sudoModule = { exports: {} as any }
runInNewContext(sudoBundle.outputFiles[0].text, {
  module: sudoModule,
  exports: sudoModule.exports,
  require: (name: string) => {
    if (name === './utils')
      return {
        appDebugLog: async () => {},
        uuid: () => require('node:crypto').randomUUID(),
        waitTime: async () => {}
      }
    if (name === 'node:child_process')
      return {
        ...require(name),
        exec: (command: string, options: any, done: any) => {
          if (command !== './applet') return systemExec(command, options, done)
          assert.equal(existsSync(join(options.cwd, 'applet')), true)
          const plist = readFileSync(join(options.cwd, '../Info.plist'))
          const decoded = spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], {
            input: plist,
            encoding: 'utf8'
          })
          assert.equal(decoded.status, 0, decoded.stderr)
          assert.match(decoded.stdout, /FlyEnv Password Prompt/)
          // Exercise Sudo's command/result files without opening an authorization dialog.
          if (graphicalError?.message === 'User did not grant permission.')
            return done(null, '', '')
          const result = spawnSync('/bin/bash', ['sudo-prompt-command'], {
            cwd: options.cwd,
            encoding: 'utf8'
          })
          graphicalOutput = result.stdout
          writeFileSync(join(options.cwd, 'stdout'), result.stdout)
          writeFileSync(join(options.cwd, 'stderr'), graphicalError?.stderr ?? result.stderr)
          writeFileSync(join(options.cwd, 'code'), `${graphicalError ? 1 : result.status}`)
          done(null, '', '')
        }
      }
    return require(name)
  },
  process,
  Buffer,
  Error,
  console
})
const module = { exports: {} as any }
const installerRuntime = {
  Server: {
    Static: '/task/System/FlyEnv/resources/app.asar/dist/static',
    AppDir: '/task/User/data/app',
    BaseDir: '/task/User/data',
    isArmArch: false
  }
}
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name: string) => {
    if (name === 'node:child_process')
      return {
        execFile: () => {
          throw new Error('AppHelper must delegate macOS authorization to shared Sudo.ts')
        }
      }
    if (name === '@shared/SudoError') return sudoModule.exports
    if (name === '@shared/Sudo')
      return {
        ...sudoModule.exports,
        exec: (command: string, options: any) => {
          graphicalOptions = options
          return sudoModule.exports.exec(command, options)
        }
      }
    if (name === '@shared/fs-extra')
      return {
        existsSync: () => true,
        readFile: () => {
          throw new Error('Helper installation must not read the unrelated CA')
        }
      }
    if (name === 'node:fs')
      return {
        ...require(name),
        realpathSync: (path: string) =>
          path === '/task/User/data' ? path : require(name).realpathSync(path),
        statSync: (path: string) => {
          if (!linuxInstaller) return require(name).statSync(path)
          const managed = path === '/task/System/FlyEnv' || path.startsWith('/task/System/FlyEnv/')
          return {
            isFile: () => true,
            uid: managed && validLinuxResources ? 0 : 501,
            mode: managed && validLinuxResources ? 0o755 : 0o777
          }
        }
      }
    if (name === '@shared/utils')
      return {
        isMacOS: () => graphicalMac,
        isWindows: () => false,
        isLinux: () => linuxInstaller,
        appDebugLog: async () => {}
      }
    if (name === '@shared/WindowsHelperState') return helperState
    if (name === '@shared/AppHelperCheck')
      return { AppHelperCheck: async () => true, HelperVersion }
    if (name.startsWith('node:')) return require(name)
    if (name === 'electron-is') return { production: () => true }
    return {}
  },
  global: installerRuntime,
  setTimeout,
  Error,
  console
})
const { buildMacOSHelperInstallCommand, macOSHelperBootstrap } = module.exports
linuxInstaller = true
try {
  const linux = module.exports.createAppHelper()
  const install = await linux.command()
  assert.match(install.command, /'\/task\/System\/FlyEnv\/helper\/flyenv-helper'/)
  validLinuxResources = false
  await linux.command() // Copied/user-managed resources are valid installation sources.
} finally {
  linuxInstaller = false
  validLinuxResources = true
}
graphicalMac = true
try {
  const mac = module.exports.createAppHelper()
  const install = await mac.command()
  assert.equal(install.command.includes('approved-ca'), false)
  assert.equal(install.command.includes('FlyEnv-Root-CA'), false)
} finally {
  graphicalMac = false
}
assert.equal(
  typeof buildMacOSHelperInstallCommand,
  'function',
  'macOS installation must use the fixed bootstrap command'
)
const root = mkdtempSync(join(tmpdir(), 'flyenv-macos-installer-test-'))
try {
  const stageParent = join(root, 'protected')
  const source = join(root, "user's $HOME `touch injected` app")
  mkdirSync(stageParent)
  chmodSync(stageParent, 0o777)
  mkdirSync(join(source, 'Contents/Resources/helper'), { recursive: true })
  mkdirSync(join(source, 'Contents/Resources/plist'), { recursive: true })
  const record = join(root, 'record')
  const marker = join(root, 'injected')
  const installer = join(source, 'Contents/Resources/helper/flyenv-helper-init.sh')
  writeFileSync(installer, '#!/bin/sh\nprintf "%s\\n" "$@" > "$RECORD"\n')
  writeFileSync(join(source, 'Contents/Resources/helper/flyenv-helper'), '#!/bin/sh\nexit 0\n')
  writeFileSync(join(source, 'Contents/Resources/plist/com.flyenv.helper.plist'), '<plist/>')
  const codesign = join(root, 'codesign')
  writeFileSync(
    codesign,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$VERIFY_RECORD"\nif [ -n "${MUTATE_SOURCE:-}" ]; then printf "#!/bin/sh\\nexit 91\\n" > "$MUTATE_SOURCE"; fi\nif [ "${VERIFY_FAIL:-0}" != 0 ]; then echo "code has no resources but signature indicates they must be present" >&2; exit 1; fi\n',
    { mode: 0o755 }
  )
  const plistBuddy = join(root, 'PlistBuddy')
  writeFileSync(
    plistBuddy,
    `#!/bin/sh\nif [ "\${PROTOCOL_MISSING:-0}" = 1 ]; then exit 1; fi\nprintf "%s\\n" "\${PROTOCOL:-${HelperVersion}}"\n`,
    { mode: 0o755 }
  )
  const bootstrap = macOSHelperBootstrap
    .replaceAll('/usr/libexec/PlistBuddy', plistBuddy)
    .replaceAll('/private/var/root', stageParent)
    .replaceAll('/usr/bin/codesign', codesign)
    .replaceAll('/usr/sbin/chown', '/usr/bin/true')
  // Only system authorization/ownership boundaries are injected; copy and execution are real.
  const command = buildMacOSHelperInstallCommand({
    mode: 'production',
    source,
    binary: '',
    installer: '',
    plist: '',
    role: '501:20',
    dataRoot: "/var/with a ' $HOME `touch injected`"
  })
  const commandFixture = command
    .replace(macOSHelperBootstrap.replace(/'/g, "'\\''"), bootstrap.replace(/'/g, "'\\''"))
    .replace('/usr/bin/sudo ', '')
    .replace('/usr/bin/env -i', '/usr/bin/env')
  const result = spawnSync('/bin/sh', ['-c', commandFixture], {
    cwd: root,
    env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify') },
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    statSync(stageParent).mode & 0o777,
    0o777,
    'retain user-managed staging parent permissions'
  )
  assert.equal(existsSync(marker), false, 'installer arguments must remain literal shell data')
  const args = readFileSync(record, 'utf8').split('\n')
  assert.ok(args[0].startsWith(stageParent), 'executed helper is the protected copy')
  assert.equal(args[2], '501:20')
  assert.equal(args[3], "/var/with a ' $HOME `touch injected`")
  const verified = readFileSync(join(root, 'verify'), 'utf8')
  assert.match(verified, /956BZQ2F2P/)
  assert.match(verified, /--deep/)
  assert.match(verified, /=identifier/)
  rmSync(record)
  const rejected = spawnSync('/bin/sh', ['-c', commandFixture], {
    env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify'), VERIFY_FAIL: '1' },
    encoding: 'utf8'
  })
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /FLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:/)
  assert.match(rejected.stderr, /code has no resources/)
  assert.equal(
    existsSync(record),
    false,
    'production signature failure must not execute installer or downgrade'
  )
  rmSync(stageParent, { recursive: true })
  writeFileSync(stageParent, 'not a directory')
  const invalidParent = spawnSync('/bin/sh', ['-c', commandFixture], {
    env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify') },
    encoding: 'utf8'
  })
  assert.notEqual(invalidParent.status, 0)
  assert.match(invalidParent.stderr, /FLYENV_HELPER_INSTALL_ERROR:helper_acl_invalid:/)
  assert.equal(existsSync(record), false, 'invalid staging paths cannot execute the installer')
  rmSync(stageParent)
  mkdirSync(stageParent)
  chmodSync(stageParent, 0o777)
  for (const env of [
    { PROTOCOL: String(HelperVersion - 1) },
    { PROTOCOL: String(HelperVersion + 1) },
    { PROTOCOL_MISSING: '1' }
  ]) {
    const outdated = spawnSync('/bin/sh', ['-c', commandFixture], {
      env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify'), ...env },
      encoding: 'utf8'
    })
    assert.notEqual(outdated.status, 0)
    assert.match(outdated.stderr, /Unsupported signed helper installation protocol/)
    assert.equal(
      existsSync(record),
      false,
      'an older authentic signed installer must not run as root'
    )
  }
  const replaced = spawnSync('/bin/sh', ['-c', commandFixture], {
    env: {
      ...process.env,
      RECORD: record,
      VERIFY_RECORD: join(root, 'verify'),
      MUTATE_SOURCE: installer
    },
    encoding: 'utf8'
  })
  assert.equal(replaced.status, 0, replaced.stderr)
  assert.ok(
    readFileSync(record, 'utf8').startsWith(stageParent),
    'source replacement after verification must not change the protected installer'
  )
  writeFileSync(installer, '#!/bin/sh\nprintf "%s\\n" "$@" > "$RECORD"\n')
  const beforeDev = readFileSync(join(root, 'verify'), 'utf8')
  const development = buildMacOSHelperInstallCommand({
    mode: 'development',
    source: '',
    binary: join(source, 'Contents/Resources/helper/flyenv-helper'),
    installer,
    plist: join(source, 'Contents/Resources/plist/com.flyenv.helper.plist'),
    role: '501:20',
    dataRoot: '/var/development'
  })
    .replace(macOSHelperBootstrap.replace(/'/g, "'\\''"), bootstrap.replace(/'/g, "'\\''"))
    .replace('/usr/bin/sudo ', '')
    .replace('/usr/bin/env -i', '/usr/bin/env')
  const devResult = spawnSync('/bin/sh', ['-c', development], {
    env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify'), VERIFY_FAIL: '1' },
    encoding: 'utf8'
  })
  assert.equal(devResult.status, 0, devResult.stderr)
  assert.match(devResult.stderr, /Explicit administrator development/)
  assert.equal(
    readFileSync(join(root, 'verify'), 'utf8'),
    beforeDev,
    'explicit development must not pretend to verify a release signature'
  )
  console.log(
    'macOS protected bootstrap, production signature rejection, source replacement, development separation and quoting checks passed'
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}

const fixture = mkdtempSync(join(tmpdir(), 'flyenv-macos-publish-test-'))
try {
  const protectedRoot = join(fixture, 'root')
  const stage = join(protectedRoot, 'flyenv-helper-install.fixture')
  const library = join(fixture, 'Library')
  mkdirSync(stage, { recursive: true })
  mkdirSync(join(library, 'Application Support/FlyEnv/Helper'), { recursive: true })
  mkdirSync(join(library, 'LaunchDaemons'), { recursive: true })
  const log = join(fixture, 'operations')
  const job = join(fixture, 'job')
  const alive = join(fixture, 'alive')
  const policy = join(library, 'Application Support/FlyEnv/Helper/policy.json')
  const helper = join(stage, 'flyenv-helper')
  const plist = join(stage, 'com.flyenv.helper.plist')
  const script = join(stage, 'flyenv-helper-init.sh')
  const keyACL =
    process.platform === 'darwin'
      ? `/bin/chmod +a 'user:${userInfo().username.replace(/'/g, "'\\''")} allow read' "$KEY"\n`
      : ''
  writeFileSync(
    helper,
    '#!/bin/sh\nprintf "%s\\n" "$@" >> "$LOG"\n/bin/mkdir -p "$(/usr/bin/dirname "$POLICY")"\nprintf new-policy > "$POLICY"\n' +
      'KEY="$(/usr/bin/dirname "$POLICY")/client.key"\n/bin/dd if=/dev/zero of="$KEY" bs=32 count=1 2>/dev/null\n/bin/chmod 0600 "$KEY"\n' +
      keyACL,
    { mode: 0o755 }
  )
  writeFileSync(plist, readFileSync('build/plist/com.flyenv.helper.plist'))
  const fakeTool = (name: string, body: string) => {
    const file = join(fixture, name)
    writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    return file
  }
  const launchctl = fakeTool(
    'launchctl',
    `case "$1" in
print) if [ "\${QUERY_FAIL:-0}" = 1 ]; then echo "permission denied" >&2; exit 1; fi; if [ -f "$JOB" ]; then printf '  pid = 888888\n'; else echo 'Could not find service com.flyenv.helper' >&2; exit 113; fi ;;
bootout) [ "\${STOP_FAIL:-0}" = 0 ] || exit 1; /bin/rm -f "$JOB" ;;
enable|bootstrap) printf '%s\n' "$1" >> "$LOG" ;;
esac`
  )
  const install = fakeTool(
    'install',
    'for arg in "$@"; do previous="$last"; last="$arg"; done\n/bin/cp "$previous" "$last"'
  )
  const kill = fakeTool('kill', '[ -f "$ALIVE" ]')
  const id = fakeTool('id', 'echo 0')
  let content = readFileSync('static/sh/macOS/flyenv-helper-init.sh', 'utf8')
  content = content
    .replaceAll('/private/var/root', protectedRoot)
    .replaceAll('/Library/', `${library}/`)
    .replaceAll('/bin/launchctl', launchctl)
    .replaceAll('/usr/bin/install', install)
    .replaceAll('/bin/kill', kill)
    .replaceAll('/usr/bin/id', id)
    .replaceAll('/bin/sleep', '/usr/bin/true')
  writeFileSync(script, content)
  const invoke = (env: Record<string, string> = {}, role = '501:20') =>
    spawnSync('/bin/sh', [script, helper, plist, role, "/private/var/data o'hara $HOME"], {
      env: { ...process.env, LOG: log, JOB: job, ALIVE: alive, POLICY: policy, ...env },
      encoding: 'utf8'
    })
  writeFileSync(policy, 'old-policy')
  for (const role of ['501:20:3', '501::20', ':20', '501:', '501:wheel']) {
    const invalid = invoke({}, role)
    assert.notEqual(invalid.status, 0, 'invalid account must fail before launchd/assets change')
    assert.equal(readFileSync(policy, 'utf8'), 'old-policy')
    assert.equal(existsSync(log), false)
  }
  writeFileSync(job, 'running')
  let result = invoke({ QUERY_FAIL: '1' })
  assert.notEqual(result.status, 0)
  assert.equal(
    readFileSync(policy, 'utf8'),
    'old-policy',
    'an unknown launchd state must not be treated as stopped'
  )
  assert.equal(existsSync(log), false)
  result = invoke({ STOP_FAIL: '1' })
  assert.notEqual(result.status, 0)
  assert.equal(
    readFileSync(policy, 'utf8'),
    'old-policy',
    'stop failure must leave policy/key untouched'
  )
  assert.equal(existsSync(log), false)
  writeFileSync(alive, 'still-running')
  result = invoke()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /has not exited/)
  assert.equal(
    readFileSync(policy, 'utf8'),
    'old-policy',
    'label removal cannot replace process-exit verification'
  )
  rmSync(alive)
  const helperDirectory = join(library, 'Application Support/FlyEnv/Helper')
  // Reinstallation must repair the actual 0700 directories left by umask 077.
  chmodSync(join(helperDirectory, '..'), 0o700)
  chmodSync(helperDirectory, 0o700)
  result = invoke()
  assert.equal(result.status, 0, result.stderr)
  for (const directory of [join(helperDirectory, '..'), helperDirectory]) {
    assert.equal(
      statSync(directory).mode & 0o777,
      0o755,
      'desktop clients must traverse protected installation directories after publication'
    )
  }
  const assertKeyProtection = () => {
    const key = join(helperDirectory, 'client.key')
    assert.equal(statSync(key).mode & 0o777, 0o600, 'directory repair must not expose key data')
    if (process.platform === 'darwin') {
      const acl = spawnSync('/bin/ls', ['-le', key], { encoding: 'utf8' })
      assert.equal(acl.status, 0, acl.stderr)
      const entries = acl.stdout.trimEnd().split('\n').slice(1)
      assert.equal(entries.length, 1, 'directory repair must retain the single UID read ACL')
      assert.match(entries[0], /^\s*0: user:\S+ allow read$/)
    }
  }
  assertKeyProtection()
  assert.equal(readFileSync(policy, 'utf8'), 'new-policy')
  const operations = readFileSync(log, 'utf8').split('\n')
  assert.equal(operations[0], '--install-darwin-policy')
  assert.equal(operations[1], '501:20')
  assert.equal(operations[2], "/private/var/data o'hara $HOME")
  assert.ok(operations.indexOf('bootstrap') > operations.indexOf('--install-darwin-policy'))
  rmSync(join(helperDirectory, '..'), { recursive: true })
  result = invoke()
  assert.equal(result.status, 0, result.stderr)
  for (const directory of [join(helperDirectory, '..'), helperDirectory]) {
    assert.equal(statSync(directory).mode & 0o777, 0o755, 'fresh install under umask 077')
  }
  assertKeyProtection()
  console.log(
    'macOS old-daemon stop failure, process liveness and protected policy publication checks passed'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

if (process.platform === 'darwin') {
  graphicalMac = true
  let healthChecks = 0
  const graphical = module.exports.createAppHelper({
    appHelperCheck: async () => {
      if (++healthChecks === 1)
        throw new helperState.AppHelperError('helper_key_missing', 'fixture install required')
      return true
    }
  })
  const literal = `double " backslash \\ apostrophe ' $HOME\nsecond line`
  graphical.command = async () => ({
    command: `/usr/bin/printf '%s' '${literal.replace(/'/g, "'\\''")}'`,
    icns: join(process.cwd(), 'build/Icon.icns')
  })
  assert.equal(await graphical.initHelper(), true)
  assert.equal(graphicalOutput.trimEnd(), literal)
  assert.equal(graphicalOptions.name, 'FlyEnv')
  assert.equal(graphicalOptions.icns, join(process.cwd(), 'build/Icon.icns'))
  const failedHealth = module.exports.createAppHelper({
    appHelperCheck: async () => {
      throw new helperState.AppHelperError(
        'helper_key_invalid',
        'Helper key is inaccessible',
        'EACCES: permission denied'
      )
    }
  })
  failedHealth.command = graphical.command
  const statuses: any[] = []
  failedHealth.onStatusMessage((status: any) => statuses.push(status))
  await assert.rejects(
    failedHealth.initHelper(),
    (error: any) => error.code === 'helper_key_invalid'
  )
  assert.equal(statuses.at(-1).state, 'installFaild')
  assert.equal(
    statuses.some((status) => status.state === 'checkSuccess'),
    false
  )
  assert.match(statuses.at(-1).stderr, /EACCES/)
  try {
    graphicalError = Object.assign(new Error('User did not grant permission.'), {
      stderr: ''
    })
    await assert.rejects(
      sudoModule.exports.exec('echo unused', { name: 'FlyEnv' }),
      (error: any) => error.name === 'SudoCancelledError'
    )
    const cancelled = module.exports.createAppHelper({
      appHelperCheck: async () => {
        throw new helperState.AppHelperError('helper_key_missing', 'fixture install required')
      }
    })
    cancelled.command = graphical.command
    await assert.rejects(
      cancelled.initHelper(),
      (error: any) => error.code === 'elevation_cancelled'
    )
    graphicalError = Object.assign(new Error('installer failed'), {
      stderr: 'FLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:fixture signature failure'
    })
    const failed = module.exports.createAppHelper({
      appHelperCheck: async () => {
        throw new helperState.AppHelperError('helper_key_missing', 'fixture install required')
      }
    })
    failed.command = async () => ({
      command: `${(await graphical.command()).command}\n# FLYENV_HELPER_INSTALL_ERROR:helper_acl_invalid:bootstrap text`,
      icns: graphicalOptions.icns
    })
    await assert.rejects(
      failed.initHelper(),
      (error: any) =>
        error.code === 'helper_signature_invalid' &&
        error.message === 'fixture signature failure' &&
        error.stderr === graphicalError?.stderr
    )
  } finally {
    graphicalError = undefined
  }
  console.log(
    'macOS graphical installation uses the existing Sudo applet, cancellation and failure diagnostics'
  )
}
