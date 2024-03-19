import * as _ from 'lodash'

const copySymbolsToObj = (src: any, dest: any) => {
  const srcSymbols = Object.getOwnPropertySymbols(src)
  for (const srcSymbol of srcSymbols) {
    dest[srcSymbol] = src[srcSymbol]
  }
}

export const JSONSort = (obj: any, order: 'desc' | 'asc' = 'asc') => {
  if (_.isArray(obj)) {
    const array: any[] = _.map(obj, function (value) {
      if (!_.isNumber(value) && !_.isFunction(value) && _.isObject(value)) {
        return JSONSort(value, order)
      } else {
        return value
      }
    })
    copySymbolsToObj(obj, array)
    return array
  } else {
    const keys = _.orderBy(_.keys(obj), [], [order])
    const newObj = _.zipObject(
      keys,
      _.map(keys, function (key) {
        if (!_.isNumber(obj[key]) && !_.isFunction(obj[key]) && _.isObject(obj[key])) {
          obj[key] = JSONSort(obj[key], order)
        }
        return obj[key]
      })
    )
    copySymbolsToObj(obj, newObj)
    return newObj
  }
}
