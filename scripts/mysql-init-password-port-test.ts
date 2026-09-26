import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression test for #773:
 * MySQL created on a non-default port kept the empty root password created by
 * --initialize-insecure, because _initPassword connected mysqladmin to the
 * default port 3306 (no --port / --defaults-file), so the password init hit the
 * wrong server and FlyEnv later connected with the default password forever.
 */

const source = readFileSync(join(process.cwd(), 'src/fork/module/Mysql/index.ts'), 'utf-8')

const start = source.indexOf('_initPassword(version: SoftInstalled')
const end = source.indexOf('_stopServer(version: SoftInstalled)')
assert.ok(start !== -1, 'MySQL _initPassword must exist')
assert.ok(end > start, 'MySQL _stopServer must follow _initPassword')
const region = source.slice(start, end)

// The Windows init-password flow must resolve the version cnf and read the port from it
assert.match(region, /my-\$\{v\}\.cnf/, '_initPassword must resolve the version cnf file')
assert.match(
  region,
  /iniParse\(content\)[\s\S]*?config\?\.mysqld\?\.port \?\? 3306/,
  '_initPassword must parse the port from the version cnf with the 3306 fallback'
)

// mysqladmin must receive the cnf, a TCP protocol hint and the parsed port
assert.match(
  region,
  /--defaults-file="\$\{m\}" --connect-timeout=2 --protocol=tcp --port=\$\{port\} --host="127\.0\.0\.1" -uroot password "\$\{password\}"/,
  '_initPassword must pass defaults-file/protocol/port to mysqladmin'
)

// The old broken command (default port, no cnf) must be gone
assert.doesNotMatch(
  region,
  /mysqladmin\.exe --host="127\.0\.0\.1" -uroot password/,
  '_initPassword must not connect to the default port anymore'
)

// A server that is slow to accept connections must not permanently lose the password init
assert.match(
  region,
  /for \(let i = 0; i < 3 && !inited; i\+\+\)/,
  '_initPassword must retry transient connection failures'
)

// Success log must report the actual password, not a hardcoded 'root'
assert.match(
  region,
  /initDBPassSuccess', \{ user: 'root', pass: password \}/,
  '_initPassword success log must report the real password'
)

console.log('MySQL init-password port checks passed')
