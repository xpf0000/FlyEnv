import * as TOML from '@ltd/j-toml'

const TOML_STRINGIFY_OPTIONS = {
  newline: '\n',
  integer: Number.MAX_SAFE_INTEGER
} as const

export function parseToml(content: string): any {
  return TOML.parse(content)
}

export function stringifyToml(value: any): string {
  return TOML.stringify(value, TOML_STRINGIFY_OPTIONS)
}
