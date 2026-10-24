import axios from 'axios'
import compressing from 'compressing'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { PhpExtensionProfile } from './WindowsExtensions'
import { extensionHttpGet } from './ExtensionHttp'
import { extensionIsLoaded, updateExtensionIni } from './ExtensionConfig'
import { replaceIniIfUnchanged } from './IniMutation'

const repository = 'https://downloads.php.net/~windows/pecl/releases/'
const links = (html: string) => [...html.matchAll(/href="([^"?#]+)"/gi)].map((match) => match[1])

export function compatiblePeclArchive(name: string, profile: PhpExtensionProfile): boolean {
  const match = name.match(
    /^php_([a-z0-9_]+)-(\d+\.\d+\.\d+)-(\d+\.\d+)-(nts|ts)-(vc\d+|vs\d+)-(x64|x86|x86_64)\.zip$/i
  )
  if (!match) return false
  const build = profile.build.toLowerCase().split(',')
  const architecture = profile.architecture.toLowerCase().replace('x86_64', 'x64')
  return (
    match[3] === profile.version.split('.').slice(0, 2).join('.') &&
    match[4].toLowerCase() === build[1] &&
    match[5].toLowerCase() === build[2] &&
    match[6].toLowerCase().replace('x86_64', 'x64') === architecture
  )
}

export async function findPeclArchive(
  extension: string,
  profile: PhpExtensionProfile
): Promise<string | undefined> {
  if (!/^[a-z][a-z0-9_]*$/.test(extension)) return undefined
  let html: string
  try {
    html = (await extensionHttpGet(repository + extension + '/', { timeout: 30000 })).data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return undefined
    throw error
  }
  const versions = links(html)
    .filter((link) => /^\d+\.\d+\.\d+\/$/.test(link))
    .sort((a, b) => {
      const left = a.slice(0, -1).split('.').map(Number),
        right = b.slice(0, -1).split('.').map(Number)
      for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return right[i] - left[i]
      return 0
    })
  for (const version of versions) {
    const listing = await extensionHttpGet(repository + extension + '/' + version, {
      timeout: 30000
    })
    const archive = links(listing.data).find(
      (file) => file.startsWith(`php_${extension}-`) && compatiblePeclArchive(file, profile)
    )
    if (archive) return repository + extension + '/' + version + archive
  }
  return undefined
}

// Extract only flat, named DLLs into memory. Archive names never become paths.
export function peclDlls(zip: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((done, reject) => {
    const dlls = new Map<string, Buffer>()
    let total = 0
    const archive = new compressing.zip.UncompressStream({ source: zip })
    archive.on('error', reject).on('finish', () => done(dlls))
    archive.on('entry', (header, stream, next) => {
      const name = header.name
      if (header.type !== 'file' || !/^[a-z0-9_.-]+\.dll$/i.test(name) || basename(name) !== name) {
        stream.on('end', next).on('error', reject).resume()
        return
      }
      if (dlls.has(name.toLowerCase())) {
        reject(new Error('Duplicate DLL in extension archive'))
        stream.resume()
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > 128000000) {
          stream.destroy()
          reject(new Error('Extension archive is too large'))
          return
        }
        chunks.push(chunk)
      })
      stream.on('error', reject).on('end', () => {
        const data = Buffer.concat(chunks)
        if (data.subarray(0, 2).toString() !== 'MZ') {
          reject(new Error('Invalid Windows DLL in extension archive'))
          return
        }
        dlls.set(name.toLowerCase(), data)
        next()
      })
    })
  })
}

export async function installPeclArchive(options: {
  url: string
  extension: string
  zend: boolean
  profile: PhpExtensionProfile
  directory: string
  progress: (text: string) => void
  verify: () => Promise<PhpExtensionProfile>
}): Promise<{ profile: PhpExtensionProfile; backup: string }> {
  const { url, extension, profile, directory, progress } = options
  if (!url.startsWith(repository) || !compatiblePeclArchive(basename(url), profile)) {
    throw new Error('The Windows extension archive does not match the selected PHP build')
  }
  progress(`Downloading ${url}\n`)
  const response = await extensionHttpGet(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 64000000
  })
  const dlls = await peclDlls(Buffer.from(response.data))
  const moduleName = `php_${extension}.dll`
  if (!dlls.has(moduleName)) throw new Error(`The archive does not contain ${moduleName}`)
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
  const writes: { path: string; data: Buffer; original?: Buffer }[] = []
  for (const [name, data] of dlls) {
    const path = join(name === moduleName ? profile.extensionDir : dirname(profile.bin), name)
    const original = existsSync(path) ? await readFile(path) : undefined
    // Shared runtime DLLs must not silently replace PHP's own dependencies.
    if (name !== moduleName && original) {
      if (hash(original) !== hash(data)) throw new Error(`Conflicting runtime dependency: ${name}`)
      continue
    }
    writes.push({ path, data, original })
  }
  const ini = await readFile(profile.ini)
  await mkdir(directory, { recursive: true })
  const backup = join(directory, 'php.ini.before')
  await copyFile(profile.ini, backup)
  const applied: typeof writes = []
  let iniChanged = false
  let installedIni = ini
  try {
    for (const item of writes) {
      await mkdir(dirname(item.path), { recursive: true })
      if (item.original)
        await writeFile(join(directory, basename(item.path) + '.before'), item.original)
      // Include a potentially partial write in rollback ownership.
      applied.push(item)
      await writeFile(item.path, item.data)
    }
    if (extension === 'xdebug')
      await mkdir(join(global.Server.PhpDir!, 'xdebug'), { recursive: true })
    installedIni = Buffer.from(
      updateExtensionIni(
        ini.toString('utf8'),
        extension,
        true,
        options.zend,
        join(profile.extensionDir, moduleName),
        join(global.Server.PhpDir!, 'xdebug')
      )
    )
    await replaceIniIfUnchanged(profile.ini, ini, installedIni)
    iniChanged = true
    const updated = await options.verify()
    if (!extensionIsLoaded(updated.loaded, extension, updated.loadWarnings))
      throw new Error(
        'The extension did not load correctly in the selected PHP; check for duplicate directives'
      )
    progress(`Installed ${moduleName} for PHP ${profile.version}.\n`)
    return { profile: updated, backup }
  } catch (error) {
    const failures: string[] = []
    if (iniChanged)
      try {
        await replaceIniIfUnchanged(profile.ini, installedIni, ini)
      } catch {
        failures.push(profile.ini)
      }
    // If another writer changed the installed configuration, keep its DLLs too.
    if (failures.length)
      throw new Error(
        `${String(error)}\nNewer php.ini and installed files were preserved. Backups: ${directory}`
      )
    for (const item of applied.reverse()) {
      try {
        if (item.original) await writeFile(item.path, item.original)
        else await unlink(item.path)
      } catch {
        failures.push(item.path)
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    if (failures.length)
      throw new Error(
        `${message}\nRollback incomplete: ${failures.join(', ')}. Backups: ${directory}`
      )
    throw new Error(`${message}\nOriginal extension files and php.ini were restored.`)
  }
}
