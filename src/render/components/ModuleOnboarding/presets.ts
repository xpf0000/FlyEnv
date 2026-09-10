import type { AllAppModule } from '../../core/type'

export type ModuleVisibilityMap = Partial<Record<string, boolean>>

export type ModuleStackPreset = {
  id: string
  label: string
  icon: string
  modules: readonly AllAppModule[]
}

export const MODULE_ONBOARDING_FOUNDATION_FLAGS = [
  'startup-group',
  'hosts',
  'tools'
] as const satisfies readonly AllAppModule[]

export const MODULE_STACK_PRESETS = [
  {
    id: 'php',
    label: 'PHP',
    icon: 'php',
    modules: ['php', 'php-fpm', 'apache', 'nginx', 'node', 'mysql', 'mariadb', 'redis']
  },
  {
    id: 'node',
    label: 'Node.js',
    icon: 'node',
    modules: ['node', 'nginx', 'mysql', 'postgresql', 'mongodb', 'redis']
  },
  {
    id: 'java',
    label: 'Java',
    icon: 'java',
    modules: ['java', 'gradle', 'tomcat', 'nginx', 'mysql', 'postgresql', 'redis']
  },
  {
    id: 'python',
    label: 'Python',
    icon: 'python',
    modules: ['python', 'nginx', 'mysql', 'postgresql', 'redis']
  },
  {
    id: 'go',
    label: 'Go',
    icon: 'go',
    modules: ['golang', 'nginx', 'mysql', 'postgresql', 'redis']
  },
  {
    id: 'dotnet',
    label: '.NET',
    icon: 'dotnet',
    modules: ['dotnet', 'nginx', 'mysql', 'postgresql', 'redis']
  },
  {
    id: 'ruby',
    label: 'Ruby',
    icon: 'ruby',
    modules: ['ruby', 'node', 'nginx', 'mysql', 'postgresql', 'redis']
  },
  {
    id: 'rust',
    label: 'Rust',
    icon: 'rust',
    modules: ['rust', 'nginx', 'mysql', 'postgresql', 'redis']
  }
] as const satisfies readonly ModuleStackPreset[]

export type ModuleStackPresetId = (typeof MODULE_STACK_PRESETS)[number]['id']

export const collectPresetFlags = (selected: readonly ModuleStackPresetId[]): Set<AllAppModule> => {
  const enabled = new Set<AllAppModule>(MODULE_ONBOARDING_FOUNDATION_FLAGS)

  for (const id of selected) {
    const preset = MODULE_STACK_PRESETS.find((item) => item.id === id)
    for (const flag of preset?.modules ?? []) enabled.add(flag)
  }

  return enabled
}

export const buildPresetVisibility = (
  current: ModuleVisibilityMap,
  supported: readonly AllAppModule[],
  selected: readonly ModuleStackPresetId[]
): ModuleVisibilityMap => {
  const next = { ...current }
  const enabled = collectPresetFlags(selected)

  for (const flag of supported) next[flag] = enabled.has(flag)

  return next
}

export const buildAllVisible = (
  current: ModuleVisibilityMap,
  supported: readonly AllAppModule[]
): ModuleVisibilityMap => {
  const next = { ...current }

  for (const flag of supported) next[flag] = true

  return next
}
