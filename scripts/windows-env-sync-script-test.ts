import assert from 'node:assert/strict'
import { WINDOWS_ENV_SCRIPT } from '../src/shared/EnvSync'

async function main() {
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariables\('Machine'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariables\('User'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariable\('Path', 'Machine'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /GetEnvironmentVariable\('Path', 'User'\)/)
  assert.match(WINDOWS_ENV_SCRIPT, /ExpandEnvironmentVariables/)
  assert.match(WINDOWS_ENV_SCRIPT, /\$result\['PATH'\] = \$rawPath/)
  assert.doesNotMatch(WINDOWS_ENV_SCRIPT, /DoNotExpandEnvironmentNames/)

  console.log('windows env sync script test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
