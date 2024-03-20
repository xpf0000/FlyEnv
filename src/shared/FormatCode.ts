import prettier from 'prettier/standalone'
import parseHtml from 'prettier/plugins/html'
import parseCommon from 'prettier/plugins/babel'
import parseCss from 'prettier/plugins/postcss'
import parseYaml from 'prettier/plugins/yaml'
export const FormatHtml = async (value: string) => {
  return await prettier.format(value, {
    parser: 'html',
    plugins: [parseCommon, parseCss, parseHtml],
    bracketSameLine: true,
    trailingComma: 'all',
    tabWidth: 4,
    semi: true,
    htmlWhitespaceSensitivity: 'ignore'
  })
}

export const FormatYaml = async (value: string) => {
  return await prettier.format(value, {
    parser: 'yaml',
    plugins: [parseYaml]
  })
}
