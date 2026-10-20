import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { InstanceCatalog } from '../fork/catalog'
import { MysqlInstanceRuntime } from '../fork/runtime'
import { initializeInstance } from '../fork/initialize'
import { ReplicationService } from '../fork/replication'
import { GroupReplicationService } from '../fork/groupReplication'
import { withInstanceConnection } from '../fork/sql'
import { listDatabases, mutateDatabase, createDatabase, backupDatabase } from '../fork/manage'
import { StopProcessListFetch } from '../../../src/shared/StopProcessList'
import { InstanceStopAdapter } from '../fork/service'
import type { ClusterMode, CreateRequest } from '../shared'

const bin = process.env.MYSQL_CLUSTER_TEST_BIN
test(
  'native: isolated instances, real GTID replication, GR election and full-stop recovery',
  { skip: !bin, timeout: 300_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'mc-native space-'))
    const engineRoot = join(root, 'MySQL Engine')
    await symlink(dirname(dirname(bin!)), engineRoot, 'dir')
    console.log('native data root', root)
    ;(globalThis as any).Server = {
      MysqlDir: root,
      BaseDir: root,
      AppDir: root,
      BrewCellar: '/nonexistent',
      Static: join(process.cwd(), 'dist/electron')
    }
    const catalog = new InstanceCatalog(join(root, 'managed'), 'macOS')
    const runtime = new MysqlInstanceRuntime(catalog, {
      list: StopProcessListFetch,
      stop: async (spec, pid) => {
        const result: any = await new InstanceStopAdapter(catalog, spec).stopService({
          ...runtime.descriptor(spec),
          pid
        })
        return result['APP-Service-Stop-PID'] ?? []
      }
    })
    const created: string[] = []
    const make = (mode: ClusterMode, count: number): CreateRequest => {
      const group = randomUUID().replace(/-/g, '').slice(0, 8),
        base = 25000 + Math.floor(Math.random() * 15000)
      const instances = Array.from({ length: count }, (_, n) => ({
        id: `${group}_${n}`,
        name: `${group}_${n}`,
        engine: {
          version: '8.4.8',
          path: engineRoot,
          bin: join(engineRoot, 'bin/mysqld'),
          source: 'Static' as const
        },
        port: base + n,
        groupPort: mode === 'group-replication' ? base + 100 + n : undefined,
        socket: `/tmp/flyenv-native-${group}_${n}.sock`,
        dataDir: join(root, 'data', `${group}_${n}`),
        serverId: base + n
      }))
      return {
        cluster: {
          id: group,
          name: group,
          mode,
          memberIds: instances.map((i) => i.id),
          groupUuid: randomUUID()
        },
        instances,
        credentials: Object.fromEntries(
          instances.map((i) => [i.id, { user: 'root', password: 'Mc-native-"x\\a$`19' }])
        )
      }
    }
    try {
      for (const [mode, count] of [
        ['standalone', 1],
        ['replication', 2],
        ['group-replication', 3]
      ] as [ClusterMode, number][]) {
        const request = make(mode, count)
        await catalog.prepare(request)
        for (const spec of request.instances) {
          created.push(spec.id)
          await initializeInstance(catalog, spec.id, () => {})
          await runtime.start(spec.id, request.credentials[spec.id])
          assert.equal((await runtime.discover(spec.id)).state, 'running')
        }
        const replication = new ReplicationService(catalog),
          gr = new GroupReplicationService(catalog)
        if (mode === 'replication') {
          const result = await replication.configure(request.cluster, request.credentials, () => {})
          assert.equal(result.status, 'completed', JSON.stringify(result))
        }
        if (mode === 'group-replication') {
          const result = await gr.configure(request.cluster, request.credentials, () => {})
          assert.equal(result.status, 'completed', JSON.stringify(result))
        }
        let primary = request.instances[0].id
        if (mode === 'group-replication') {
          for (const spec of request.instances)
            if ((await gr.status(spec.id, request.credentials[spec.id])).role === 'PRIMARY')
              primary = spec.id
        }
        await mutateDatabase(catalog, primary, request.credentials[primary], (session) =>
          createDatabase(session, {
            database: 'managed_db',
            user: 'managed_user',
            password: 'Managed-Password-19',
            charset: 'utf8mb4'
          })
        )
        assert.ok(
          (await listDatabases(catalog, primary, request.credentials[primary])).databases.some(
            (d) => d.name === 'managed_db'
          )
        )
        const backup = await backupDatabase(
          catalog,
          primary,
          request.credentials[primary],
          ['managed_db'],
          join(root, 'backups', request.cluster.id),
          () => {}
        )
        assert.equal(backup.status, 'completed', JSON.stringify(backup))
        assert.match(await readFile(backup.items[0].stage, 'utf8'), /managed_db/)
        if (count > 1) {
          const secondary = request.cluster.memberIds.find((id) => id !== primary)!
          await assert.rejects(
            mutateDatabase(catalog, secondary, request.credentials[secondary], async (session) =>
              session.query('CREATE DATABASE forbidden_on_replica')
            ),
            /read.only|PRIMARY/i
          )
        }
        await withInstanceConnection(catalog, primary, request.credentials[primary], async (s) => {
          await s.query('CREATE DATABASE acceptance')
          await s.query('CREATE TABLE acceptance.probe (id INT PRIMARY KEY)')
          await s.query('INSERT INTO acceptance.probe VALUES (1)')
        })
        for (const spec of request.instances) {
          const deadline = Date.now() + 15_000
          let copied = false
          while (Date.now() < deadline && !copied) {
            try {
              copied = await withInstanceConnection(
                catalog,
                spec.id,
                request.credentials[spec.id],
                async (s) => (await s.query('SELECT * FROM acceptance.probe')).length === 1
              )
            } catch {
              /* Wait for the real applier. */
            }
            if (!copied) await new Promise((r) => setTimeout(r, 200))
          }
          assert.equal(copied, true, `${mode} ${spec.id} received the write`)
        }
        if (mode === 'group-replication') {
          await runtime.stop(primary)
          for (const id of request.cluster.memberIds.filter((id) => id !== primary))
            assert.equal((await runtime.discover(id)).state, 'running')
          const deadline = Date.now() + 20_000
          let elected = false
          while (!elected && Date.now() < deadline) {
            for (const id of request.cluster.memberIds.filter((id) => id !== primary))
              if ((await gr.status(id, request.credentials[id])).role === 'PRIMARY') elected = true
            if (!elected) await new Promise((r) => setTimeout(r, 250))
          }
          assert.equal(elected, true)
          await runtime.start(primary, request.credentials[primary])
          assert.equal(
            (await gr.configure(request.cluster, request.credentials, () => {})).status,
            'completed'
          )
          for (const id of [...request.cluster.memberIds].reverse()) await runtime.stop(id)
          for (const id of request.cluster.memberIds)
            await runtime.start(id, request.credentials[id])
          assert.equal(
            (await gr.configure(request.cluster, request.credentials, () => {})).status,
            'completed'
          )
        }
        for (const id of [...request.cluster.memberIds].reverse()) await runtime.stop(id)
        console.log('native passed', mode)
      }
    } catch (error) {
      const c = await catalog.read()
      for (const id of created) {
        const log = await readFile(catalog.paths(id).error, 'utf8').catch(() => '')
        console.log('native failure log', id, log.slice(-3500))
      }
      console.log('native retained instance count', c.instances.length)
      throw error
    } finally {
      for (const id of created.reverse()) await runtime.stop(id).catch(() => undefined)
      const live = (await runtime.listInstances()).filter(
        (s) => s.state === 'running' || s.state === 'unknown'
      )
      if (!live.length) await rm(root, { recursive: true, force: true })
      else console.log('Retained data root for incomplete cleanup', root)
    }
  }
)
