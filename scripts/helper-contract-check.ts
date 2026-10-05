import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

type ArgSpec = {
  name: string
  type: 'string' | 'boolean' | 'number' | 'string[]' | 'processStartIdentity[]' | 'object'
  optional?: boolean
}

type MethodSpec = {
  module: string
  function: string
  args: ArgSpec[]
  return: string
  platform: string
  privileged: boolean
  pathAccess?: string
}

type Contract = {
  methods: MethodSpec[]
}

type HelperCall = {
  file: string
  line: number
  module: string
  fn: string
  args: ts.Expression[]
}

const repoRoot = process.cwd()
const contractPath = path.join(repoRoot, 'src/helper-go/contract/helper-contract.json')
const helperTsPath = path.join(repoRoot, 'src/fork/Helper.ts')
const helperGoPath = path.join(repoRoot, 'src/helper-go/main.go')
const sourceRoots = ['src/main', 'src/fork', 'src/shared', 'src/render'].map((p) =>
  path.join(repoRoot, p)
)

const errors: string[] = []
const warnings: string[] = []

function methodKey(module: string, fn: string) {
  return `${module}/${fn}`
}

function readContract(): Contract {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8')) as Contract
  const seen = new Set<string>()
  for (const method of contract.methods) {
    const key = methodKey(method.module, method.function)
    if (seen.has(key)) {
      errors.push(`Duplicate contract method: ${key}`)
    }
    seen.add(key)
    const firstOptional = method.args.findIndex((arg) => arg.optional)
    if (firstOptional >= 0 && method.args.slice(firstOptional).some((arg) => !arg.optional)) {
      errors.push(`Optional args must be trailing for ${key}`)
    }
  }
  return contract
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === 'dist') continue
      out.push(...walkFiles(full))
    } else if (/\.(ts|tsx|js|jsx)$/.test(item.name)) {
      out.push(full)
    }
  }
  return out
}

function stringLiteralText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  return undefined
}

function literalKind(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'string'
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'boolean'
  }
  if (ts.isNumericLiteral(node)) return 'number'
  if (ts.isArrayLiteralExpression(node)) return 'array'
  if (ts.isObjectLiteralExpression(node)) return 'object'
  return undefined
}

function checkArgType(call: HelperCall, spec: MethodSpec, arg: ArgSpec, node: ts.Expression) {
  const actual = literalKind(node)
  if (!actual) return

  const loc = `${path.relative(repoRoot, call.file)}:${call.line}`
  if (arg.type === 'string[]' || arg.type === 'processStartIdentity[]') {
    if (actual !== 'array') {
      errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} must be an array`)
      return
    }
    const arr = node as ts.ArrayLiteralExpression
    for (const element of arr.elements) {
      if (
        arg.type === 'string[]' &&
        literalKind(element as ts.Expression) &&
        literalKind(element as ts.Expression) !== 'string'
      ) {
        errors.push(
          `${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} contains a non-string literal`
        )
      }
      if (arg.type === 'processStartIdentity[]' && ts.isObjectLiteralExpression(element)) {
        // 调用点的常量身份也需符合协议；Go 运行时会再次检查。创建时间来源与路径
        // 决定执行端能否安全重查该 PID。
        const properties = new Map<string, ts.Expression>()
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) {
            errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} has an invalid identity property`)
            continue
          }
          const key = property.name.getText().replace(/^['"]|['"]$/g, '')
          if (!['pid', 'created', 'source', 'path'].includes(key)) {
            errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} identity has unknown field ${key}`)
          }
          properties.set(key, property.initializer)
        }
        for (const key of ['pid', 'created', 'source']) {
          if (!properties.has(key)) {
            errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} identity is missing ${key}`)
          }
        }
        for (const key of ['created', 'source', 'path']) {
          const value = properties.get(key)
          if (value && literalKind(value) && literalKind(value) !== 'string') {
            errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} identity ${key} must be a string`)
          }
        }
        const source = properties.get('source')
        const sourceValue = source && stringLiteralText(source)
        // v34 后代来源只属于 kill 的显式服务集合；端口/普通字面量请求不能借此
        // 绕过 EXE 约束。动态 mode 的最终边界仍由 Go 执行器校验。
        const allowsDescendant =
          spec.module === 'tools' &&
          spec.function === 'kill' &&
          call.args.length >= 4 &&
          call.args[2].kind !== ts.SyntaxKind.FalseKeyword
        if (
          sourceValue &&
          sourceValue !== 'startTime' &&
          sourceValue !== 'cim' &&
          !(sourceValue === 'cim-descendant' && allowsDescendant)
        ) {
          errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} identity has invalid source ${sourceValue}`)
        }
        if (sourceValue === 'cim' && !properties.has('path')) {
          errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} CIM identity is missing path`)
        }
        const pid = properties.get('pid')
        if (pid && literalKind(pid) && literalKind(pid) !== 'number') {
          errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} identity pid must be a number`)
        }
      }
    }
    return
  }

  if (arg.type === 'object') {
    if (actual !== 'object') {
      errors.push(`${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} must be object`)
    }
    return
  }

  if (actual !== arg.type) {
    errors.push(
      `${loc} ${methodKey(spec.module, spec.function)} arg ${arg.name} must be ${arg.type}, got ${actual}`
    )
  }
}

