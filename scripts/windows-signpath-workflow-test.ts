import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(join(root, '.github/workflows/windows-version-build.yml'), 'utf8')
const builder = readFileSync(join(root, 'scripts/app-builder.ts'), 'utf8')
const windowsConfig = readFileSync(join(root, 'configs/electron-builder.win.ts'), 'utf8')
const bundleScriptPath = join(root, 'scripts/windows-signpath-bundle.ps1')
const thisTestPath = fileURLToPath(import.meta.url)

const signingSourceFiles: string[] = []
const collectSigningSources = (path: string) => {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry)
    if (statSync(fullPath).isDirectory()) {
      collectSigningSources(fullPath)
    } else if (/\.(?:ts|mjs|ps1|ya?ml)$/.test(entry) && fullPath !== thisTestPath) {
      signingSourceFiles.push(fullPath)
    }
  }
}
for (const directory of ['.github/workflows', 'build', 'configs', 'scripts']) {
  collectSigningSources(join(root, directory))
}
for (const sourceFile of signingSourceFiles) {
  assert.doesNotMatch(
    readFileSync(sourceFile, 'utf8'),
    /Submit-SigningRequest/,
    `direct SignPath API submission is forbidden: ${sourceFile}`
  )
}

assert.doesNotMatch(windowsConfig, /afterPackSign|customSign|signtoolOptions/)
assert.match(builder, /FLYENV_WINDOWS_BUILD_STAGE/)
assert.match(builder, /FLYENV_PREPACKAGED_APP_DIR/)
assert.match(builder, /prepackaged/)
assert.doesNotMatch(
  builder,
  /portable:\s*\{[^}]*packElevateHelper/s,
  'portable.packElevateHelper is not supported by the Electron Builder schema'
)
assert.match(
  builder,
  /portable:\s*\{[^}]*useZip:\s*true/s,
  'portable packaging must bypass the elevate-helper copy path'
)

assert.equal(existsSync(bundleScriptPath), true, 'Windows SignPath bundle script must exist')
const bundleScript = readFileSync(bundleScriptPath, 'utf8')
assert.match(bundleScript, /ManifestPath/)
assert.match(bundleScript, /Compare-Object/)

const trustedActionCalls =
  workflow.match(/signpath\/github-action-submit-signing-request@v2/g) ?? []
assert.equal(trustedActionCalls.length, 2, 'app and installer signing must both use SignPath v2')
assert.match(workflow, /timeout-minutes:\s*120/)
assert.match(workflow, /FLYENV_WINDOWS_BUILD_STAGE:\s*app/)
assert.match(workflow, /FLYENV_WINDOWS_BUILD_STAGE:\s*installers/)
assert.match(workflow, /artifact-configuration-slug:\s*'windows-app'/)
assert.match(workflow, /artifact-configuration-slug:\s*'windows-installer'/)
assert.match(
  workflow,
  /github-artifact-id:\s*\$\{\{ steps\.upload-unsigned-app\.outputs\.artifact-id \}\}/
)
assert.match(workflow, /FLYENV_PREPACKAGED_APP_DIR:\s*'release\/win-unpacked'/)
assert.doesNotMatch(workflow, /Install-Module\s+-Name\s+SignPath/)

console.log('Windows SignPath trusted-build workflow tests passed')
