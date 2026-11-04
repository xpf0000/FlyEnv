import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DbGateRuntime, dbGateEnv, dbGatePaths } from '../../../src/fork/module/DbGate'
import { serviceStartSpawn } from '../../../src/fork/util/ServiceStart'
import { MariadbClusterDbGate } from '../fork/dbgate'
import { dbGateListeningPids } from '../fork/dbgateListeners'

const freshInstall = process.env.MARIADB_CLUSTER_DBGATE_INSTALL_TEST === '1'
const fixtureScript = `const http=require('node:http');const auth='Basic '+Buffer.from(process.env.LOGIN+':'+process.env.PASSWORD).toString('base64');http.createServer((req,res)=>{res.statusCode=req.headers.authorization===auth?200:401;res.end('isolated fixture')}).listen(Number(process.env.PORT));`
for (const installation of freshInstall ? ['real npm'] : ['existing global', 'missing global']) {
  test(
    `native ${installation} DbGate: shared files, same PID, MariaDB stop and MongoDB reopen`,
    {
      skip: !freshInstall && process.env.MARIADB_CLUSTER_DBGATE_NATIVE_TEST !== '1',
      timeout: freshInstall ? 600_000 : 90_000
    },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'mdbc-dbgate-native space-'))
      const previous = (globalThis as any).Server
      ;(globalThis as any).Server = {
        BaseDir: root,
        AppDir: root,
        MariaDBDir: root,
        BrewCellar: '/nonexistent',
        Static: join(process.cwd(), 'dist/electron')
      }
      let running = true
      const panel = new MariadbClusterDbGate(root, {
        listInstances: async () => [{ id: 'a', state: running ? 'running' : 'stopped' }],
        stop: async () => {
          running = false
          return ['101']
        }
      })
      // Actual native endpoint, isolated from the user's manager and server directory.
      const { default: mongodb } = await import('../../../src/fork/module/Mongodb')
      const previousNativeRuntime = (mongodb as any)._dbGateRuntime
      const nativeRuntime = new DbGateRuntime(root, {
        listeningPids: dbGateListeningPids,
        starter: (node, paths, port, credentials, on) =>
          serviceStartSpawn({
            version: { ...node, typeFlag: 'mongodb', version: 'dbgate' },
            pidPath: paths.pid,
            baseDir: paths.root,
            bin: node.bin,
            execArgs: [paths.entry],
            execEnv: dbGateEnv(paths, port, credentials),
            cwd: paths.root,
            outFile: paths.startOut,
            errFile: paths.startError,
            sensitive: true,
            on,
            waitTime: 2000
          })
      })
      ;(mongodb as any)._dbGateRuntime = nativeRuntime
      try {
        const paths = dbGatePaths(root, process.platform === 'win32')
        assert.equal(panel.descriptor().bin, paths.entry)
        assert.equal(panel.descriptor().path, paths.root)
        let nodeBin = process.env.MARIADB_CLUSTER_DBGATE_NODE_BIN || process.execPath
        if (installation === 'existing global') {
          await mkdir(dirname(paths.entry), { recursive: true })
          await writeFile(paths.entry, fixtureScript)
        } else if (installation === 'missing global') {
          // Real subprocess/installer flow with a local npm fixture: no network or user files.
          const fixtureBin = join(root, 'node', 'bin')
          await mkdir(fixtureBin, { recursive: true })
          const linkedNode = join(fixtureBin, process.platform === 'win32' ? 'node.exe' : 'node')
          await symlink(nodeBin, linkedNode)
          nodeBin = linkedNode
          const npm = join(fixtureBin, 'node_modules/npm/bin/npm-cli.js')
          await mkdir(dirname(npm), { recursive: true })
          await writeFile(
            npm,
            `const fs=require('node:fs'),path=require('node:path');fs.appendFileSync('install-count','1');fs.mkdirSync('node_modules/dbgate-serve/bin',{recursive:true});fs.writeFileSync('node_modules/dbgate-serve/bin/dbgate-serve.js',${JSON.stringify(fixtureScript)});`
          )
          assert.equal(existsSync(paths.entry), false)
        }
        await mkdir(paths.workspace, { recursive: true })
        const workspaceFile = join(paths.workspace, 'existing.json')
        await writeFile(workspaceFile, 'saved connection')
        const node = {
          bin: nodeBin,
          path: dirname(nodeBin),
          version: process.version.slice(1)
        } as any
        // Open from MongoDB first when already installed; MariaDB must reuse that process.
        const firstNative =
          installation === 'existing global' ? await mongodb.openDbGate(node) : undefined
        const credentialsBefore = firstNative && (await readFile(paths.credentials, 'utf8'))
        const progress: any[] = []
        const opened = await panel.open(node).on((event) => progress.push(event))
        const pid = opened['APP-Service-Start-PID']
        assert.match(pid, /^[1-9]\d*$/)
        assert.equal(opened['APP-Service-Start-Item'].typeFlag, 'mariadb-cluster')
        assert.equal(opened['APP-Service-Start-Item'].bin, paths.entry)
        if (firstNative) assert.equal(pid, firstNative['APP-Service-Start-PID'])
        assert.equal((await panel.open(node))['APP-Service-Start-PID'], pid)
        assert.equal(new URL(opened.url).hostname, '127.0.0.1')
        assert.equal(
          progress.some(
            (event) => event?.type === 'web-panel-install' && event.service === 'DbGate'
          ),
          installation !== 'existing global'
        )
        assert.equal(existsSync(join(root, 'mariadb-cluster', 'dbgate')), false)
        if (credentialsBefore)
          assert.equal(await readFile(paths.credentials, 'utf8'), credentialsBefore)
        const credentials = await readFile(paths.credentials, 'utf8')
        const stopped = await panel.stopInstance('a', '101')
        assert.ok(stopped.includes(pid))
        assert.equal(running, false)
        assert.equal(existsSync(paths.pid), false)
        await assert.rejects(Promise.resolve(panel.open(node)), /running MariaDB/)
        const reopened = await mongodb.openDbGate(node)
        assert.notEqual(reopened['APP-Service-Start-PID'], pid)
        assert.equal(reopened['APP-Service-Start-Item'].path, paths.root)
        assert.equal(await readFile(paths.credentials, 'utf8'), credentials)
        assert.equal(await readFile(workspaceFile, 'utf8'), 'saved connection')
        if (installation === 'existing global')
          assert.equal(existsSync(join(paths.root, 'package.json')), false)
        if (installation === 'missing global')
          assert.equal(await readFile(join(paths.root, 'install-count'), 'utf8'), '1')
      } finally {
        try {
          await panel.stop()
          await nativeRuntime.stop()
          await rm(root, { recursive: true, force: true })
        } finally {
          ;(mongodb as any)._dbGateRuntime = previousNativeRuntime
          ;(globalThis as any).Server = previous
        }
      }
    }
  )
}
