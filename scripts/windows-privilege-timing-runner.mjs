import { registerHooks, createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 本诊断不通过 esbuild 子进程转换 TS，避免编译服务启动混入测试或被设备策略拦截。
// 使用项目已有 TypeScript，在进程内转换，并按照项目 tsconfig 的别名解析生产源码。
const require = createRequire(import.meta.url)
const ts = require('typescript')
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const aliases = { '@shared/': 'src/shared/', '@lang/': 'src/lang/', '@/': 'src/render/' }
registerHooks({
  resolve(specifier, context, nextResolve) {
    let url
    const alias = Object.entries(aliases).find(([prefix]) => specifier.startsWith(prefix))
    if (alias) url = pathToFileURL(resolve(workspace, alias[1] + specifier.slice(alias[0].length)))
    else if (specifier.startsWith('.') && context.parentURL) url = new URL(specifier, context.parentURL)
    if (url?.protocol === 'file:') {
      const base = fileURLToPath(url)
      for (const candidate of [base, `${base}.ts`, `${base}.js`, resolve(base, 'index.ts')]) {
        try {
          if (statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context)
        } catch { /* 尝试标准扩展名；最终仍由 Node 报原模块解析错误。 */ }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        fileName: fileURLToPath(url),
        compilerOptions: {
          target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
          esModuleInterop: true, sourceMap: false
        }
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  }
})
const entry = resolve(workspace, 'scripts/windows-privilege-timing-test.ts')
process.argv[1] = entry
await import(pathToFileURL(entry).href)
