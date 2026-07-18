import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BuiltInLocaleCatalog,
  FALLBACK_LOCALE,
  type LocaleCatalog
} from '../src/lang/catalog'

export interface BuildLanguageAssetsOptions {
  sourceRoot: string
  outputRoot: string
  catalog?: LocaleCatalog
}

const readJsonObject = async (file: string): Promise<Record<string, unknown>> => {
  let value: unknown
  try {
    value = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid locale JSON: ${file}: ${String(error)}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Locale namespace must be an object: ${file}`)
  }
  return value as Record<string, unknown>
}

export const buildLanguageAssets = async ({
  sourceRoot,
  outputRoot,
  catalog = BuiltInLocaleCatalog
}: BuildLanguageAssetsOptions) => {
  if (!catalog[FALLBACK_LOCALE]) {
    throw new Error('English fallback locale is required')
  }

  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  const locales = Object.keys(catalog).sort()
  const manifestLocales: Record<string, { file: string; label: string }> = {}

  for (const locale of locales) {
    const descriptor = catalog[locale]
    const directory = join(sourceRoot, descriptor.sourceDir)
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name.endsWith('.json'))
      .map((item) => item.name)
      .sort()

    const messages: Record<string, unknown> = {}
    for (const name of files) {
      const namespace = name.slice(0, -'.json'.length)
      if (namespace === 'index') continue
      if (Object.hasOwn(messages, namespace)) {
        throw new Error(`Duplicate locale namespace: ${locale}/${namespace}`)
      }
      messages[namespace] = await readJsonObject(join(directory, name))
    }

    const file = `${locale}.json`
    await writeFile(
      join(outputRoot, file),
      JSON.stringify({ schemaVersion: 1, locale, messages }),
      'utf8'
    )
    manifestLocales[locale] = { file, label: descriptor.label }
  }

  await writeFile(
    join(outputRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        fallbackLocale: FALLBACK_LOCALE,
        locales: manifestLocales
      },
      null,
      2
    ),
    'utf8'
  )

  return { locales }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && currentFile === fileURLToPath(pathToFileURL(process.argv[1]))) {
  const repositoryRoot = join(dirname(currentFile), '..')
  await buildLanguageAssets({
    sourceRoot: join(repositoryRoot, 'src/lang'),
    outputRoot: join(repositoryRoot, 'dist/electron/static/lang')
  })
}
