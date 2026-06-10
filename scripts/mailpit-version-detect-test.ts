import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
;(global as any).Server = {
  Proxy: undefined
}

const { versionBinVersion } = await import('../src/fork/util/Version')

const tempDir = await mkdtemp(join(tmpdir(), 'flyenv-mailpit-version-'))
const scriptFile = join(tempDir, 'mailpit-version-fixture.mjs')

try {
  await writeFile(
    scriptFile,
    "process.stdout.write('mailpit v1.27.11 compiled with go1.25.4 on darwin/arm64\\n'); process.exit(1)\n"
  )

  const command = `"${process.execPath}" "${scriptFile}"`
  const result = await versionBinVersion(
    process.execPath,
    command,
    /(v)(\d+(\.\d+){1,4})( )/g,
    true
  )

  assert.equal(result.version, '1.27.11')

  console.log('mailpit version detection tests passed')
} finally {
  await rm(tempDir, { force: true, recursive: true })
}

process.exit(0)
