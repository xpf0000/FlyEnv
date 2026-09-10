export const MODULE_ONBOARDING_VERSION = 1 as const

export type ModuleOnboardingVisibility = Partial<Record<string, boolean>>

export type CompleteModuleOnboardingRequest = {
  moduleOnboardingVersion: number
  showItem?: ModuleOnboardingVisibility
}

export type ModuleOnboardingIPCResult = { code: 0; data: true } | { code: 1; msg: string }

export type ModuleOnboardingConfigTarget = {
  moduleOnboardingVersion: number
  setup: {
    common: {
      showItem: ModuleOnboardingVisibility
    }
  }
}

export const initialModuleOnboardingVersion = (persistedUserConfigExists: boolean) =>
  persistedUserConfigExists ? MODULE_ONBOARDING_VERSION : 0