function collectHelperCalls(): HelperCall[] {
  const calls: HelperCall[] = []
  const files = sourceRoots.flatMap(walkFiles)

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Helper' &&
        node.expression.name.text === 'send' &&
        node.arguments.length >= 2
      ) {
        const module = stringLiteralText(node.arguments[0])
        const fn = stringLiteralText(node.arguments[1])
        if (module && fn) {
          const pos = source.getLineAndCharacterOfPosition(node.getStart(source))
          calls.push({
            file,
            line: pos.line + 1,
            module,
            fn,
            args: node.arguments.slice(2)
          })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(source)
  }

  return calls
}

function extractTypeUnion(typeName: 'Module' | 'FN'): Set<string> {
  const text = fs.readFileSync(helperTsPath, 'utf-8')
  const pattern =
    typeName === 'Module' ? /type Module =([\s\S]*?)type FN =/ : /type FN =([\s\S]*?)class Helper/
  const match = text.match(pattern)
  if (!match) {
    errors.push(`Unable to find ${typeName} union in src/fork/Helper.ts`)
    return new Set()
  }
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
}

function extractGoDispatch(): Map<string, Set<string>> {
  const text = fs.readFileSync(helperGoPath, 'utf-8')
  const dispatch = new Map<string, Set<string>>()
  let currentModule = ''

  for (const line of text.split(/\r?\n/)) {
    const moduleMatch = line.match(/^\t\tcase "([^"]+)":/)
    if (moduleMatch) {
      currentModule = moduleMatch[1]
      if (!dispatch.has(currentModule)) dispatch.set(currentModule, new Set())
      continue
    }

    const fnMatch = line.match(/^\t\t\tcase "([^"]+)":/)
    if (fnMatch && currentModule) {
      dispatch.get(currentModule)?.add(fnMatch[1])
    }
  }

  return dispatch
}

function checkContractAgainstTypes(contract: Contract) {
  const modules = extractTypeUnion('Module')
  const functions = extractTypeUnion('FN')

  for (const method of contract.methods) {
    if (!modules.has(method.module)) {
      errors.push(
        `${methodKey(method.module, method.function)} module missing from Helper.ts Module union`
      )
    }
    if (!functions.has(method.function)) {
      errors.push(
        `${methodKey(method.module, method.function)} function missing from Helper.ts FN union`
      )
    }
  }
}

function checkContractAgainstDispatch(contract: Contract) {
  const dispatch = extractGoDispatch()
  const contractKeys = new Set(contract.methods.map((m) => methodKey(m.module, m.function)))

  for (const method of contract.methods) {
    if (!dispatch.get(method.module)?.has(method.function)) {
      errors.push(`${methodKey(method.module, method.function)} missing from Go dispatch`)
    }
  }

  for (const [module, functions] of dispatch) {
    for (const fn of functions) {
      const key = methodKey(module, fn)
      if (!contractKeys.has(key)) {
        errors.push(`${key} exists in Go dispatch but is missing from contract`)
      }
    }
  }
}

function checkCalls(contract: Contract) {
  const specs = new Map(
    contract.methods.map((method) => [methodKey(method.module, method.function), method])
  )
  const calls = collectHelperCalls()
  const called = new Set<string>()

  for (const call of calls) {
    const key = methodKey(call.module, call.fn)
    called.add(key)
    const spec = specs.get(key)
    const loc = `${path.relative(repoRoot, call.file)}:${call.line}`
    if (!spec) {
      errors.push(`${loc} calls ${key}, but it is not in helper contract`)
      continue
    }

    const minArgs = spec.args.filter((arg) => !arg.optional).length
    const maxArgs = spec.args.length
    if (call.args.length < minArgs || call.args.length > maxArgs) {
      errors.push(
        `${loc} calls ${key} with ${call.args.length} args, expected ${minArgs}-${maxArgs}`
      )
      continue
    }

    call.args.forEach((node, index) => {
      const arg = spec.args[index]
      if (arg) checkArgType(call, spec, arg, node)
    })
  }

  const unused = contract.methods
    .map((method) => methodKey(method.module, method.function))
    .filter((key) => !called.has(key) && key !== 'helper/version' && key !== 'helper/health')
  if (unused.length > 0) {
    warnings.push(`Contract methods not currently called by TS: ${unused.join(', ')}`)
  }
}

const contract = readContract()
checkContractAgainstTypes(contract)
checkContractAgainstDispatch(contract)
checkCalls(contract)

for (const warning of warnings) {
  console.warn(`helper-contract warning: ${warning}`)
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`helper-contract error: ${error}`)
  }
  process.exit(1)
}

console.log(
  `helper-contract: ${contract.methods.length} methods and Helper.send call sites validated`
)
