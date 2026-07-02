export interface AntigravitySkillLike {
  name: string
  path: string
  builtin: boolean
}

export function getAntigravitySkillDir(skillPath: string): string {
  const normalized = skillPath.replace(/[\\/]+$/, '')
  const slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : normalized
}

export function getAntigravitySkillTitle(skill: AntigravitySkillLike): string {
  return skill.builtin ? `${skill.name} (built-in)` : skill.name
}

export function canEditAntigravitySkill(skill: AntigravitySkillLike): boolean {
  return !skill.builtin
}
