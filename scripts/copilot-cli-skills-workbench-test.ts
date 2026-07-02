import assert from 'node:assert/strict'
import { getCopilotCliSkillDir, getCopilotCliSkillsRoot } from '../src/shared/copilotCliSkills'

assert.equal(
  getCopilotCliSkillDir('/Users/dev/.copilot/skills/reviewer/SKILL.md'),
  '/Users/dev/.copilot/skills/reviewer'
)

assert.equal(
  getCopilotCliSkillDir('C:\\Users\\dev\\.copilot\\skills\\reviewer\\SKILL.md'),
  'C:\\Users\\dev\\.copilot\\skills\\reviewer'
)

assert.equal(
  getCopilotCliSkillsRoot(
    [{ name: 'reviewer', description: '', path: '/Users/dev/.copilot/skills/reviewer/SKILL.md' }],
    '/Users/dev'
  ),
  '/Users/dev/.copilot/skills'
)

assert.equal(getCopilotCliSkillsRoot([], '/Users/dev'), '/Users/dev/.copilot')

console.log('copilot-cli-skills-workbench-test: ok')
