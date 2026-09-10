import assert from 'node:assert/strict'
import {
  MODULE_ONBOARDING_VERSION,
  initialModuleOnboardingVersion
} from '../src/shared/ModuleOnboarding'

assert.equal(MODULE_ONBOARDING_VERSION, 1)
assert.equal(initialModuleOnboardingVersion(false), 0)
assert.equal(initialModuleOnboardingVersion(true), 1)
