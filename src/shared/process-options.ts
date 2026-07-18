type ProcessOptions = {
  env?: NodeJS.ProcessEnv
}

export function mergeProcessOptions<
  TDefaults extends ProcessOptions,
  TOverrides extends ProcessOptions
>(defaults: TDefaults, overrides?: TOverrides): TDefaults & TOverrides {
  const result = { ...defaults, ...(overrides ?? {}) } as TDefaults & TOverrides
  if (defaults.env || overrides?.env) {
    result.env = { ...(defaults.env ?? {}), ...(overrides?.env ?? {}) }
  }
  return result
}
