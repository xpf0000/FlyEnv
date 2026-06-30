import assert from 'node:assert/strict'
import {
  canEditAntigravitySkill,
  getAntigravitySkillDir,
  getAntigravitySkillTitle
} from '../src/shared/antigravitySkills'

assert.equal(
  getAntigravitySkillDir('/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md'),
  '/Users/x/.gemini/antigravity-cli/skills/reviewer'
)

assert.equal(
  getAntigravitySkillDir('C:\\Users\\x\\.gemini\\antigravity-cli\\builtin\\skills\\pair\\SKILL.md'),
  'C:\\Users\\x\\.gemini\\antigravity-cli\\builtin\\skills\\pair'
)

assert.equal(
  getAntigravitySkillTitle({
    name: 'reviewer',
    path: '/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md',
    builtin: false
  }),
  'reviewer'
)

assert.equal(
  getAntigravitySkillTitle({
    name: 'pair',
    path: '/Users/x/.gemini/antigravity-cli/builtin/skills/pair/SKILL.md',
    builtin: true
  }),
  'pair (built-in)'
)

assert.equal(
  canEditAntigravitySkill({
    name: 'reviewer',
    path: '/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md',
    builtin: false
  }),
  true
)

assert.equal(
  canEditAntigravitySkill({
    name: 'pair',
    path: '/Users/x/.gemini/antigravity-cli/builtin/skills/pair/SKILL.md',
    builtin: true
  }),
  false
)

console.log('antigravity-skills-workbench-test: ok')
