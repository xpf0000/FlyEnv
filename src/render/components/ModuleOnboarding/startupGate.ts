import { ref } from 'vue'

type ModuleOnboardingStartupGateOptions = {
  storedVersion: number
  currentVersion: number
  initialize: () => Promise<void>
  onPreparationError?: (error: unknown) => void
}

export const createModuleOnboardingStartupGate = (options: ModuleOnboardingStartupGateOptions) => {
  const onboardingRequired = options.storedVersion < options.currentVersion
  const onboardingResolved = ref(!onboardingRequired)

  const initializeWhenAllowed = () =>
    onboardingResolved.value ? options.initialize() : Promise.resolve()

  const completeOnboarding = async (prepareDestination?: () => Promise<void>) => {
    onboardingResolved.value = true
    try {
      await prepareDestination?.()
    } catch (error) {
      options.onPreparationError?.(error)
    } finally {
      await initializeWhenAllowed()
    }
  }

  return {
    onboardingRequired,
    onboardingResolved,
    initializeWhenAllowed,
    completeOnboarding
  }
}
