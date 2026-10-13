import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

async function main() {
  const { syncStaticInstalledFlags } =
    await import('../src/render/core/Module/syncStaticInstalledFlags')

  const rows = [
    {
      name: 'Bun-1.2.23',
      version: '1.2.23',
      bin: 'C:/FlyEnv/bun/1.2.23/bun.exe',
      installed: false
    },
    {
      name: 'External-Bun-1.2.23',
      version: '1.2.23',
      bin: 'C:/FlyEnv/other-bun/1.2.23/bun.exe',
      installed: false
    },
    {
      name: 'Bun-1.2.22',
      version: '1.2.22',
      bin: 'C:/FlyEnv/bun/1.2.22/bun.exe',
      installed: false
    }
  ]

  await syncStaticInstalledFlags(rows, async (bin: string) => bin === rows[0].bin)

  assert.equal(rows[0]?.installed, true)
  assert.equal(rows[1]?.installed, false)
  assert.equal(rows[2]?.installed, false)
  const directory = await mkdtemp(join(tmpdir(), 'flyenv-installed-status-'))
  try {
    const javaBin = join(directory, 'static-Temurin-21.0.8/Contents/Home/bin/java')
    const bunBin = join(directory, 'bun/1.2.23/bun')
    for (const bin of [javaBin, bunBin]) {
      await mkdir(dirname(bin), { recursive: true })
      await writeFile(bin, '')
    }
    const linkedBin = join(directory, 'java-link')
    await symlink(javaBin, linkedBin)
    const rows = [
      { version: '21.0.8', bin: javaBin, installed: false },
      { version: '21.0.8', bin: join(directory, 'static-Zulu-21.0.8/bin/java'), installed: false },
      { version: '1.2.23', bin: bunBin, installed: false },
      { version: '1.2.23', bin: join(directory, 'other-bun/1.2.23/bun'), installed: false },
      { version: '21.0.8', bin: linkedBin, installed: false },
      { version: '21.0.8', installed: true }
    ]
    const exists = async (bin: string) => existsSync(bin)
    await syncStaticInstalledFlags(rows, exists)
    assert.deepEqual(
      rows.map((row) => row.installed),
      [true, false, true, false, true, false]
    )
    await syncStaticInstalledFlags(rows, exists)
    assert.deepEqual(
      rows.map((row) => row.installed),
      [true, false, true, false, true, false]
    )
    await rm(javaBin)
    await syncStaticInstalledFlags(rows, exists)
    assert.deepEqual(
      rows.map((row) => row.installed),
      [false, false, true, false, false, false]
    )
    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args) => errors.push(args)
    try {
      rows[0].installed = true
      rows[2].installed = false
      await syncStaticInstalledFlags(rows, async (bin) => {
        if (bin === javaBin) throw new Error('unavailable')
        return existsSync(bin)
      })
      assert.equal(rows[0].installed, true, 'failed checks preserve previous state')
      assert.equal(rows[2].installed, true, 'failed checks do not block siblings')
      assert.equal(errors.length, 1)
    } finally {
      console.error = originalError
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  console.log('version-manager-static-installed-sync-test: ok')
}

main().catch((error) => {
  console.error('version-manager-static-installed-sync-test: failed', error)
  process.exit(1)
})
