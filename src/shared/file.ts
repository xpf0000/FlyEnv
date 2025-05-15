const fs = require('fs')
const path = require('path')
const { existsSync, readdir, appendFile } = require('fs-extra')

export function getAllFile(fp: string, fullpath = true) {
  let arr: Array<string> = []
  if (!fs.existsSync(fp)) {
    return arr
  }
  const state = fs.statSync(fp)
  if (state.isFile()) {
    return [fp]
  }
  const files = fs.readdirSync(fp)
  files.forEach(function (item: string) {
    const fPath = path.join(fp, item)
    if (fs.existsSync(fPath)) {
      const stat = fs.statSync(fPath)
      if (stat.isDirectory()) {
        const sub = getAllFile(fPath, fullpath)
        arr = arr.concat(sub)
      }
      if (stat.isFile()) {
        arr.push(fullpath ? fPath : item)
      }
    }
  })
  return arr
}

export const getAllFileAsync = async (
  dirPath: string,
  fullpath = true,
  basePath: Array<string> = []
): Promise<string[]> => {
  if (!existsSync(dirPath)) {
    return []
  }
  const list: Array<string> = []
  const files = await readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const arr = [...basePath]
    arr.push(file.name)
    const childPath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      const sub = await getAllFileAsync(childPath, fullpath, arr)
      list.push(...sub)
    } else if (file.isFile()) {
      const name = fullpath ? childPath : arr.join('/')
      list.push(name)
    }
  }
  return list
}

export function getSubDir(fp: string, fullpath = true) {
  const arr: Array<string> = []
  if (!fs.existsSync(fp)) {
    return arr
  }
  const stat = fs.statSync(fp)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    try {
      const files = fs.readdirSync(fp)
      files.forEach(function (item: string) {
        const fPath = path.join(fp, item)
        if (fs.existsSync(fPath)) {
          const stat = fs.statSync(fPath)
          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            arr.push(fullpath ? fPath : item)
          }
        }
      })
    } catch (e) {
      console.log(e)
    }
  }
  return arr
}

export function chmod(fp: string, mode: string) {
  if (fs.statSync(fp).isFile()) {
    fs.chmodSync(fp, mode)
    return
  }
  const files = fs.readdirSync(fp)
  files.forEach(function (item: string) {
    const fPath = path.join(fp, item)
    fs.chmodSync(fPath, mode)
    const stat = fs.statSync(fPath)
    if (stat.isDirectory() === true) {
      chmod(fPath, mode)
    }
  })
}

export function createFolder(fp: string) {
  fp = fp.replace(/\\/g, '/')
  if (fs.existsSync(fp)) {
    return true
  }
  const arr = fp.split('/')
  let dir = '/'
  for (const p of arr) {
    dir = path.join(dir, p)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  }
  return fs.existsSync(fp)
}

export function writeFileAsync(fp: string, content: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(fp, content, (err: Error) => {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

export function readFileAsync(fp: string, encode = 'utf-8') {
  return new Promise<string>((resolve, reject) => {
    if (!fs.existsSync(fp)) {
      reject(new Error(`File does not exist: ${fp}`))
    }
    fs.readFile(fp, encode, (err: Error, data: string) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

export async function appDebugLog(flag: string, info: string) {
  try {
    const debugFile = path.join(global.Server.BaseDir!, 'debug.log')
    await appendFile(debugFile, `${flag}: ${info}\n`)
  } catch (e) {}
}
