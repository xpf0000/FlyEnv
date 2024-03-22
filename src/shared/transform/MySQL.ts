// @ts-ignore
import { mysql } from 'generate-schema'
export const JsonToMySQL = (json: any) => {
  return mysql(json)
}
