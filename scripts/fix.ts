import { resolve } from 'path'
import _fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))

const { existsSync, readFile, writeFile } = _fs
const dnsFix = async () => {
  const file = resolve(__dirname, '../node_modules/dohdec/lib/doh.js')
  if (!existsSync(file)) {
    return
  }
  const search = `const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))`
  let content = await readFile(file, 'utf-8')
  if (!content.includes(search)) {
    return
  }
  const jsonFile = resolve(__dirname, '../node_modules/dohdec/package.json')
  const jsonObj = JSON.parse(await readFile(jsonFile, 'utf-8'))
  content = content.replace(
    search,
    `const pkg = { name: '${jsonObj.name}', version: '${jsonObj.version}' }`
  )
  await writeFile(file, content)
}

export const DoFix = async () => {
  await dnsFix()
}
