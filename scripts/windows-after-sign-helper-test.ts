import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import afterSign from '../build/afterSign'

async function main() {
  const appOutDir = await mkdtemp(join(tmpdir(), 'flyenv-after-sign-'))
  const unpackedHelper = join(
    appOutDir,
    'resources/app.asar.unpacked/node_modules/helper/flyenv-helper.exe'
  )
  const helper = join(appOutDir, 'resources/helper/flyenv-helper.exe')
  const backup = join(appOutDir, 'resources/helper/flyenv-helper-backup.exe')
  const payload = Buffer.from('signed-helper-payload')

  try {
    await mkdir(join(appOutDir, 'resources/app.asar.unpacked/node_modules/helper'), {
      recursive: true
    })
    await writeFile(unpackedHelper, payload)
    await afterSign({ electronPlatformName: 'win32', appOutDir } as any)

    assert.deepEqual(await readFile(helper), payload)
    assert.deepEqual(
      await readFile(backup),
      payload,
      'local Windows packaging must include a backup helper for repair'
    )
    assert.equal(existsSync(unpackedHelper), false)
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }

  console.log('windows after-sign helper test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
