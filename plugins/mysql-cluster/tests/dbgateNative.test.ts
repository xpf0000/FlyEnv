import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MysqlClusterDbGate } from '../fork/dbgate'

test(
  'native companion smoke: isolated Node process, private identity, reuse and final-parent cleanup',
  { skip: process.env.MYSQL_CLUSTER_DBGATE_NATIVE_TEST !== '1', timeout: 90_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc-dbgate-native space-'))
    const previous = (globalThis as any).Server
    ;(globalThis as any).Server = {
      BaseDir: root,
      AppDir: root,
      MysqlDir: root,
      BrewCellar: '/nonexistent',
      Static: join(process.cwd(), 'dist/electron')
    }
    let running = true
    const panel = new MysqlClusterDbGate(root, {
      listInstances: async () => [{ id: 'a', state: running ? 'running' : 'stopped' }],
      stop: async () => {
        running = false
        return ['101']
      }
    })
    try {
      const descriptor = panel.descriptor()
      await mkdir(dirname(descriptor.bin), { recursive: true })
      // Fixture verifies the real runtime/start/health/stop boundary without npm or a user database.
      await writeFile(
        descriptor.bin,
        `const http=require('node:http');const auth='Basic '+Buffer.from(process.env.LOGIN+':'+process.env.PASSWORD).toString('base64');http.createServer((req,res)=>{res.statusCode=req.headers.authorization===auth?200:401;res.end('isolated fixture')}).listen(Number(process.env.PORT),'127.0.0.1');`
      )
      const node = {
        bin: process.execPath,
        path: dirname(process.execPath),
        version: process.version.slice(1)
      } as any
      const opened = await panel.open(node)
      const pid = opened['APP-Service-Start-PID']
      assert.match(pid, /^[1-9]\d*$/)
      assert.equal(opened['APP-Service-Start-Item'].typeFlag, 'mysql-cluster')
      assert.equal(opened['APP-Service-Start-Item'].bin, descriptor.bin)
      assert.equal((await panel.open(node))['APP-Service-Start-PID'], pid)
      assert.equal(new URL(opened.url).hostname, '127.0.0.1')
      const stopped = await panel.stopInstance('a', '101')
      assert.ok(stopped.includes(pid))
      assert.equal(running, false)
      await assert.rejects(panel.open(node), /running MySQL/)
    } finally {
      try {
        await panel.stop()
        await rm(root, { recursive: true, force: true })
      } finally {
        ;(globalThis as any).Server = previous
      }
    }
  }
)
