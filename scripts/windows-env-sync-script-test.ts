import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WINDOWS_ENV_SCRIPT } from '../src/shared/EnvSync'
import * as EnvSyncLocal from '../src/shared/EnvSyncLocal'

async function main() {
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariables\('Machine'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariables\('User'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariable\('Path', 'Machine'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariable\('Path', 'User'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /ExpandEnvironmentVariables/)
  assert.match(WINDOWS_ENV_SCRIPT, /\$result\['PATH'\] = \$rawPath/)
  assert.match(WINDOWS_ENV_SCRIPT, /\$mPaths = if \(\$mPath\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /\$uPaths = if \(\$uPath\)/)
  assert.doesNotMatch(WINDOWS_ENV_SCRIPT, /\$mPath\.Split\(';'\) \+ \$uPath\.Split\(';'\)/)
  assert.doesNotMatch(WINDOWS_ENV_SCRIPT, /DoNotExpandEnvironmentNames/)

  const accessSource = readFileSync('src/shared/EnvSync.ts', 'utf8')
  const localSource = readFileSync('src/shared/EnvSyncLocal.ts', 'utf8')
  assert.doesNotMatch(accessSource, /EnvSyncAccess use cache/)
  assert.doesNotMatch(accessSource, /EnvSyncAccess cache cleaned/)
  assert.doesNotMatch(localSource, /EnvSyncLocalLoader fetch/)
  assert.doesNotMatch(localSource, /\$HOME\/\.linuxbrew\/bin/)
  assert.match(localSource, /join\(home, '\.linuxbrew\/bin'\)/)
  assert.match(localSource, /existsSync\(candidate\)/)

  const buildUnixPath = (EnvSyncLocal as any).buildUnixPath
  assert.equal(typeof buildUnixPath, 'function')
  assert.equal(
    buildUnixPath('$HOME/.linuxbrew/bin:${HOME}/bin:/usr/bin', '/home/flyenv'),
    '/home/flyenv/.linuxbrew/bin:/home/flyenv/bin:/usr/bin:/opt/podman/bin:/home/linuxbrew/.linuxbrew/bin:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/sbin'
  )

  console.log('windows env sync script test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
