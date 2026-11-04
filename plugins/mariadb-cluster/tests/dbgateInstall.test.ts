import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { dbGatePaths } from '../../../src/fork/module/DbGate'
const api = await import('../fork/dbgateInstall').catch(() => ({}) as any)

async function fixture(body: string, run: (node: string, paths: any) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'mdbc-dbgate-npm space-'))
  const node = join(root, 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  const npm = join(dirname(node), 'node_modules/npm/bin/npm-cli.js')
  const paths = dbGatePaths(root, false)
  await mkdir(dirname(npm), { recursive: true })
  // Use a real Node subprocess and fake npm program, not an accepting spawn mock.
  await writeFile(npm, body)
  try {
    await run(process.execPath, { ...paths, fixtureNode: node, npm })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('plugin installer pins published dumpers and forces local real installation in the global directory while preserving existing files', async () => {
  await fixture(
    `const fs=require('node:fs'),path=require('node:path');fs.writeFileSync(path.join(process.cwd(),'args.json'),JSON.stringify(process.argv.slice(2)));fs.mkdirSync('node_modules/dbgate-serve/bin',{recursive:true});fs.writeFileSync('node_modules/dbgate-serve/bin/dbgate-serve.js','entry');`,
    async (node, paths) => {
      await mkdir(paths.root, { recursive: true })
      await writeFile(
        join(paths.root, 'package.json'),
        JSON.stringify({
          name: 'global-panel',
          dependencies: { custom: '1' },
          overrides: { custom: '2' }
        })
      )
      await writeFile(paths.credentials, 'keep')
      await mkdir(paths.workspace, { recursive: true })
      await writeFile(join(paths.workspace, 'existing.json'), 'saved connection')
      await api.installDbGate(node, paths, { npmCli: paths.npm })
      const manifest = JSON.parse(await readFile(join(paths.root, 'package.json'), 'utf8'))
      assert.equal(manifest.overrides['dbgate-mysql-dumper'], '0.1.3')
      assert.equal(manifest.overrides['dbgate-pg-dumper'], '1.0.0')
      assert.equal(manifest.overrides.custom, '2')
      assert.equal(manifest.dependencies.custom, '1')
      assert.equal(await readFile(paths.credentials, 'utf8'), 'keep')
      assert.equal(
        await readFile(join(paths.workspace, 'existing.json'), 'utf8'),
        'saved connection'
      )
      const args = JSON.parse(await readFile(join(paths.root, 'args.json'), 'utf8'))
      assert.equal(args[args.indexOf('--prefix') + 1], await realpath(paths.root))
      for (const option of ['--global=false', '--dry-run=false', '--package-lock-only=false'])
        assert.ok(args.includes(option))
    }
  )
})
test('nonzero and signalled npm close reject with diagnostics; missing entry retains successful npm output', async () => {
  for (const [body, pattern] of [
    [
      "console.error('npm ETARGET published-version-missing');process.exitCode=7",
      /code=7[\s\S]*ETARGET/
    ],
    [
      "console.error('native install terminated');process.kill(process.pid,'SIGTERM')",
      // Windows cannot deliver POSIX signals; the same termination surfaces as a nonzero exit.
      process.platform === 'win32'
        ? /code=1[\s\S]*native install terminated/
        : /signal=SIGTERM[\s\S]*native install terminated/
    ],
    [
      "console.log('npm ran without producing files')",
      /entry script[\s\S]*npm ran without producing files/
    ]
  ] as const)
    await fixture(body, async (node, paths) => {
      await assert.rejects(api.installDbGate(node, paths, { npmCli: paths.npm }), pattern)
    })
})
