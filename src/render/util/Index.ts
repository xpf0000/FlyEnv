import MD5 from 'crypto-js/md5'
import { reactive } from 'vue'

export function md5(str: string) {
  return MD5(str).toString()
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function parseTime(time: any, cFormat: string) {
  if (arguments.length === 0) {
    return null
  }
  const format = cFormat || '{y}-{m}-{d} {h}:{i}:{s}'
  let date
  if (typeof time === 'object') {
    date = time
  } else {
    if (typeof time === 'string' && /^[0-9]+$/.test(time)) {
      time = parseInt(time)
    }
    if (typeof time === 'number' && time.toString().length === 10) {
      time = time * 1000
    }
    date = new Date(time)
  }
  const formatObj: { [key: string]: any } = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay()
  }
  const time_str = format.replace(/{(y|m|d|h|i|s|a)+}/g, (result, key) => {
    let value = formatObj[key]
    if (key === 'a') {
      return ['日', '一', '二', '三', '四', '五', '六'][value]
    }
    if (result.length > 0 && value < 10) {
      value = '0' + value
    }
    return value || 0
  })
  return time_str
}

export function formatTime(time: any, option: string) {
  if (('' + time).length === 10) {
    time = parseInt(time) * 1000
  } else {
    time = +time
  }
  const d = new Date(time)
  const now = Date.now()

  // @ts-ignore
  const diff = (now - d) / 1000

  if (diff < 30) {
    return '刚刚'
  } else if (diff < 3600) {
    // less 1 hour
    return Math.ceil(diff / 60) + '分钟前'
  } else if (diff < 3600 * 24) {
    return Math.ceil(diff / 3600) + '小时前'
  } else if (diff < 3600 * 24 * 2) {
    return '1天前'
  }
  if (option) {
    return parseTime(time, option)
  } else {
    return (
      d.getMonth() + 1 + '月' + d.getDate() + '日' + d.getHours() + '时' + d.getMinutes() + '分'
    )
  }
}

export function paramObj(url: string) {
  const search = url.split('?')[1]
  if (!search) {
    return {}
  }
  return JSON.parse(
    '{"' +
      decodeURIComponent(search)
        .replace(/"/g, '\\"')
        .replace(/&/g, '","')
        .replace(/=/g, '":"')
        .replace(/\+/g, ' ') +
      '"}'
  )
}

export function tenBitTimestamp(time: number) {
  const date = new Date(time * 1000)
  const y = date.getFullYear()
  let m: number | string = date.getMonth() + 1
  m = m < 10 ? '' + m : m
  let d: number | string = date.getDate()
  d = d < 10 ? '' + d : d
  let h: number | string = date.getHours()
  h = h < 10 ? '0' + h : h
  let minute: number | string = date.getMinutes()
  let second: number | string = date.getSeconds()
  minute = minute < 10 ? '0' + minute : minute
  second = second < 10 ? '0' + second : second
  return y + '年' + m + '月' + d + '日 ' + h + ':' + minute + ':' + second // 组合
}

export function thirteenBitTimestamp(time: number) {
  const date = new Date(time / 1)
  const y = date.getFullYear()
  let m: number | string = date.getMonth() + 1
  m = m < 10 ? '' + m : m
  let d: number | string = date.getDate()
  d = d < 10 ? '' + d : d
  let h: number | string = date.getHours()
  h = h < 10 ? '0' + h : h
  let minute: number | string = date.getMinutes()
  let second: number | string = date.getSeconds()
  minute = minute < 10 ? '0' + minute : minute
  second = second < 10 ? '0' + second : second
  return y + '年' + m + '月' + d + '日 ' + h + ':' + minute + ':' + second // 组合
}

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export function random(m: number, n: number) {
  return Math.floor(Math.random() * (m - n) + n)
}

export async function componentParse(component: any) {
  const type = Object.prototype.toString.call(component)
  let view
  switch (type) {
    case '[object Module]':
      view = component.default
      break
    case '[object Promise]':
      {
        const res = await component
        view = res.default
      }
      break
    default:
      view = component
      break
  }
  return view
}

export function fileSelect(accept = '', multiple = false) {
  return new Promise((resolve) => {
    let input: HTMLInputElement | null = document.createElement('input')
    input.setAttribute('type', 'file')
    input.setAttribute('accept', accept)
    if (multiple) {
      input.setAttribute('multiple', 'multiple')
    }
    input.onchange = () => {
      resolve(input!.files)
      input?.remove()
      input = null
    }
    input.click()
  })
}

/**
 * 将数组中的指定项移动到新位置
 * @param {Array} arr - 要操作的数组
 * @param {number} fromIndex - 要移动的项的原始索引
 * @param {number} toIndex - 要移动到的目标索引
 * @returns {Array} 新数组（不改变原数组）
 */
export function ArrayMoveItem(arr: any[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
    return [...arr]
  }

  const newArr = [...arr]
  const [item] = newArr.splice(fromIndex, 1)
  newArr.splice(toIndex, 0, item)
  return newArr
}

export function waitTime(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, time)
  })
}

export const emptyClick = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

export function reactiveBind<T extends object>(instance: T): T {
  const obj = reactive(instance)
  const proto = Object.getPrototypeOf(obj)
  console.log('reactiveBind proto', proto)
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue
    const val = (obj as any)[key]
    console.log('reactiveBind key: ', key, typeof val)
    if (typeof val === 'function') {
      ;(obj as any)[key] = val.bind(obj)
    }
  }
  return obj as T
}

export function reactiveBindObject<T extends object>(instance: T): T {
  const obj = reactive(instance)
  const keys = Object.getOwnPropertyNames(obj)
  console.log('reactiveBindObject keys', keys)
  for (const key of keys) {
    const val = (obj as any)[key]
    console.log('reactiveBindObject key: ', key, typeof val)
    if (typeof val === 'function' && key !== 'constructor') {
      ;(obj as any)[key] = val.bind(obj)
    }
  }
  return obj as T
}
