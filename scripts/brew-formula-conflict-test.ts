import assert from 'node:assert/strict'

import {
  brewFormulaSourceName,
  findInstalledFormulaConflict
} from '../src/render/components/VersionManager/brew/FormulaConflict'

assert.equal(brewFormulaSourceName('php'), 'Homebrew Core')
assert.equal(brewFormulaSourceName('php@8.4'), 'Homebrew Core')
assert.equal(brewFormulaSourceName('homebrew/core/php@8.4'), 'Homebrew Core')
assert.equal(brewFormulaSourceName('shivammathur/php/php@8.4'), 'shivammathur/php')

const core84 = { name: 'php@8.4', installed: false }
const tap84 = { name: 'shivammathur/php/php@8.4', installed: true }
const core83 = { name: 'php@8.3', installed: true }

assert.equal(findInstalledFormulaConflict(core84, [core84, tap84, core83]), tap84.name)
assert.equal(
  findInstalledFormulaConflict({ name: 'shivammathur/php/php@8.4', installed: false }, [
    { name: 'php@8.4', installed: true }
  ]),
  'php@8.4'
)
assert.equal(findInstalledFormulaConflict(core83, [core83, tap84]), undefined)
assert.equal(
  findInstalledFormulaConflict({ name: 'php@8.3', installed: false }, [tap84]),
  undefined
)
assert.equal(
  findInstalledFormulaConflict({ name: 'shivammathur/php/php', installed: false }, [
    { name: 'php', installed: true }
  ]),
  'php'
)
const onlyLegacySource = { name: 'shivammathur/php/php@7.4', installed: false }
assert.equal(findInstalledFormulaConflict(onlyLegacySource, [onlyLegacySource]), undefined)

console.log('brew formula conflict tests passed')
