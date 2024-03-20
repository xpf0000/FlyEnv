import { Engine } from 'php-parser'
const parser = new Engine({
  parser: { extractDoc: true },
  ast: { withPositions: true }
})

const parseValue = (expr: any): any => {
  switch (expr?.kind) {
    case 'array':
      if (expr.items.length === 0) {
        return []
      }
      const isKeyed = expr.items.every((item: any) => item.key !== null)
      let items = expr.items.map(parseValue)
      if (isKeyed) {
        items = items.reduce((acc: any, val: any) => Object.assign({}, acc, val), {})
      }
      return items
    case 'entry':
      if (expr.key) {
        return { [parseKey(expr.key)]: parseValue(expr.value) }
      }
      return parseValue(expr.value)
    case 'string':
      return expr.value
    case 'number':
      return parseInt(expr.value, 10)
    case 'boolean':
      return expr.value
    default:
      throw new Error(`Unexpected PHP value: "${expr.kind}", details: ${JSON.stringify(expr)}`)
  }
}

const parseKey = (expr: any) => {
  switch (expr.kind) {
    case 'string':
      return expr.value
    case 'number':
      return parseInt(expr.value, 10)
    case 'boolean':
      return expr.value ? 1 : 0
    default:
      throw new Error(`Unexpected PHP key: "${expr.kind}", details: ${JSON.stringify(expr)}`)
  }
}

export const PHPArrayParse = function (source: string) {
  const ast = parser.parseEval(source)
  console.log('PHPArrayParse ast: ', ast)
  const array: any = ast.children.find((child) => child.kind === 'expressionstatement')
  return parseValue(array?.expression)
}
