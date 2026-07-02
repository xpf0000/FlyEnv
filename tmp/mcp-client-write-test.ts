import ClaudeCode from '../src/fork/module/ClaudeCode/index.ts'
import Codex from '../src/fork/module/Codex/index.ts'
import OpenCode from '../src/fork/module/OpenCode/index.ts'

const url = 'http://127.0.0.1:7682'
const token = 'a0ceac704e86426d918c0f8784687afe'

async function test() {
  console.log('ClaudeCode addMcp...')
  try {
    await ClaudeCode.addMcp('flyenv', 'http', url, token).on(() => {})
    console.log('ClaudeCode OK')
  } catch (e: any) {
    console.log('ClaudeCode FAIL:', e?.message || e)
  }

  console.log('Codex addMcp...')
  try {
    await Codex.addMcp('flyenv', 'http', url, token).on(() => {})
    console.log('Codex OK')
  } catch (e: any) {
    console.log('Codex FAIL:', e?.message || e)
  }

  console.log('OpenCode addMcp...')
  try {
    await OpenCode.addMcp('flyenv', 'remote', url, token).on(() => {})
    console.log('OpenCode OK')
  } catch (e: any) {
    console.log('OpenCode FAIL:', e?.message || e)
  }
}

test().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})
