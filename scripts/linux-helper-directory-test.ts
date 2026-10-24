import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  chmodSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = readFileSync('static/sh/Linux/flyenv-helper-init.sh', 'utf8')
const check = script.match(/^check_directory\(\) \{[\s\S]*?^\}/m)?.[0]
assert.ok(check, 'The installer must check its actual destination directory type')
const root = mkdtempSync(join(tmpdir(), 'flyenv-linux-directory-'))
try {
  const directory = join(root, 'helper')
  const file = join(root, 'file')
  const link = join(root, 'link')
  mkdirSync(directory)
  writeFileSync(file, 'not a directory')
  symlinkSync(directory, link)
  // Supply Linux stat output while running the unmodified bash function on macOS.
  const source = `set -eu
stat() {
  case "$2" in
    %u) echo "$FIXTURE_UID" ;;
    %a) echo "$FIXTURE_MODE" ;;
    *) exit 90 ;;
  esac
}
${check}
check_directory "$1"`
  let passed = 0
  const failures: string[] = []
  for (const [name, uid, mode, path, expected] of [
    ['normal', '0', '755', directory, 0],
    ['user owned', '1000', '755', directory, 0],
    ['group writable', '0', '775', directory, 0],
    ['world writable', '0', '777', directory, 0],
    ['regular file', '0', '755', file, 1],
    ['missing directory', '0', '755', join(root, 'missing'), 1],
    ['symlink', '0', '755', link, 1]
  ] as const) {
    const result = spawnSync('/bin/bash', ['-c', source, 'installer-fixture', path], {
      encoding: 'utf8',
      env: { ...process.env, FIXTURE_UID: uid, FIXTURE_MODE: mode }
    })
    if (result.status === expected) {
      passed++
    } else {
      failures.push(
        `${name}: expected ${expected}, got ${result.status}; ${result.stdout}${result.stderr}`
      )
    }
  }
  assert.deepEqual(failures, [], `${passed} passed; ${failures.length} failed`)
  const ensure = script.match(/^ensure_helper_directory\(\) \{[\s\S]*?^\}/m)?.[0]
  assert.ok(ensure)
  const setup = `set -eu
install() {
  for destination in "$@"; do :; done
  mkdir -p "$destination"
  chmod 0755 "$destination"
}
${check}
${ensure}
ensure_helper_directory "$1"`
  chmodSync(directory, 0o777)
  const before = statSync(directory)
  assert.equal(spawnSync('/bin/bash', ['-c', setup, 'fixture', directory]).status, 0)
  assert.equal(statSync(directory).mode, before.mode)
  assert.equal(statSync(directory).uid, before.uid)
  passed++
  const fresh = join(root, 'new-helper')
  assert.equal(spawnSync('/bin/bash', ['-c', setup, 'fixture', fresh]).status, 0)
  assert.equal(statSync(fresh).mode & 0o777, 0o755)
  passed++
  assert.notEqual(spawnSync('/bin/bash', ['-c', setup, 'fixture', file]).status, 0)
  assert.equal(readFileSync(file, 'utf8'), 'not a directory')
  passed++
  console.log(`${passed} Linux helper directory checks passed`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
