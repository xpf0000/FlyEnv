export interface CopilotCliSkillLike {
  name: string
  description: string
  path: string
}

export function getCopilotCliSkillDir(skillPath: string): string {
  const normalized = skillPath.replace(/[\\/]+$/, '')
  const slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : normalized
}

export function getCopilotCliSkillsRoot(
  skills: CopilotCliSkillLike[],
  homeDir: string
): string {
  const firstPath = skills.find((item) => item.path?.trim())?.path
  if (!firstPath) {
    return `${homeDir}/.copilot`
  }

  return getCopilotCliSkillDir(getCopilotCliSkillDir(firstPath))
}
