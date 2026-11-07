import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrewPackageRunner } from '../src/fork/module/Brew/BrewPackageRunner'
import type { BrewFormulaSnapshot } from '../src/fork/module/Brew/UpgradeTypes'
const root = await mkdtemp(join(tmpdir(), 'brew runner '))
try {
  const bin = join(root, 'fake brew')
  await writeFile(
    bin,
    `#!/usr/bin/env node\nconst f=process.argv.at(-1);console.log(JSON.stringify(process.argv.slice(2)));console.log(process.env.HOMEBREW_NO_AUTO_UPDATE);if(f.includes('slow')){setInterval(()=>console.log('working'),20);process.on('SIGTERM',()=>setTimeout(()=>process.exit(3),100))}else if(f.includes('fail')){console.error('failure');process.exitCode=7}else if(f.includes('large')){console.log('x'.repeat(200000))}`
  )
  await chmod(bin, 0o755)
  const runner = new BrewPackageRunner()
  const snapshot = (formula: string) =>
    ({
      identity: { bin, prefix: root, cellar: join(root, 'Cellar'), arch: 'arm64' },
      formula
    }) as BrewFormulaSnapshot
  let chunks = 0
  const ok = await runner.runPackage('upgrade', snapshot('homebrew/core/php'), 'ok', () => {
    chunks++
  })
  assert.equal(ok.outcome, 'succeeded')
  assert.match(ok.logs, /\["upgrade","--formula","homebrew\/core\/php"\]/)
  assert(chunks > 0)
  assert.equal(
    (await runner.runPackage('upgrade', snapshot('homebrew/core/php-fail'), 'fail')).code,
    7
  )
  const large = await runner.runPackage('install', snapshot('homebrew/core/php-large'), 'large')
  assert(large.logs.length <= 65536)
  await assert.rejects(
    runner.runPackage('upgrade', snapshot('php;touch /tmp/SHOULD_NOT_EXIST'), 'bad')
  )
  const slow = runner.runPackage('uninstall', snapshot('homebrew/core/php-slow'), 'slow')
  await new Promise((r) => setTimeout(r, 180))
  assert.equal(runner.activeId, 'slow')
  await assert.rejects(runner.runPackage('upgrade', snapshot('php'), 'duplicate'), /busy/)
  const started = Date.now()
  runner.cancel('slow')
  assert.equal(runner.activeId, 'slow')
  assert.equal((await slow).outcome, 'failed')
  assert(Date.now() - started >= 90)
  assert.equal(runner.activeId, undefined)
  console.log(
    'PASS runner: real executable, exact argv, bounded streams, failure, injection rejection, cancel waits close, no duplicate'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
