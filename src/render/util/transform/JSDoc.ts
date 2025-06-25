function checkIfNeededToAddUndefinedType(this: any, obj: any, objectKey: string): any {
  const temporaryObject: any = {}
  let maxLenghtOfObject = 0

  Object.keys(obj).forEach((currentKey) => {
    // check if it's our Object,
    // like awards.editions in awards.editions.outcome
    if (currentKey.includes(objectKey) && currentKey !== objectKey) {
      temporaryObject[currentKey] = obj[currentKey]
    }
  })

  // We need to check the local maximum
  Object.keys(temporaryObject).forEach((key) => {
    const currentKeyLength = temporaryObject[key].length
    if (currentKeyLength > maxLenghtOfObject) maxLenghtOfObject = currentKeyLength
  })

  // If the maximum is bigger than the current value,
  // but only one child in, we can also have an undefined.
  Object.keys(temporaryObject).forEach((key) => {
    if (key.split('.').length < 2) {
      if (maxLenghtOfObject > temporaryObject[key].length) {
        this[key].push('undefined')
      }
    }
  })
}

function keepUniqueTypes(obj: any, jsonObjects: any) {
  const temporaryObject = obj
  const remainingObject: any = {}
  const numberOfJSONDefinitions = jsonObjects.length

  Object.keys(obj).forEach((objectKey) => {
    if (!objectKey.includes('.')) {
      if (obj[objectKey].length < numberOfJSONDefinitions) {
        temporaryObject[objectKey].push('undefined')
      }
    }

    obj[objectKey].forEach((anyValue: any) => {
      if (anyValue === 'object' || anyValue === 'object[]') {
        checkIfNeededToAddUndefinedType.bind(temporaryObject, obj, objectKey)()
      }
    })
  })

  Object.keys(temporaryObject).forEach((key) => {
    remainingObject[key] = getUnique(temporaryObject[key])
  })

  return remainingObject
}

/**
 * @param {Array} array - The array that needs to be ded-duplicated
 * @returns {Array}
 */
function getUnique(array: any[]) {
  const u: any = {}
  const a = []
  for (let i = 0, l = array.length; i < l; ++i) {
    if (u.hasOwnProperty(array[i])) continue
    a.push(array[i])
    u[array[i]] = 1
  }
  return a
}

/**
 * @param {*} value
 * @returns {string} currentType - lowerCased type of value
 */
function getTypeOfValue(value: any) {
  let currentType = Object.prototype.toString.call(value).split(' ')[1].slice(0, -1).toLowerCase()

  if (!currentType) currentType = '*'
  return currentType
}
/**
 * @param {Array} array - The array that we want to parse
 * @param {string} objectName - Usually the Prefix - Root do no have ObjectName
 */
function parseArray(this: any, array: any[], objectName: string): any {
  const currentArrayTypes: any[] = []
  const prefix = objectName ? `${objectName}` : ''

  array.forEach((currentValue) => {
    currentArrayTypes.push(`${getTypeOfValue(currentValue)}[]`)
  })

  if (!(objectName in this)) this[objectName] = []
  this[objectName].push(getUnique(currentArrayTypes).join('|'))

  array.forEach((currentValue) => {
    const currentValueType = getTypeOfValue(currentValue)

    if (currentValueType === 'array') {
      parseArray.bind(this, currentValue, prefix)()
    } else if (currentValueType === 'object') {
      parseObject.bind(this, currentValue, prefix, true)()
    }
  })
}
/**
 * @param {object} obj - The object that we want to parse
 * @param {string} objectName - Usually the Prefix - Root do no have ObjectName
 * @param {boolean} doNotReinsert - If we want to reinsert the type, usually when we parse
 * an array of objects, we do not want to reinsert.
 */
function parseObject(this: any, obj: any, objectName: string, doNotReinsert = false): any {
  const prefix = objectName ? `${objectName}.` : ''

  Object.keys(obj).forEach((propertyName) => {
    const currentValue = obj[propertyName]
    const propertyType = getTypeOfValue(currentValue)
    const currentPrefix = `${prefix}${propertyName}`
    let result = null

    // Root Object don't have a objectName
    if (!doNotReinsert && objectName) {
      if (!(objectName in this)) this[objectName] = []
      this[objectName].push('object')
    }

    // If it's Array, we need the values inside.
    if (propertyType === 'array') parseArray.bind(this, currentValue, currentPrefix)()
    else if (propertyType === 'object') parseObject.bind(this, currentValue, currentPrefix)()
    else {
      result = propertyType
      if (!(currentPrefix in this)) this[currentPrefix] = []
      this[currentPrefix].push(result)
    }
  })
}

function ParseRootDefinition(this: any, obj: any) {
  // 1. What is the default type for our Definition?
  const jsonType = Object.prototype.toString.call(obj)

  if (jsonType === '[object Array]') parseArray.bind(this, obj, null)()
  else if (jsonType === '[object Object]') parseObject.bind(this, obj, null)()
}

/**
 * @param {Object} obj
 * @param {Object[]} jsonObjects
 */
function printTheTypeDef(obj: any, jsonObjects: any) {
  let output = ''
  // 0. A default name for our Definition
  const jsonDef = 'json'
  const jsonTypes: any[] = []

  Object.keys(jsonObjects).forEach((key) => {
    jsonTypes.push(getTypeOfValue(jsonObjects[key]))
  })

  output = `/** @typedef {${getUnique(jsonTypes)}} ${jsonDef} \n`

  Object.keys(obj).forEach((key) => {
    output += `* @property {${obj[key].join('|')}} ${key} \n`
  })

  output += '*/'

  return output
}

/**
 * @param {Array} jsonObjects
 */
function goThroughAndParse(jsonObjects: any) {
  const theObjectDefinition = {}
  jsonObjects.forEach((obj: any) => ParseRootDefinition.bind(theObjectDefinition, obj)())
  return printTheTypeDef(keepUniqueTypes(theObjectDefinition, jsonObjects), jsonObjects)
}

export function JsonToJSDoc(json: any) {
  const jsonObjects = []
  jsonObjects.push(json)
  return goThroughAndParse(jsonObjects)
}
