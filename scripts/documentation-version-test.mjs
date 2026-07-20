import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const agents = readFileSync('AGENTS.md', 'utf8')

const dependencyVersion = (name) => {
  const range = packageJson.devDependencies[name] ?? packageJson.dependencies[name]
  assert.equal(typeof range, 'string', `${name} must be declared in package.json`)
  const version = range.match(/\d+\.\d+\.\d+/)?.[0]
  assert.ok(version, `${name} must use a recognizable semantic version`)
  return version
}

const electronVersion = dependencyVersion('electron')
const viteVersion = dependencyVersion('vite')
const esbuildVersion = dependencyVersion('esbuild')
const viteMajor = viteVersion.split('.')[0]
const [esbuildMajor, esbuildMinor] = esbuildVersion.split('.')

for (const expectedLine of [
  `- **Version**: ${packageJson.version}`,
  `- **Electron Version**: ${electronVersion}`,
  `- **Desktop Framework**: Electron ${electronVersion}`,
  `- **Build Tool**: Vite ${viteMajor}.x + esbuild ${esbuildMajor}.${esbuildMinor}.x`
]) {
  assert.ok(agents.includes(expectedLine), `AGENTS.md is out of sync: ${expectedLine}`)
}

const deepWikiDir = 'docs/deepwiki'
for (const file of readdirSync(deepWikiDir).filter((name) => name.endsWith('.md'))) {
  const source = readFileSync(join(deepWikiDir, file), 'utf8')
  assert.doesNotMatch(
    source,
    /^> \*\*FlyEnv 版本\*\*:/m,
    `${file} must label its historical version as an analysis baseline`
  )
}

console.log('documentation version tests passed')
