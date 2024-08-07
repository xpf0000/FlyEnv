const fs = require('fs')
const path = require('path')
const compressing = require('7zip-min-electron')
const crypto = require('crypto')
const { copyFile, appendFile } = require('fs-extra')

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

export function getAllFileAsync(fp: string, fullpath = true) {
  return new Promise<Array<string>>((resolve) => {
    fs.stat(fp, (_: any, stat: any) => {
      if (stat.isFile()) {
        resolve([fp])
      } else if (stat.isDirectory()) {
        let arr: Array<string> = []
        const subs: Array<Promise<Array<string>>> = []
        fs.readdir(fp, (_: any, paths: Array<string>) => {
          paths.forEach((item, index) => {
            const fPath = path.join(fp, item)
            fs.stat(fPath, (_: any, stat: any) => {
              if (stat.isDirectory()) {
                subs.push(getAllFileAsync(fPath, fullpath))
              }
              if (stat.isFile()) {
                arr.push(fullpath ? fPath : item)
              }
              if (index === paths.length - 1) {
                if (subs.length > 0) {
                  Promise.all(subs).then((arrs) => {
                    arr = arr.concat(...arrs)
                    resolve(arr)
                  })
                } else {
                  resolve(arr)
                }
              }
            })
          })
        })
      }
    })
  })
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
  if (fs.existsSync(fp)) {
    return true
  }
  const arr = fp.split(path.sep)
  let dir = arr.shift()
  for (const p of arr) {
    dir = path.join(dir, p)
    if (!fs.existsSync(dir)) {
      console.log('createFolder: ', dir)
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
      reject(new Error(`文件不存在: ${fp}`))
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

export function zipUnPack(fp: string, dist: string) {
  console.log('zipUnPack start: ', fp, dist, global.Server.Static!)
  return new Promise(async (resolve, reject) => {
    const info = {
      fp,
      dist,
      static: global.Server.Static,
      isIncludes: fp.includes(global.Server.Static!)
    }
    await appendFile(path.join(global.Server.BaseDir!, 'debug.log'), `[zipUnPack][info]: ${JSON.stringify(info, undefined, 4)}\n`)      
    if (fp.includes(global.Server.Static!)) {
      const cacheFP = path.join(global.Server.Cache!, path.basename(fp))
      if (!fs.existsSync(cacheFP)) {
        try {
          await copyFile(fp, cacheFP)
        } catch(e) {
          await appendFile(path.join(global.Server.BaseDir!, 'debug.log'), `[zipUnPack][copyFile][error]: ${e}\n`)      
        }
      }
      fp = cacheFP
      console.log('cacheFP: ', fp)
    }
    compressing.unpack(fp, dist, async (err: any, res: any) => {
      console.log('zipUnPack end: ', err, res)
      if (err) {
        await appendFile(path.join(global.Server.BaseDir!, 'debug.log'), `[zipUnPack][unpack][error]: ${err}\n`)      
        reject(err)
        return
      }
      resolve(true)
    })
  })
}

// 读取文件并计算其MD5和SHA256
export function getFileHashes(filePath: string, algorithm: 'sha1' | 'sha256' | 'md5' = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
 
    stream.on('error', (err: any) => {
      reject(err);
    });
 
    stream.on('data', (chunk: any) => {
      hash.update(chunk);
    });
 
    stream.on('end', () => {
      const md5 = hash.digest('hex');
      resolve(md5);
    });
  });
}