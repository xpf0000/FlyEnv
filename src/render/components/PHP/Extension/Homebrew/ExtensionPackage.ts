import type { BrewPackageResult } from '@fork/module/Brew/UpgradeTypes'
import { join, basename } from '@/util/path-browserify'

type Files = {
  realpath: (path: string) => Promise<string>
  readdir: (path: string, recursive?: boolean) => Promise<string[]>
  mkdirp: (path: string) => Promise<unknown>
  copyFile: (source: string, destination: string) => Promise<unknown>
}
/** Required manual extension postprocessing, called and awaited by the package controller. */
export async function copyHomebrewExtension(
  result: BrewPackageResult,
  formula: string,
  extensionDir: string,
  files: Files
) {
  if (!result.identity || !extensionDir) throw new Error('Cannot identify Homebrew extension paths')
  const rack = formula.split('/').at(-1)!
  const source = await files.realpath(join(result.identity.prefix, 'opt', rack))
  if (!source.startsWith(join(result.identity.cellar, rack) + '/'))
    throw new Error('Homebrew extension keg is outside the confirmed Cellar')
  const so = (await files.readdir(source, true)).filter((file) => file.endsWith('.so')).pop()
  if (!so) throw new Error('Homebrew finished, but no extension library was found')
  await files.mkdirp(extensionDir)
  await files.copyFile(so, join(extensionDir, basename(so)))
}
