import assert from 'node:assert/strict'

async function main() {
  const { syncStaticInstalledFlags } = await import(
    '../src/render/core/Module/syncStaticInstalledFlags'
  )

  const rows = [
    {
      name: 'Bun-1.2.23',
      version: '1.2.23',
      bin: 'C:/FlyEnv/bun/1.2.23/bun.exe',
      installed: false
    },
    {
      name: 'Bun-1.2.22',
      version: '1.2.22',
      bin: 'C:/FlyEnv/bun/1.2.22/bun.exe',
      installed: false
    }
  ]

  syncStaticInstalledFlags(rows, [
    {
      typeFlag: 'bun',
      version: '1.2.23',
      bin: 'C:/FlyEnv/bun/1.2.23/bun.exe',
      path: 'C:/FlyEnv/bun/1.2.23',
      num: 102,
      enable: true,
      run: false,
      running: false
    }
  ] as any)

  assert.equal(rows[0]?.installed, true)
  assert.equal(rows[1]?.installed, false)
  console.log('version-manager-static-installed-sync-test: ok')
}

main().catch((error) => {
  console.error('version-manager-static-installed-sync-test: failed', error)
  process.exit(1)
})
