import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { buildPlugin } from '../../scripts/plugin-builder'

for (const name of ['mysql-cluster', 'mariadb-cluster']) {
  test(`${name} ships its layout utilities in the production renderer stylesheet`, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), `${name}-styles-`))
    try {
      await buildPlugin(name, { outputRoot: tempRoot, minify: true })
      // PluginManager loads this file beside the installed renderer entry.
      const css = postcss.parse(await readFile(path.join(tempRoot, 'render/style.css'), 'utf8'))
      for (const [selector, property, expected] of [
        ['.gap-x-3', 'column-gap', 0.75],
        ['.gap-y-2', 'row-gap', 0.5]
      ] as const) {
        const values: string[] = []
        css.walkRules(selector, (rule) => {
          rule.walkDecls(property, (declaration) => {
            values.push(declaration.value)
          })
        })
        assert.ok(
          values.some((value) => value.endsWith('rem') && parseFloat(value) === expected),
          `${selector} must ship ${property}: ${expected}rem; found ${JSON.stringify(values)}`
        )
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
}
