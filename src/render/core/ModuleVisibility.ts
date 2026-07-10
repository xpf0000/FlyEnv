import type { AllAppModule } from './type'

export type ModuleVisibilityGuard = (visible: boolean) => Promise<boolean>

const guards = new Map<AllAppModule, ModuleVisibilityGuard>()

export function registerModuleVisibilityGuard(
  typeFlag: AllAppModule,
  guard: ModuleVisibilityGuard
) {
  guards.set(typeFlag, guard)
  return () => {
    if (guards.get(typeFlag) === guard) guards.delete(typeFlag)
  }
}

export async function canSetModuleVisibility(typeFlag: AllAppModule, visible: boolean) {
  return (await guards.get(typeFlag)?.(visible)) ?? true
}
