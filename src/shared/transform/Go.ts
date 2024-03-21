const jsonToGo = require('json-to-go')
export const JsonToGoBson = (json: any) => {
  return JSON.stringify(JSON.parse(json || '{}'), null, 4)
    .replace(/\{/gm, 'bson.M{')
    .replace(/\[/gm, 'bson.A{')
    .replace(/\]/gm, '}')
    .replace(/(\d|\w|")$/gm, '$1,')
    .replace(/(\}$)(\n)/gm, '$1,$2')
}

export const JsonToGo = (json: any) => {
  return jsonToGo(json).go
}
