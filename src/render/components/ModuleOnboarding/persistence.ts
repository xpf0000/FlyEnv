import {
  MODULE_ONBOARDING_VERSION,
  type CompleteModuleOnboardingRequest,
  type ModuleOnboardingConfigTarget
} from '@shared/ModuleOnboarding'
import type { ModuleVisibilityMap } from './presets'

export async function persistModuleOnboarding(
  config: ModuleOnboardingConfigTarget,
  nextVisibility: ModuleVisibilityMap | undefined,
  save: (request: CompleteModuleOnboardingRequest) => Promise<unknown>
): Promise<void> {
  const request: CompleteModuleOnboardingRequest = {
    moduleOnboardingVersion: MODULE_ONBOARDING_VERSION
  }
  if (nextVisibility !== undefined) request.showItem = { ...nextVisibility }

  await save(request)

  if (request.showItem !== undefined) config.setup.common.showItem = request.showItem
  config.moduleOnboardingVersion = MODULE_ONBOARDING_VERSION
}
