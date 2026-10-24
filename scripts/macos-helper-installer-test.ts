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
  readdirSync,
  chmodSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

assert.equal(process.platform, 'darwin', 'These fixtures require macOS system utilities')
const require = createRequire(import.meta.url)
const version = Number(
  readFileSync('src/shared/AppHelperCheck.ts', 'utf8').match(/HelperVersion = (\d+)/)![1]
)
const bundle = await build({
  entryPoints: ['src/main/core/AppHelper.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'isolate-installation',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
const module = { exports: {} as any }
runInNewContext(bundle.outputFiles[0].text, {
  module,
  exports: module.exports,
  require(name: string) {
    if (name.startsWith('node:')) return require(name)
    if (name === '@shared/AppHelperCheck') return { HelperVersion: version }
    if (name === '@shared/utils') return { isMacOS: () => true, appDebugLog: async () => {} }
    return {}
  },
  global: {},
  setTimeout,
  clearTimeout
})
const { macOSHelperBootstrap, buildMacOSHelperInstallCommand } = module.exports
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`
const root = mkdtempSync(join(tmpdir(), 'flyenv-helper-installer-'))
let passed = 0
const failures: string[] = []
function test(name: string, run: () => void) {
  try {
    run()
    passed++
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error}`)
    console.error(`FAIL ${name}: ${error}`)
  }
}
function executable(path: string, text: string) {
  writeFileSync(path, `#!/bin/sh\nset -eu\n${text}\n`, { mode: 0o755 })
}
try {
  const app = join(root, "FlyEnv's 中文 $literal.app")
  const resources = join(app, 'Contents/Resources')
  const binary = join(resources, 'helper/flyenv-helper')
  const installer = join(resources, 'helper/flyenv-helper-init.sh')
  const plist = join(resources, 'plist/com.flyenv.helper.plist')
  const stageParent = join(root, 'private-stage')
  const record = join(root, 'record')
  const verify = join(root, 'verify')
  mkdirSync(join(resources, 'helper'), { recursive: true })
  mkdirSync(join(resources, 'plist'), { recursive: true })
  mkdirSync(stageParent)
  writeFileSync(binary, 'fixture binary')
  writeFileSync(plist, '<plist/>')
  writeFileSync(join(resources, 'unrelated-resource'), 'must not be staged')
  executable(
    installer,
    `/usr/bin/find ${quote(stageParent)} -type f > ${quote(record)}
for file in "$1" "$2"; do
  if /usr/bin/xattr -p com.apple.quarantine "$file" >/dev/null 2>&1; then exit 71; fi
done
for file in "$1" "$2" "$0" "$(/usr/bin/dirname "$0")"; do
  if /bin/ls -lde "$file" | /usr/bin/grep -Eq '^[[:space:]]+[0-9]+:.*allow'; then exit 72; fi
done
/usr/bin/printf '%s\\n' "$@" >> ${quote(record)}`
  )
  for (const file of [binary, plist]) {
    assert.equal(
      spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0083;0;fixture;', file]).status,
      0
    )
  }
  const codesign = join(root, 'codesign')
  executable(
    codesign,
    `/usr/bin/printf '%s\\n' "$*" >> ${quote(verify)}\nexit "\${VERIFY_EXIT:-0}"`
  )
  const plistBuddy = join(root, 'PlistBuddy')
  executable(plistBuddy, `/usr/bin/printf '%s\\n' '${version}'`)
  const bootstrap = macOSHelperBootstrap
    .replaceAll('/private/var/root', stageParent)
    .replaceAll('/usr/bin/codesign', codesign)
    .replaceAll('/usr/libexec/PlistBuddy', plistBuddy)
    .replaceAll('/usr/sbin/chown', '/usr/bin/true')
  const dataRoot = join(root, "user's 中文 data")
  const options = {
    mode: 'production',
    source: app,
    binary,
    installer,
    plist,
    role: '501:20',
    dataRoot
  }
  const command = buildMacOSHelperInstallCommand(options)
    .replace(quote(macOSHelperBootstrap), quote(bootstrap))
    .replace('/usr/bin/sudo ', '')
  test('only necessary files are copied; quarantine is cleared before execution; arguments survive', () => {
    const result = spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.status, 0, result.stderr)
    const lines = readFileSync(record, 'utf8').trim().split('\n')
    assert.equal(lines.length, 7, 'Exactly three staged files followed by four installer arguments')
    assert.ok(!lines.some((line) => line.includes('unrelated-resource')))
    assert.deepEqual(lines.slice(-2), ['501:20', dataRoot])
    assert.deepEqual(readdirSync(stageParent), [], 'Private staging must be cleaned')
  })
  test('source signature failures never execute the installer', () => {
    rmSync(record, { force: true })
    const result = spawnSync(
      '/bin/bash',
      ['-c', command.replace('/usr/bin/env -i ', '/usr/bin/env -i VERIFY_EXIT=1 ')],
      {
        encoding: 'utf8',
        timeout: 10_000
      }
    )
    assert.notEqual(result.status, 0)
    assert.ok(!existsSync(record))
    assert.deepEqual(readdirSync(stageParent), [])
  })
  test('locked unrelated app resources do not interfere with installer copying', () => {
    const unrelated = join(resources, 'unrelated-resource')
    assert.equal(spawnSync('/usr/bin/chflags', ['uchg', unrelated]).status, 0)
    try {
      const result = spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', timeout: 10_000 })
      assert.equal(result.status, 0, result.stderr)
    } finally {
      assert.equal(spawnSync('/usr/bin/chflags', ['nouchg', unrelated]).status, 0)
    }
  })
  test('explicit development installation stages the same three resources', () => {
    const development = buildMacOSHelperInstallCommand({ ...options, mode: 'development' })
      .replace(quote(macOSHelperBootstrap), quote(bootstrap))
      .replace('/usr/bin/sudo ', '')
    const result = spawnSync('/bin/bash', ['-c', development], {
      encoding: 'utf8',
      timeout: 10_000
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(readdirSync(stageParent), [])
  })
  test('private staging does not inherit a parent directory allow ACL', () => {
    assert.equal(
      spawnSync('/bin/chmod', [
        '+a',
        'everyone allow read,write,search,file_inherit,directory_inherit',
        stageParent
      ]).status,
      0
    )
    try {
      const result = spawnSync('/bin/bash', ['-c', command], { encoding: 'utf8', timeout: 10_000 })
      assert.equal(result.status, 0, result.stderr)
    } finally {
      assert.equal(spawnSync('/bin/chmod', ['-N', stageParent]).status, 0)
    }
  })

  // Replay the actual publishing script against disposable paths and executors.
  const library = join(root, 'Library')
  const helperDir = join(library, 'Application Support/FlyEnv/Helper')
  mkdirSync(helperDir, { recursive: true })
  mkdirSync(join(library, 'LaunchDaemons'))
  const publishingStage = join(stageParent, 'flyenv-helper-install.fixture')
  mkdirSync(publishingStage)
  const publishScript = join(publishingStage, 'installer.sh')
  const publishBinary = join(publishingStage, 'binary')
  const publishPlist = join(publishingStage, 'source.plist')
  const policyRecord = join(root, 'policy-record')
  const counter = join(root, 'counter')
  const job = join(root, 'job')
  const published = join(root, 'published')
  executable(
    publishBinary,
    `/usr/bin/touch ${quote(policyRecord)}\n/usr/bin/printf '{}' > ${quote(join(helperDir, 'policy.json'))}`
  )
  writeFileSync(publishPlist, readFileSync('build/plist/com.flyenv.helper.plist'))
  const launchctl = join(root, 'launchctl')
  executable(
    launchctl,
    `case "$1" in
print)
  if [ -f ${quote(job)} ]; then echo 'pid = 12345'; exit 0; fi
  echo 'Could not find service' >&2; exit 1 ;;
bootout) [ "\${STOP_EXIT:-0}" = 0 ] || exit "$STOP_EXIT"; /bin/rm -f ${quote(job)} ;;
enable) ;;
bootstrap) [ "\${BOOTSTRAP_EXIT:-0}" = 0 ] || exit "$BOOTSTRAP_EXIT"; /usr/bin/touch ${quote(published)} ;;
esac`
  )
  const kill = join(root, 'kill')
  executable(kill, `n=$(/bin/cat ${quote(counter)}); [ "$n" -lt "\${EXIT_AFTER:-0}" ]`)
  const sleep = join(root, 'sleep')
  executable(sleep, `n=$(/bin/cat ${quote(counter)}); echo "$((n + 1))" > ${quote(counter)}`)
  const id = join(root, 'id')
  executable(id, 'echo 0')
  const install = join(root, 'install')
  executable(
    install,
    '[ "${WRITE_EXIT:-0}" = 0 ] || exit "$WRITE_EXIT"\nif [ "$1" = -d ]; then shift 7; /bin/mkdir -p "$1"; /bin/chmod 0755 "$1"; exit 0; fi\nshift 6\n/bin/cp "$1" "$2"'
  )
  writeFileSync(
    publishScript,
    readFileSync('static/sh/macOS/flyenv-helper-init.sh', 'utf8')
      .replaceAll('/private/var/root', stageParent)
      .replaceAll('/Library/', `${library}/`)
      .replaceAll('/bin/launchctl', launchctl)
      .replaceAll('/bin/kill', kill)
      .replaceAll('/bin/sleep', sleep)
      .replaceAll('/usr/bin/id', id)
      .replaceAll('/usr/bin/install', install)
  )
  function publish(env: Record<string, string> = {}) {
    for (const file of [policyRecord, published]) rmSync(file, { force: true })
    writeFileSync(job, 'registered')
    writeFileSync(counter, '0')
    return spawnSync('/bin/sh', [publishScript, publishBinary, publishPlist, '501:20', dataRoot], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 10_000
    })
  }
  test('old helper may take more than twenty polls to exit', () => {
    const result = publish({ EXIT_AFTER: '28' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(counter, 'utf8').trim(), '28')
    assert.ok(existsSync(published))
  })
  test('failed stop preserves authorization assets', () => {
    const result = publish({ STOP_EXIT: '5' })
    assert.notEqual(result.status, 0)
    assert.ok(!existsSync(policyRecord))
    assert.ok(!existsSync(published))
  })
  test('real publication failure still fails installation', () => {
    const result = publish({ WRITE_EXIT: '1' })
    assert.notEqual(result.status, 0)
    assert.ok(!existsSync(published))
  })
  test('launchctl bootstrap error remains the real exit code', () => {
    const result = publish({ BOOTSTRAP_EXIT: '5' })
    assert.equal(result.status, 5, result.stderr)
    assert.ok(!existsSync(published))
  })
  test('inherited directory ACL does not make the new policy file invalid', () => {
    rmSync(join(helperDir, 'policy.json'), { force: true })
    assert.equal(
      spawnSync('/bin/chmod', [
        '+a',
        'everyone allow read,write,file_inherit,directory_inherit',
        helperDir
      ]).status,
      0
    )
    const result = publish()
    assert.equal(result.status, 0, result.stderr)
    const attributes = spawnSync('/bin/ls', ['-le', join(helperDir, 'policy.json')], {
      encoding: 'utf8'
    })
    assert.equal(attributes.status, 0)
    assert.ok(!attributes.stdout.includes('allow'), attributes.stdout)
  })
  test('existing helper directory modes are preserved', () => {
    const parent = join(helperDir, '..')
    chmodSync(parent, 0o775)
    chmodSync(helperDir, 0o777)
    const result = publish()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(statSync(parent).mode & 0o777, 0o775)
    assert.equal(statSync(helperDir).mode & 0o777, 0o777)
  })
  test('new helper directories receive traversal permissions', () => {
    rmSync(join(helperDir, '..'), { recursive: true, force: true })
    const result = publish()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(statSync(helperDir).mode & 0o777, 0o755)
    assert.equal(statSync(join(helperDir, '..')).mode & 0o777, 0o755)
  })
} finally {
  rmSync(root, { recursive: true, force: true })
}
assert.deepEqual(failures, [], `${passed} passed; ${failures.length} failed`)
console.log(`${passed} macOS helper installer checks passed`)
