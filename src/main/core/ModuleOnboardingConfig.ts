import {
  MODULE_ONBOARDING_VERSION,
  type CompleteModuleOnboardingRequest,
  type ModuleOnboardingIPCResult,
  type ModuleOnboardingVisibility
} from '@shared/ModuleOnboarding'

type SetupWithModuleVisibility = {
  common: {
    showItem: ModuleOnboardingVisibility
  }
}

type ModuleOnboardingConfigPatch<TSetup> = {
  moduleOnboardingVersion: number
  setup?: TSetup
}

type ModuleOnboardingConfigManager = {
  completeModuleOnboarding(showItem?: ModuleOnboardingVisibility): void
}

export const completeModuleOnboardingConfig = <TSetup extends SetupWithModuleVisibility>(
  set: (patch: ModuleOnboardingConfigPatch<TSetup>) => void,
  setup: TSetup,
  showItem?: ModuleOnboardingVisibility
): void => {
  const patch: ModuleOnboardingConfigPatch<TSetup> = {
    moduleOnboardingVersion: MODULE_ONBOARDING_VERSION
  }
  if (showItem !== undefined) {
    patch.setup = {
      ...setup,
      common: {
        ...setup.common,
        showItem: { ...showItem }
      }
    }
  }
  set(patch)
}

export const handleCompleteModuleOnboardingRequest = (
  value: unknown,
  configManager?: ModuleOnboardingConfigManager
): ModuleOnboardingIPCResult => {
  try {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('Invalid module onboarding request')
    }

    const request = value as CompleteModuleOnboardingRequest
    if (request.moduleOnboardingVersion !== MODULE_ONBOARDING_VERSION) {
      throw new Error('Unsupported module onboarding version')
    }
    if (
      request.showItem !== undefined &&
      (request.showItem === null ||
        Array.isArray(request.showItem) ||
        typeof request.showItem !== 'object')
    ) {
      throw new Error('Invalid module onboarding visibility')
    }
    if (
      request.showItem !== undefined &&
      Object.values(request.showItem).some((visible) => typeof visible !== 'boolean')
    ) {
      throw new Error('Invalid module onboarding visibility value')
    }

    if (!configManager) throw new Error('Config manager is unavailable')
    configManager.completeModuleOnboarding(request.showItem)
    return { code: 0, data: true }
  } catch (error) {
    return { code: 1, msg: error instanceof Error ? error.message : `${error}` }
  }
}
