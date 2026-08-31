import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  brewFormulaInstalledForTap,
  qualifyHomebrewCoreFormula
} from '../src/fork/util/BrewFormula'

assert.equal(qualifyHomebrewCoreFormula('php'), 'homebrew/core/php')
assert.equal(qualifyHomebrewCoreFormula('php@8.4'), 'homebrew/core/php@8.4')
assert.equal(qualifyHomebrewCoreFormula('shivammathur/php/php@8.4'), 'shivammathur/php/php@8.4')

const tempRoot = await mkdtemp(join(tmpdir(), 'flyenv-brew-formula-tap-'))
const cellarDir = join(tempRoot, 'Cellar')
const receiptDir = join(cellarDir, 'php@8.4', '8.4.25')

try {
  await mkdir(receiptDir, { recursive: true })
  await writeFile(
    join(receiptDir, 'INSTALL_RECEIPT.json'),
    JSON.stringify({ source: { tap: 'shivammathur/php' } }),
    'utf8'
  )

  const installed = [{ version: '8.4.25' }]
  assert.equal(
    await brewFormulaInstalledForTap({ name: 'php@8.4', tap: 'homebrew/core', installed }, [
      cellarDir
    ]),
    false
  )
  assert.equal(
    await brewFormulaInstalledForTap({ name: 'php@8.4', tap: 'shivammathur/php', installed }, [
      cellarDir
    ]),
    true
  )
  assert.equal(
    await brewFormulaInstalledForTap({ name: 'php@8.4', tap: 'shivammathur/php', installed: [] }, [
      cellarDir
    ]),
    false
  )

  const olderReceiptDir = join(cellarDir, 'php@8.4', '8.4.24')
  await mkdir(olderReceiptDir, { recursive: true })
  await writeFile(
    join(olderReceiptDir, 'INSTALL_RECEIPT.json'),
    JSON.stringify({ source: { tap: 'homebrew/core' } }),
    'utf8'
  )
  const multipleInstalledVersions = [{ version: '8.4.24' }, { version: '8.4.25' }]
  assert.equal(
    await brewFormulaInstalledForTap(
      {
        name: 'php@8.4',
        tap: 'homebrew/core',
        linked_keg: '8.4.25',
        installed: multipleInstalledVersions
      },
      [cellarDir]
    ),
    false
  )
  assert.equal(
    await brewFormulaInstalledForTap(
      {
        name: 'php@8.4',
        tap: 'shivammathur/php',
        linked_keg: '8.4.25',
        installed: multipleInstalledVersions
      },
      [cellarDir]
    ),
    true
  )

  const optDir = join(tempRoot, 'opt')
  await mkdir(optDir, { recursive: true })
  await symlink(
    receiptDir,
    join(optDir, 'php@8.4'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  assert.equal(
    await brewFormulaInstalledForTap(
      { name: 'php@8.4', tap: 'homebrew/core', installed: multipleInstalledVersions },
      [cellarDir]
    ),
    false
  )
  assert.equal(
    await brewFormulaInstalledForTap(
      { name: 'php@8.4', tap: 'shivammathur/php', installed: multipleInstalledVersions },
      [cellarDir]
    ),
    true
  )

  await writeFile(join(receiptDir, 'INSTALL_RECEIPT.json'), '{invalid json', 'utf8')
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(
      await brewFormulaInstalledForTap({ name: 'php@8.4', tap: 'homebrew/core', installed }, [
        cellarDir
      ]),
      true,
      'invalid legacy receipts preserve Homebrew JSON behavior'
    )
  } finally {
    console.warn = originalWarn
  }

  console.log('brew formula tap installed tests passed')
} finally {
  await rm(tempRoot, { force: true, recursive: true })
}
