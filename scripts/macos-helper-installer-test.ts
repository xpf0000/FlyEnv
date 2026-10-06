import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, execFile as systemExecFile } from 'node:child_process'
import * as helperState from '../src/shared/WindowsHelperState'

const require = createRequire(import.meta.url)
const bundled = await build({
  entryPoints: ['src/main/core/AppHelper.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
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
let graphicalOutput = ''
const module = { exports: {} as any }
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name: string) => {
    if (name === 'node:child_process')
      return {
        execFile: (file: string, args: string[], callback: any) => {
          assert.equal(file, '/usr/bin/osascript')
          assert.ok(args[1].endsWith(' with administrator privileges'))
          // Exercise real AppleScript escaping while replacing authorization with
          // ordinary-user execution of a harmless printf command.
          systemExecFile(
            file,
            ['-e', args[1].replace(/ with administrator privileges$/, '')],
            (error, stdout, stderr) => {
              graphicalOutput = stdout
              callback(error, stdout, stderr)
            }
          )
        }
      }
    if (name === '@shared/utils')
      return {
        isMacOS: () => graphicalMac,
        isWindows: () => false,
        isLinux: () => false,
        appDebugLog: async () => {}
      }
    if (name === '@shared/WindowsHelperState') return helperState
    if (name === '@shared/AppHelperCheck') return { AppHelperCheck: async () => true }
    if (name.startsWith('node:')) return require(name)
    if (name === 'electron-is') return { production: () => true }
    return {}
  },
  global: {},
  setTimeout,
  console
})
const { buildMacOSHelperInstallCommand, macOSHelperBootstrap } = module.exports
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
    '#!/bin/sh\nif [ "${PROTOCOL_MISSING:-0}" = 1 ]; then exit 1; fi\nprintf "%s\\n" "${PROTOCOL:-42}"\n',
    { mode: 0o755 }
  )
  const stat = join(root, 'stat')
  writeFileSync(stat, '#!/bin/sh\nprintf "%s\\n" "${OWNER_OVERRIDE:-0:700}"\n', { mode: 0o755 })
  const ls = join(root, 'ls')
  writeFileSync(
    ls,
    '#!/bin/sh\n[ "${LS_FAIL:-0}" = 0 ] || exit 1\necho protected\nif [ "${ACL_DELEGATED:-0}" = 1 ]; then echo "0: user:501 allow write"; fi\n',
    { mode: 0o755 }
  )
  const bootstrap = macOSHelperBootstrap
    .replaceAll('/usr/libexec/PlistBuddy', plistBuddy)
    .replaceAll('/usr/bin/stat', stat)
    .replaceAll('/bin/ls', ls)
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
    dataRoot: "/var/with a ' $HOME `touch injected`",
    caPath: '',
    caFingerprint: ''
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
  for (const env of [
    { OWNER_OVERRIDE: '501:700' },
    { OWNER_OVERRIDE: '0:770' },
    { ACL_DELEGATED: '1' },
    { LS_FAIL: '1' }
  ]) {
    const unprotected = spawnSync('/bin/sh', ['-c', commandFixture], {
      env: { ...process.env, RECORD: record, VERIFY_RECORD: join(root, 'verify'), ...env },
      encoding: 'utf8'
    })
    assert.notEqual(unprotected.status, 0)
    assert.match(unprotected.stderr, /FLYENV_HELPER_INSTALL_ERROR:helper_acl_invalid:/)
    assert.equal(
      existsSync(record),
      false,
      'delegated staging parents cannot authorize an installer'
    )
  }
  for (const env of [{ PROTOCOL: '41' }, { PROTOCOL: '43' }, { PROTOCOL_MISSING: '1' }]) {
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
    dataRoot: '/var/development',
    caPath: '',
    caFingerprint: ''
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
  writeFileSync(
    helper,
    '#!/bin/sh\nprintf "%s\\n" "$@" >> "$LOG"\nprintf new-policy > "$POLICY"\n',
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
    spawnSync('/bin/sh', [script, helper, plist, role, "/private/var/data o'hara $HOME", '', ''], {
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
  result = invoke()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(policy, 'utf8'), 'new-policy')
  const operations = readFileSync(log, 'utf8').split('\n')
  assert.equal(operations[0], '--install-darwin-policy')
  assert.equal(operations[1], '501:20')
  assert.equal(operations[2], "/private/var/data o'hara $HOME")
  assert.ok(operations.indexOf('bootstrap') > operations.indexOf('--install-darwin-policy'))
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
    icns: ''
  })
  assert.equal(await graphical.initHelper(), true)
  assert.equal(graphicalOutput.replace(/\r/g, '\n').trimEnd(), literal)
  console.log(
    'macOS graphical installation uses system AppleScript with literal quoting and no writable command script'
  )
}
