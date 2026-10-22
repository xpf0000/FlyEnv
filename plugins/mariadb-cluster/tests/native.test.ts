import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { InstanceCatalog } from '../fork/catalog'
import { MariadbInstanceRuntime } from '../fork/runtime'
import { initializeInstance } from '../fork/initialize'
import { ReplicationService } from '../fork/replication'
import { withInstanceConnection } from '../fork/sql'
import { listDatabases, mutateDatabase, createDatabase, backupDatabase } from '../fork/manage'
import { StopProcessListFetch } from '../../../src/shared/StopProcessList'
import { InstanceStopAdapter } from '../fork/service'
import { engineFromInstalled } from '../render/engine'
import { runCommand } from '../fork/command'
import type { ClusterMode, CreateRequest } from '../shared'

const bin = process.env.MARIADB_CLUSTER_TEST_BIN
test(
  'native: isolated instances, real GTID replication and full-stop recovery',
  { skip: !bin, timeout: 300_000 },
  async () => {
    const platform = process.platform === 'win32' ? 'Windows' : 'macOS'
    const versionOutput = await runCommand(bin!, ['--no-defaults', '--version'])
    const version = /Ver (\d+\.\d+\.\d+)-MariaDB/.exec(versionOutput)?.[1]
    assert.ok(version, versionOutput)
    console.log('native MariaDB version', version)
    const root = await mkdtemp(join(tmpdir(), 'mdbc-native space-'))
    const engineRoot = join(root, 'MariaDB Engine')
    // Windows directory junctions do not require the symlink privilege.
    await symlink(dirname(dirname(bin!)), engineRoot, platform === 'Windows' ? 'junction' : 'dir')
    console.log('native data root', root)
    ;(globalThis as any).Server = {
      MariaDBDir: root,
      BaseDir: root,
      AppDir: root,
      BrewCellar: '/nonexistent',
      Static: join(process.cwd(), 'dist/electron')
    }
    const catalog = new InstanceCatalog(join(root, 'managed'), platform)
    const runtime = new MariadbInstanceRuntime(catalog, {
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
        engine: engineFromInstalled({
          version,
          path: engineRoot,
          bin: join(
            engineRoot,
            'bin',
            platform === 'Windows' ? 'mariadbd.exe' : 'mariadbd-safe'
          ),
          source: 'Static'
        }),
        port: base + n,
        socket:
          platform === 'Windows'
            ? `flyenv_native_${group}_${n}`
            : `/tmp/flyenv-native-${group}_${n}.sock`,
        dataDir: join(root, 'data', `${group}_${n}`),
        serverId: base + n
      }))
      return {
        cluster: {
          id: group,
          name: group,
          mode,
          memberIds: instances.map((i) => i.id)
        },
        instances,
        credentials: Object.fromEntries(
          instances.map((i) => [i.id, { user: 'root', password: 'Mdbc-native-"x\\a$`19' }])
        )
      }
    }
    try {
      for (const [mode, count] of [
        ['standalone', 1],
        ['replication', 2]
      ] as [ClusterMode, number][]) {
        const request = make(mode, count)
        await catalog.prepare(request)
        for (const spec of request.instances) {
          created.push(spec.id)
          await initializeInstance(catalog, spec.id, () => {})
          await runtime.start(spec.id, request.credentials[spec.id])
          assert.equal((await runtime.discover(spec.id)).state, 'running')
        }
        const replication = new ReplicationService(catalog)
        if (mode === 'replication') {
          const result = await replication.configure(request.cluster, request.credentials, () => {})
          assert.equal(result.status, 'completed', JSON.stringify(result))
        }
        const primary = request.instances[0].id
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
            /read.only/i
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
        if (mode === 'replication') {
          for (const id of [...request.cluster.memberIds].reverse()) await runtime.stop(id)
          for (const id of request.cluster.memberIds) await runtime.start(id, undefined)
          await withInstanceConnection(catalog, primary, request.credentials[primary], (s) =>
            s.query('CREATE DATABASE restart_probe')
          )
          const replicaId = request.cluster.memberIds[1]
          const resumed = Date.now() + 15000
          let received = false
          while (!received && Date.now() < resumed) {
            received = await withInstanceConnection(
              catalog,
              replicaId,
              request.credentials[replicaId],
              async (s) => {
                const rows = await s.query('SELECT @@read_only AS ro')
                assert.equal(Number(rows[0].ro), 1)
                return (await s.query("SHOW DATABASES LIKE 'restart_probe'")).length === 1
              }
            )
            if (!received) await new Promise((r) => setTimeout(r, 200))
          }
          assert.equal(
            received,
            true,
            'persisted replication resumes after credential-free process start'
          )
          for (const id of [...request.cluster.memberIds].reverse()) await runtime.stop(id)
          request.instances[0].port += 200
          await catalog.update(request)
          for (const id of request.cluster.memberIds)
            await runtime.start(id, request.credentials[id])
          assert.equal(
            (await replication.configure(request.cluster, request.credentials, () => {})).status,
            'completed'
          )
          await withInstanceConnection(catalog, primary, request.credentials[primary], (s) =>
            s.query('INSERT INTO acceptance.probe VALUES (2)')
          )
          const secondary = request.cluster.memberIds[1],
            deadline = Date.now() + 15000
          let copied = false
          while (!copied && Date.now() < deadline) {
            copied = await withInstanceConnection(
              catalog,
              secondary,
              request.credentials[secondary],
              async (s) => (await s.query('SELECT * FROM acceptance.probe')).length === 2
            )
            if (!copied) await new Promise((r) => setTimeout(r, 200))
          }
          assert.equal(copied, true, 'replica follows the verified source after its port changes')
        }
        if (mode === 'standalone') {
          for (const credential of [undefined, { user: 'root', password: 'deliberately-wrong' }]) {
            await runtime.stop(primary)
            await runtime.start(primary, credential)
            assert.equal((await runtime.discover(primary)).state, 'running')
            // SQL here verifies preserved test data/password separately from start's process result.
            await withInstanceConnection(catalog, primary, request.credentials[primary], (s) =>
              s.query('SELECT * FROM acceptance.probe')
            )
          }
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
