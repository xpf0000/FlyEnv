import crypto from 'crypto'

export function uuid(length = 32) {
  const num = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += num.charAt(Math.floor(Math.random() * num.length))
  }
  return str
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function md5(str: string) {
  const md5 = crypto.createHash('md5')
  return md5.update(str).digest('hex')
}

export function pathFixedToUnix(path: string) {
  return path.split('\\').join('/')
}
