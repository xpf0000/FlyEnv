import {
  camelCase,
  isEmpty,
  isFunction,
  kebabCase
} from 'lodash'
import { userKeys, systemKeys, needRestartKeys } from './configKeys'
import { spawn } from 'child_process'

export function changeKeysCase (obj, caseConverter) {
  const result = {}
  if (isEmpty(obj) || !isFunction(caseConverter)) {
    return result
  }

  for (const [k, value] of Object.entries(obj)) {
    const key = caseConverter(k)
    result[key] = value
  }

  return result
}

export function changeKeysToCamelCase (obj) {
  return changeKeysCase(obj, camelCase)
}

export function changeKeysToKebabCase (obj) {
  return changeKeysCase(obj, kebabCase)
}

export function separateConfig (options) {
  // user
  const user = {}
  // system
  const system = {}
  // others
  const others = {}

  for (const [k, v] of Object.entries(options)) {
    if (userKeys.indexOf(k) !== -1) {
      user[k] = v
    } else if (systemKeys.indexOf(k) !== -1) {
      system[k] = v
    } else {
      others[k] = v
    }
  }
  return {
    user, system, others
  }
}

const supportRtlLocales = [
  /* 'العربية', Arabic */
  'ar',
  /* 'فارسی', Persian */
  'fa',
  /* 'עברית', Hebrew */
  'he',
  /* 'Kurdî / كوردی', Kurdish */
  'ku',
  /* 'پنجابی', Western Punjabi */
  'pa',
  /* 'پښتو', Pashto, */
  'ps',
  /* 'سنڌي', Sindhi */
  'sd',
  /* 'اردو', Urdu */
  'ur',
  /* 'ייִדיש', Yiddish */
  'yi'
]
export function isRTL (locale = 'en-US') {
  return supportRtlLocales.includes(locale)
}

export function getLangDirection (locale = 'en-US') {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

export function checkIsNeedRestart (changed = {}) {
  let result = false
  if (isEmpty(changed)) {
    return result
  }
  const kebabCaseChanged = changeKeysToKebabCase(changed)
  needRestartKeys.some((key) => {
    if (kebabCaseChanged.hasOwnProperty(key)) {
      result = true
      return true
    }
  })
  return result
}

export const checkIsNeedRun = (enable, lastTime, interval) => {
  if (!enable) {
    return false
  }
  return (Date.now() - lastTime > interval)
}

export function hasClass (element, cls) {
  return (' ' + element.className + ' ').indexOf(' ' + cls + ' ') > -1
}

export function execAsync (command, arg = [], options = {}) {
  return new Promise((resolve, reject) => {
    // console.log('process.env: ', process.env)
    let optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      if (optdefault.env['PATH'].indexOf('/usr/local/bin') < 0) {
        optdefault.env['PATH'] = `/usr/local/bin:${optdefault.env['PATH']}`
      }
    }
    let opt = { ...optdefault, ...options }
    const cp = spawn(command, arg, opt)
    let stdout = []; let stderr = []
    cp.stdout.on('data', (data) => {
      stdout.push(data.toString().trim())
    })

    cp.stderr.on('data', (data) => {
      stderr.push(data.toString().trim())
    })

    cp.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.join('\r\n'))
      } else {
        reject(stderr.join('\r\n'))
      }
    })
  })
}

export function uuid (length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export function formatBytes (bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
