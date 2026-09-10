import assert from 'node:assert/strict'
import {
  MODULE_ONBOARDING_VERSION,
  initialModuleOnboardingVersion
} from '../src/shared/ModuleOnboarding'
import type { AllAppModule } from '../src/render/core/type'
import {
  buildAllVisible,
  buildPresetVisibility,
  collectPresetFlags,
  MODULE_ONBOARDING_FOUNDATION_FLAGS,
  MODULE_STACK_PRESETS
} from '../src/render/components/ModuleOnboarding/presets'

assert.equal(MODULE_ONBOARDING_VERSION, 1)
assert.equal(initialModuleOnboardingVersion(false), 0)
assert.equal(initialModuleOnboardingVersion(true), 1)

assert.deepEqual(MODULE_ONBOARDING_FOUNDATION_FLAGS, ['startup-group', 'hosts', 'tools'])
assert.equal(MODULE_STACK_PRESETS[0]?.id, 'php')
assert.equal(MODULE_STACK_PRESETS.length, 8)

const phpPythonFlags = collectPresetFlags(['php', 'python'])
for (const flag of [
  'php',
  'php-fpm',
  'python',
  'node',
  'mysql',
  'mariadb',
  'postgresql',
  'nginx',
  'redis',
  'startup-group',
  'hosts',
  'tools'
] as const) {
  assert.equal(phpPythonFlags.has(flag), true)
}
assert.equal(phpPythonFlags.size, 13)

const current = { linuxOnly: false, customerX: false }
const supported = ['php', 'python', 'redis'] as AllAppModule[]
assert.deepEqual(buildPresetVisibility(current, supported, []), {
  linuxOnly: false,
  customerX: false,
  php: false,
  python: false,
  redis: false
})

assert.deepEqual(
  buildPresetVisibility(
    { customerX: false },
    ['php', 'startup-group', 'hosts', 'tools'] as AllAppModule[],
    ['php']
  ),
  { customerX: false, php: true, 'startup-group': true, hosts: true, tools: true }
)

assert.deepEqual(
  buildAllVisible({ customerX: false }, ['php', 'python', 'redis'] as AllAppModule[]),
  { customerX: false, php: true, python: true, redis: true }
)
