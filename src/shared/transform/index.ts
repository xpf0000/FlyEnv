import JSON5 from 'json5'
import { PHPArrayParse } from './PHPArrayParse'
import PList from 'plist'
import XMLParse from './XMLParse'
import YAML from 'yamljs'
import { parse as TOMLParse, stringify as TOMLStringify } from '@iarna/toml'
import JsonToTS from 'json-to-ts'

export const javascriptToJson = (str: string) => {
  return JSON5.parse(str)
}

export const phpToJson = (str: string) => {
  return PHPArrayParse(str)
}

export const plistToJson = (str: string) => {
  return PList.parse(str)
}

export const xmlToJson = (str: string) => {
  return XMLParse.XMLToJSON(str)
}

export const yamlToJson = (str: string) => {
  return YAML.parse(str)
}

export const tomlToJson = (str: string) => {
  return TOMLParse(str)
}

export const jsonToXML = (json: any) => {
  return XMLParse.JSONToXML(json)
}

export const jsonToPList = (json: any) => {
  return PList.build(json, {
    indent: '    '
  })
}

export const jsonToYAML = (json: any) => {
  return YAML.stringify(json, 4)
}

export const jsonToTs = (json: any) => {
  return JsonToTS(json).join('\n')
}

export const jsonToJSON = (json: any) => {
  return JSON5.stringify(json, {
    space: 4,
    quote: null
  })
}

export const jsonToTOML = (json: any) => {
  return TOMLStringify(json)
}
