import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
test('backup directory picker shares duplicate requests and cancellation preserves the previous directory', async () => {
  let finish!: (value: any) => void
  const preferences = { a: { backupDir: '/keep' } }
  ;(globalThis as any).__mcPicker = {
    pick: () =>
      new Promise((r) => {
        finish = r
      }),
    manager: {
      preferences,
      deps: { notify() {} },
      async savePreferences(id: string, value: any) {
        Object.assign((preferences as any)[id], value)
        return { status: 'completed' }
      }
    }
  }
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/render/manage.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'native-transport',
        setup(builder) {
          builder.onResolve({ filter: /^(?:@|\.\/manager$)/ }, (args) => ({
            path: args.path,
            namespace: 'host'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
            contents:
              args.path === '@/util/Index'
                ? 'export const reactiveBind=x=>x'
                : args.path === './manager'
                  ? 'export const MysqlClusterManager=globalThis.__mcPicker.manager'
                  : 'export const dialog={showOpenDialog:()=>globalThis.__mcPicker.pick()};export const shell={openPath:async()=>true}'
          }))
        }
      }
    ]
  })
  const { MysqlManagementController } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
  const c = new MysqlManagementController()
  assert.equal(typeof c.chooseBackupDirectory, 'function')
  const one = c.chooseBackupDirectory('a'),
    two = c.chooseBackupDirectory('a')
  assert.equal(one, two)
  await Promise.resolve()
  finish({ canceled: true, filePaths: [] })
  assert.equal(await one, undefined)
  assert.equal(preferences.a.backupDir, '/keep')
  assert.equal(c.directoryBusy('a'), false)
})
