import { statSync } from 'node:fs'
import { symlink } from 'node:fs/promises'
import { basename, dirname, join } from 'path'
import { existsSync, mkdirp, readdir, realpathSync, removeByRoot } from '../Fn'

const pythonBinReg = /^python(?:\d+(?:\.\d+)?)?$/

const isPython2 = (bin: string, version?: string | null) => {
  const name = basename(bin).toLowerCase()
  return name.startsWith('python2') || !!version?.trim().startsWith('2.')
}

const findPythonSiblingNames = async (bin: string) => {
  const names = new Set<string>()
  const binDir = dirname(bin)
  let files: string[] = []
  try {
    files = await readdir(binDir)
  } catch {
    return names
  }
  for (const file of files) {
    if (!pythonBinReg.test(file)) {
      continue
    }
    const filepath = join(binDir, file)
    try {
      if (realpathSync(filepath) === bin) {
        names.add(file)
      }
    } catch {}
  }
  return names
}

export const createPythonBinShims = async (
  shimBinDir: string,
  pythonBin: string,
  version?: string | null
) => {
  if (!existsSync(pythonBin)) {
    throw new Error(`Python executable does not exist: ${pythonBin}`)
  }
  const bin = realpathSync(pythonBin)
  if (!statSync(bin).isFile()) {
    throw new Error(`Python executable is not a file: ${pythonBin}`)
  }

  await removeByRoot(shimBinDir)
  await mkdirp(shimBinDir)

  const names = await findPythonSiblingNames(bin)
  const selectedName = basename(bin)
  if (pythonBinReg.test(selectedName)) {
    names.add(selectedName)
  }
  names.add('python')
  if (!isPython2(bin, version)) {
    names.add('python3')
  }

  for (const name of names) {
    await symlink(bin, join(shimBinDir, name))
  }
}
