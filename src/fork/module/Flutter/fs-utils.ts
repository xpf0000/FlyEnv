import { basename, join } from 'path'
import { existsSync } from 'fs'
import fs from 'fs-extra'
import YAML from 'yamljs'

export async function _replaceByRegex(
  file: string,
  regex: RegExp,
  replaceWith: string
): Promise<boolean> {
  if (!existsSync(file)) {
    return false
  }
  const content = await fs.readFile(file, 'utf-8')
  const next = content.replace(regex, replaceWith)
  if (next === content) {
    return false
  }
  await fs.writeFile(file, next)
  return true
}

export async function _listFilesRecursive(root: string): Promise<string[]> {
  if (!root || !existsSync(root)) {
    return []
  }

  const files: string[] = []
  const stack: string[] = [root]

  while (stack.length) {
    const current = stack.pop() as string
    let entries: fs.Dirent[] = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }

  return files
}

export async function _syncAndroidEntryPackage(
  projectDir: string,
  androidPackage: string
): Promise<{
  updatedFiles: string[]
  manifestUpdated: boolean
}> {
  const updatedFiles: string[] = []
  let manifestUpdated = false

  const sourceRoots = [
    join(projectDir, 'android', 'app', 'src', 'main', 'kotlin'),
    join(projectDir, 'android', 'app', 'src', 'main', 'java')
  ]

  const candidates: string[] = []
  for (const root of sourceRoots) {
    const files = await _listFilesRecursive(root)
    candidates.push(
      ...files.filter((f) => /(MainActivity|MainApplication)\.(kt|java)$/i.test(basename(f)))
    )
  }

  for (const file of candidates) {
    let source = ''
    try {
      source = await fs.readFile(file, 'utf-8')
    } catch {
      continue
    }

    let next = source
    const hasPackageLine = /^\s*package\s+[a-zA-Z0-9_.]+\s*$/m.test(next)
    if (hasPackageLine) {
      next = next.replace(/^\s*package\s+[a-zA-Z0-9_.]+\s*$/m, `package ${androidPackage}`)
    } else {
      next = `package ${androidPackage}\n\n${next}`
    }

    if (next !== source) {
      await fs.writeFile(file, next)
      updatedFiles.push(file)
    }
  }

  const manifests = [
    join(projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    join(projectDir, 'android', 'app', 'src', 'debug', 'AndroidManifest.xml'),
    join(projectDir, 'android', 'app', 'src', 'profile', 'AndroidManifest.xml')
  ]

  for (const manifest of manifests) {
    if (!existsSync(manifest)) {
      continue
    }
    let xml = ''
    try {
      xml = await fs.readFile(manifest, 'utf-8')
    } catch {
      continue
    }

    const nextXml = xml.replace(
      /(android:name\s*=\s*")[^"]*MainActivity(")/g,
      `$1.${'MainActivity'}$2`
    )

    if (nextXml !== xml) {
      await fs.writeFile(manifest, nextXml)
      manifestUpdated = true
    }
  }

  return { updatedFiles, manifestUpdated }
}

export async function _readPubspec(projectDir: string): Promise<any> {
  const pubspec = join(projectDir, 'pubspec.yaml')
  if (!existsSync(pubspec)) {
    return null
  }
  try {
    const raw = await fs.readFile(pubspec, 'utf-8')
    const parsed = YAML.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
