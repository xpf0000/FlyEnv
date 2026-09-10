export const MODULE_ONBOARDING_VERSION = 1 as const

export const initialModuleOnboardingVersion = (persistedUserConfigExists: boolean) =>
  persistedUserConfigExists ? MODULE_ONBOARDING_VERSION : 0
