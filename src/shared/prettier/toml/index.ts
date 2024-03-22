import taplo from '@taplo/lib'
import { languages } from './languages.js'
import { prettierOptionsDefinitions } from './options.js'
const PLUGIN_NAME = 'toml'
let taploIns: any
async function format(code: any, options: any) {
  if (!taploIns) {
    taploIns = await taplo.Taplo.initialize()
  }
  return taploIns.format(code, { options })
}
const TomlPlugin = {
  languages,
  parsers: {
    [PLUGIN_NAME]: {
      parse(code: any, options: any) {
        return format(code.trim(), {
          ...options,
          columnWidth: options.printWidth,
          indentString: options.useTabs ? '\t' : ' '.repeat(options.tabWidth),
          trailingNewline: true,
          arrayTrailingComma: options.trailingComma !== 'none',
          crlf: options.endOfLine === 'crlf'
        })
      },
      astFormat: PLUGIN_NAME,
      locStart: () => -1,
      locEnd: () => -1
    }
  },
  printers: {
    [PLUGIN_NAME]: {
      print: ({ node }: any) => node
    }
  },
  options: prettierOptionsDefinitions
}
export default TomlPlugin
