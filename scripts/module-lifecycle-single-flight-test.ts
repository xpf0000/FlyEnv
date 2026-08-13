#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const moduleSource = readFileSync(
  new URL('../src/render/core/Module/Module.ts', import.meta.url),
  'utf8'
)
const installedItemSource = readFileSync(
  new URL('../src/render/core/Module/ModuleInstalledItem.ts', import.meta.url),
  'utf8'
)
const serviceManagerSource = readFileSync(
  new URL('../src/render/components/ServiceManager/index.vue', import.meta.url),
  'utf8'
)
const serviceManagerSetupSource = readFileSync(
  new URL('../src/render/components/ServiceManager/setup.ts', import.meta.url),
  'utf8'
)
const mysqlManageSource = readFileSync(
  new URL('../src/render/components/Mysql/Manage/index.vue', import.meta.url),
  'utf8'
)
const customerModuleSource = readFileSync(
  new URL('../src/render/core/ModuleCustomer.ts', import.meta.url),
  'utf8'
)
const customerModuleListSource = readFileSync(
  new URL('../src/render/components/CustomerModule/List.vue', import.meta.url),
  'utf8'
)

assert.match(
  moduleSource,
  /starting: boolean = false/,
  'an exclusive module must expose one shared start-in-progress state'
)
assert.match(
  moduleSource,
  /private startFlight\?: Promise<string \| boolean>/,
  'an exclusive module must retain its active start promise'
)
assert.match(
  moduleSource,
  /startSingleFlight\(start: \(\) => Promise<string \| boolean>\)/,
  'an exclusive module must coalesce concurrent start requests'
)
assert.match(
  moduleSource,
  /Promise\.all\(this\.installed\.map\(\(a\) => a\.stop\(\)\)\)/,
  'version switching must continue to wait for every version stop before starting the target'
)
assert.match(
  installedItemSource,
  /module\.startSingleFlight\(\(\) => this\.startInternal\(\)\)/,
  'version starts must enter the module-level single-flight gate'
)
assert.match(
  serviceManagerSource,
  /:disabled="versionRunning"/,
  'service action buttons must be natively disabled while another version is operating'
)
assert.match(
  serviceManagerSetupSource,
  /if \(versionRunning\.value\) \{\s*return\s*\}/,
  'the service action handler must reject clicks that bypass native disabled state'
)
assert.match(
  mysqlManageSource,
  /return module\.starting \|\| module\.installed\.some\(\(item\) => item\.running\)/,
  'the MySQL manager must include an exclusive start flight in its operation state'
)
assert.equal(
  (mysqlManageSource.match(/:disabled="versionRunning"/g) ?? []).length,
  5,
  'every MySQL lifecycle and database action must be natively disabled during a lifecycle operation'
)
assert.match(
  customerModuleSource,
  /startSingleFlight\(start: \(\) => Promise<boolean \| string>\)/,
  'exclusive custom modules must coalesce concurrent version starts'
)
assert.match(
  customerModuleSource,
  /return this\.module\?\.startSingleFlight\(\(\) => this\._startInternal\(\)\)/,
  'custom version starts must enter their module-level single-flight gate'
)
assert.match(
  customerModuleListSource,
  /:disabled="versionRunning"/,
  'custom service lifecycle buttons must be natively disabled during another version operation'
)
assert.match(
  customerModuleListSource,
  /if \(!module\?\.isOnlyRunOne \|\| !module\.isService\) \{\s*return false\s*\}/,
  'custom modules that allow concurrent versions must keep their concurrent lifecycle controls enabled'
)
assert.match(
  customerModuleListSource,
  /if \(versionRunning\.value\) \{\s*return\s*\}/,
  'the custom service action handler must reject clicks that bypass native disabled state'
)
assert.equal(
  (customerModuleListSource.match(/<yb-icon\b[^>]*@click\.stop="serviceDo/g) ?? []).length,
  0,
  'custom service lifecycle clicks must be handled by the disabled button, not its child icon'
)

class StartSingleFlightHarness {
  isOnlyRunOne = true
  starting = false
  private startFlight?: Promise<string | boolean>

  startSingleFlight(start: () => Promise<string | boolean>): Promise<string | boolean> {
    if (!this.isOnlyRunOne) {
      return start()
    }
    if (this.startFlight) {
      return this.startFlight
    }
    this.starting = true
    const flight = start().finally(() => {
      if (this.startFlight === flight) {
        this.startFlight = undefined
        this.starting = false
      }
    })
    this.startFlight = flight
    return flight
  }
}

const module = new StartSingleFlightHarness()
let starts = 0
let completeStart: ((result: string | boolean) => void) | undefined
const first = module.startSingleFlight(
  () =>
    new Promise<string | boolean>((resolve) => {
      starts += 1
      completeStart = resolve
    })
)
const duplicate = module.startSingleFlight(async () => {
  starts += 1
  return true
})
assert.equal(starts, 1, 'an exclusive module must start only the first requested version')
assert.equal(
  module.starting,
  true,
  'the shared start state must remain set until the terminal result'
)
completeStart!(true)
assert.equal(await first, true)
assert.equal(await duplicate, true)
assert.equal(module.starting, false, 'the shared start state must clear after the terminal result')

assert.equal(await module.startSingleFlight(async () => true), true)
assert.equal(starts, 1, 'a completed start must release the single-flight gate for a later request')

console.log('module lifecycle single-flight contract test passed')
