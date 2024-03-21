import JSON5 from 'json5'
import { PHPArrayParse } from './PHPArrayParse'
import PList from 'plist'
import XMLParse from './XMLParse'
import YAML from 'yamljs'
import { parse as TOMLParse } from '@iarna/toml'
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


