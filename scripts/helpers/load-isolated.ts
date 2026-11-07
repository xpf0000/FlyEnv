import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
export async function loadIsolated(
  entry: string,
  mocks: Record<string, unknown>,
  globals: Record<string, unknown> = {}
) {
  const require = createRequire(import.meta.url)
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [
      {
        name: 'isolate-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, (args) =>
            args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
          )
        }
      }
    ]
  })
  const module = { exports: {} as any }
  runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    console: { log() {}, trace() {}, error() {} },
    process,
    setTimeout,
    clearTimeout,
    structuredClone,
    ...globals,
    require(name: string) {
      return Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : require(name)
    }
  })
  return module.exports
}
