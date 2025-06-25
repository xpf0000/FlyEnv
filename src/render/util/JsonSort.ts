import { isArray, map, isNumber, isFunction, isObject, orderBy, zipObject, keys } from 'lodash-es'

const copySymbolsToObj = (src: any, dest: any) => {
  const srcSymbols = Object.getOwnPropertySymbols(src)
  for (const srcSymbol of srcSymbols) {
    dest[srcSymbol] = src[srcSymbol]
  }
}

export const JSONSort = (obj: any, order: 'desc' | 'asc' = 'asc') => {
  if (isArray(obj)) {
    const array: any[] = map(obj, function (value) {
      if (!isNumber(value) && !isFunction(value) && isObject(value)) {
        return JSONSort(value, order)
      } else {
        return value
      }
    })
    copySymbolsToObj(obj, array)
    return array
  } else {
    const _keys = orderBy(keys(obj), [], [order])
    const newObj = zipObject(
      _keys,
      map(_keys, function (key) {
        if (!isNumber(obj[key]) && !isFunction(obj[key]) && isObject(obj[key])) {
          obj[key] = JSONSort(obj[key], order)
        }
        return obj[key]
      })
    )
    copySymbolsToObj(obj, newObj)
    return newObj
  }
}
