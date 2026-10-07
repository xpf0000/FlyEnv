import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dashboardsPaths } from '../plugins/opensearch/fork/OpenSearch/dashboards'

// Exercise the real native launcher across worker exit, without a large download.
const root = await mkdtemp(join(tmpdir(), 'flyenv-dashboards-process-'))
const paths = {
  ...dashboardsPaths(root, {
    version: '3.9.0',
    path: join(root, 'backend'),
    bin: join(root, 'backend', 'bin')
  } as any),
  install: join(root, 'install')
}
let panelPid = 0
const cleanup = async () => {
  // This PID comes exclusively from the fixture launcher and remains test-owned.
  if (panelPid) {
    try {
      process.kill(panelPid)
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          process.kill(panelPid, 0)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') break
          throw error
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}
try {
  await mkdir(join(paths.install, 'src', 'cli'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
  await writeFile(join(paths.install, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  const syncProbe = join(root, 'sync-probe.cjs')
  await writeFile(syncProbe, 'process.stdout.write("sync probe");')
  const preload = join(root, 'check-hidden.cjs')
  await writeFile(
    preload,
    `const cp = require('node:child_process');
const original = cp.execSync;
cp.execSync = function(command, options) {
  if (process.platform === 'win32' && options?.windowsHide !== true)
    throw new Error('Dashboards synchronous commands must hide their console windows');
  return original.call(this, command, options);
};`
  )
  const syncCommand = `"${process.execPath}" "${syncProbe}"`
  await writeFile(
    join(paths.install, 'src', 'cli', 'dist.js'),
    `const assert = require('node:assert/strict');
const cp = require('node:child_process');
const command = ${JSON.stringify(syncCommand)};
assert.equal(cp.execSync(command, { encoding: 'utf8', windowsHide: false, timeout: 5000 }), 'sync probe');
assert.equal(cp.execSync(command).toString(), 'sync probe');
assert.throws(() => cp.execSync(command + ' --unused', { timeout: 1 }), /timed out|ETIMEDOUT/);
console.log('started'); setInterval(() => console.log('tick'), 100);`
  )
  const sourceUrl = pathToFileURL(resolve('plugins/opensearch/fork/OpenSearch/dashboards.ts')).href
  const worker = join(root, 'worker.mjs')
  await writeFile(
    worker,
    `import { OpenSearchDashboardsRuntime } from ${JSON.stringify(sourceUrl)};
const runtime = new OpenSearchDashboardsRuntime();
const paths = ${JSON.stringify(paths)};
process.env.NODE_OPTIONS = '--require ' + ${JSON.stringify(JSON.stringify(preload))};
const pid = await runtime.deps.start(process.execPath, paths.entry, paths.config, paths, 5601);
console.log('PANEL_PID=' + pid);
process.exit(0);
`
  )
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', worker], {
        cwd: resolve('.'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      child.once('error', reject)
      child.once('close', (code) => resolveResult({ code, stdout, stderr }))
    }
  )
  panelPid = Number(result.stdout.match(/PANEL_PID=(\d+)/)?.[1])
  assert.equal(result.code, 0, result.stderr)
  assert.ok(Number.isSafeInteger(panelPid) && panelPid > 0, result.stdout)
  const before = await readFile(paths.output, 'utf8').catch(() => '')
  let after = before
  const logDeadline = Date.now() + 5000
  while ((after.length <= before.length || !/tick/.test(after)) && Date.now() < logDeadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    after = await readFile(paths.output, 'utf8')
  }
  assert.ok(after.length > before.length, 'the panel must keep logging after its worker exits')
  assert.match(after, /tick/, 'the real detached child must remain alive')
  console.log('OpenSearch Dashboards detached process lifetime test passed')
} finally {
  await cleanup()
}
