import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const findVueFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return findVueFiles(path)
      return entry.name === 'Index.vue' ? [path] : []
    })
  )
  return nested.flat()
}

const moduleFiles = await findVueFiles('src/render/components')
const moduleEntries: string[] = []
for (const file of moduleFiles) {
  const source = await readFile(file, 'utf8')
  if (/<div class="soft-index-panel main-right-panel">\s*<el-radio-group/.test(source)) {
    moduleEntries.push(file)
  }
}

const sharedStyle = await readFile('src/render/style/index.scss', 'utf8')
const lightTokens = await readFile('src/render/style/theme/light-tokens.scss', 'utf8')
const darkStyle = await readFile('src/render/style/dark.scss', 'utf8')
const segmentedStart = sharedStyle.indexOf('.soft-index-panel {')
const segmentedEnd = sharedStyle.indexOf('.cli-to-html', segmentedStart)
const segmentedStyle = sharedStyle.slice(segmentedStart, segmentedEnd)

assert.ok(moduleEntries.length >= 60, 'the shared style should cover all module entry tabs')
assert.match(segmentedStyle, />\s*\.el-radio-group\s*\{/)
assert.match(segmentedStyle, /border-radius:\s*8px/)
assert.match(segmentedStyle, /padding:\s*4px/)
assert.match(segmentedStyle, /\.el-radio-button__inner\s*\{[\s\S]*?height:\s*28px/)
assert.match(segmentedStyle, /\.el-radio-button\.is-active/)
assert.match(segmentedStyle, /\.el-radio-button:not\(\.is-active\)[\s\S]*?:hover/)
assert.match(segmentedStyle, /:focus-visible/)
assert.match(segmentedStyle, /:disabled/)
assert.match(segmentedStyle, /:active/)
assert.match(segmentedStyle, /color:\s*var\(--el-color-white\)/)
assert.match(lightTokens, /--flyenv-segmented-background:/)
assert.match(lightTokens, /--flyenv-segmented-border:/)
assert.match(darkStyle, /--flyenv-segmented-shadow:\s*none/)
assert.match(sharedStyle, />\.el-radio-group\s*\{\s*margin-left:\s*20px/)
assert.doesNotMatch(sharedStyle, />\.el-radio-group\s*\{\s*padding-left:\s*20px/)

console.log(`module top tabs test passed (${moduleEntries.length} module entry pages)`)
