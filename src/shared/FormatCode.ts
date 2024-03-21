import prettier from 'prettier/standalone'
import parseHtml from 'prettier/plugins/html'
import parseCommon from 'prettier/plugins/babel'
import parseCss from 'prettier/plugins/postcss'
import parseYaml from 'prettier/plugins/yaml'
import parseTS from 'prettier/plugins/typescript'
import parseES from 'prettier/plugins/estree'
// @ts-ignore
import * as parsePHP from '@prettier/plugin-php/standalone'
const parseTOML = require('prettier-plugin-toml')
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

export const FormatTS = async (value: string) => {
  return await prettier.format(value, {
    parser: 'typescript',
    plugins: [parseES, parseTS]
  })
}

export const FormatPHP = async (value: string) => {
  return await prettier.format(value, {
    parser: 'php',
    plugins: [parsePHP]
  })
}

export const FormatTOML = async (value: string) => {
  return await prettier.format(value, {
    parser: 'toml',
    plugins: [parseTOML]
  })
}
