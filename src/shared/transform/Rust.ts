import { run } from 'json_typegen_wasm'

export const JsonToRust = (json: any) => {
  return run(
    'Root',
    JSON.stringify(json),
    JSON.stringify({
      output_mode: 'rust',
      property_name_format: 'camelCase'
    })
  )
}
